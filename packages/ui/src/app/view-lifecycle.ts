/**
 * The `McpAppView` lifecycle as an explicit state machine (toolkit#176).
 *
 * Before the view payload exists the shell is in exactly one phase:
 *
 *   waiting ──result──▶ result
 *      │  ╲
 *      │   ╲──tool error / failed recovery──▶ error ──retry──▶ waiting
 *      │
 *      └──host cancelled──▶ cancelled (terminal: the user stopped it)
 *
 * `waiting` carries a `slow` flag once loading outlasts the slow-hint delay.
 * An `isError` result (or a failed call) is an `error`, never an endless
 * skeleton, and a retry re-runs the originating tool once on the user's click.
 * Pure functions only: the hook in `use-view-lifecycle.ts` feeds them.
 */
import { parseToolResult } from "../lib/parse-tool-result.js"

/** `useToolContext().status` of the rendering call. */
export type RenderCallStatus = "pending" | "ready" | "error"

/** The user-triggered retry of the rendering call. */
export type RetryState =
  | { status: "idle"; attempt: number }
  | { status: "running"; attempt: number }
  | { status: "failed"; attempt: number; reason: string | undefined }

export const RETRY_IDLE: RetryState = { status: "idle", attempt: 0 }

export type RetryAction =
  { type: "start" } | { type: "failed"; reason: string | undefined } | { type: "succeeded" }

/** start → running (next attempt); failed → failed with reason; succeeded → idle. */
export function retryReducer(state: RetryState, action: RetryAction): RetryState {
  switch (action.type) {
    case "start":
      return { status: "running", attempt: state.attempt + 1 }
    case "failed":
      return { status: "failed", attempt: state.attempt, reason: action.reason }
    case "succeeded":
      return { status: "idle", attempt: state.attempt }
  }
}

export interface ViewLifecycleInput {
  /** A renderable payload is in hand (host-delivered, recovered or retried). */
  hasViewData: boolean
  /** Status of the original rendering call. */
  callStatus: RenderCallStatus
  /** The host cancelled the original rendering call. */
  cancelled: boolean
  /** Message of the original call's error, when it failed. */
  callErrorReason: string | undefined
  /** The automatic stripped-result recovery ran and failed. */
  recoveryFailed: boolean
  /** The user-triggered retry. */
  retryState: RetryState
  /** Loading has outlasted the slow-hint delay. */
  slow: boolean
  /** The originating tool is known, so a retry can re-run it. */
  canRetry: boolean
}

export type ViewLifecycle =
  | { phase: "result" }
  | { phase: "waiting"; slow: boolean }
  | { phase: "cancelled" }
  | { phase: "error"; reason: string | undefined; canRetry: boolean }

/**
 * Resolve the single phase the view is in. Precedence: a payload always wins;
 * a running retry is waiting; a failed retry is an error with ITS reason; a
 * cancellation is terminal; a failed call or a failed recovery is an error;
 * everything else is still waiting.
 */
export function resolveViewLifecycle(input: ViewLifecycleInput): ViewLifecycle {
  if (input.hasViewData) return { phase: "result" }
  const { retryState } = input
  if (retryState.status === "running") return { phase: "waiting", slow: input.slow }
  if (retryState.status === "failed") {
    return { phase: "error", reason: retryState.reason, canRetry: input.canRetry }
  }
  if (input.cancelled) return { phase: "cancelled" }
  if (input.callStatus === "error") {
    return { phase: "error", reason: input.callErrorReason, canRetry: input.canRetry }
  }
  if (input.recoveryFailed) return { phase: "error", reason: undefined, canRetry: input.canRetry }
  return { phase: "waiting", slow: input.slow }
}

/**
 * Identity of the current wait, so the slow-hint timer restarts for every new
 * wait (the first load, then each retry attempt) and never for a finished one.
 * `null` when the view is not waiting.
 */
export function waitKey(lifecycle: ViewLifecycle, retryState: RetryState): string | null {
  return lifecycle.phase === "waiting" ? `${retryState.status}:${retryState.attempt}` : null
}

/** Default delay before the waiting placeholder adds its slow hint. */
export const DEFAULT_SLOW_HINT_MS = 8000

export type RetryOutcome<T> = { ok: true; data: T } | { ok: false; reason: string | undefined }

/**
 * Decode a retried rendering call: the payload when it is a complete view,
 * otherwise the reason — the `isError` text, or `undefined` for a payload the
 * shell cannot render.
 */
export function decodeRetryResult<T>(
  result: unknown,
  isValid: (value: unknown) => value is T,
): RetryOutcome<T> {
  let decoded: unknown
  try {
    decoded = parseToolResult<unknown>(result)
  } catch (err) {
    return { ok: false, reason: errorMessage(err) }
  }
  return isValid(decoded) ? { ok: true, data: decoded } : { ok: false, reason: undefined }
}

/** A displayable message for anything thrown. */
export function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message || undefined
  if (typeof err === "string") return err || undefined
  return undefined
}
