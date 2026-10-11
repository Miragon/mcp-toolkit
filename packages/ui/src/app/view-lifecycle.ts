/**
 * The `McpAppView` lifecycle as an explicit state machine (toolkit#176).
 *
 * Before the view payload exists the shell is in exactly one phase:
 *
 *   waiting ──result──▶ result
 *      │  ╲
 *      │   ╲──tool error / failed recovery / unrecoverable result──▶ error ──retry──▶ waiting
 *      │    ╲
 *      │     ╲──stripped result the policy must not re-load──▶ error (blocked)
 *      │
 *      └──host cancelled──▶ cancelled (terminal: the user stopped it)
 *
 * `waiting` carries a `slow` flag once loading outlasts the slow-hint delay.
 * An `isError` result (or a failed call) is an `error`, never an endless
 * skeleton, and a retry re-runs the originating tool once on the user's click.
 * A latched result that is no view on a host that names no originating tool
 * is an `error` too: nothing could recover it, so waiting would never end.
 * A `blocked` error is no failure: the tool ran, the host kept its result
 * from the view, and the recovery policy forbids re-running it. It offers to
 * load the view only for a tool the host does not report as writing, so one
 * click never runs a write a second time (CI §9).
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
  /**
   * The automatic stripped-result recovery ran and failed, or was needed but
   * could not run because the host names no tool.
   */
  recoveryFailed: boolean
  /**
   * The host did not pass the result to the view, and the recovery policy
   * forbids re-running the tool: it ran, but the view never got its result.
   * Default `false`.
   */
  recoveryBlocked?: boolean
  /**
   * The host reports the originating tool as writing (`readOnlyHint: false`
   * or `destructiveHint: true`). A blocked state then offers no retry: one
   * click would run the write a second time. Default `false`.
   */
  toolWrites?: boolean
  /** The user-triggered retry. */
  retryState: RetryState
  /** Loading has outlasted the slow-hint delay. */
  slow: boolean
  /** The originating tool is known, so a retry can re-run it. */
  canRetry: boolean
}

/**
 * What an `error` phase stands for: `"failed"` (the call, the recovery or the
 * retry failed) or `"blocked"` (the tool ran, but the host did not pass its
 * result to the view, and the recovery policy keeps the view from re-running it).
 */
export type ViewErrorKind = "failed" | "blocked"

export type ViewLifecycle =
  | { phase: "result" }
  | { phase: "waiting"; slow: boolean }
  | { phase: "cancelled" }
  | {
      phase: "error"
      reason: string | undefined
      canRetry: boolean
      /** Absent for a failure; `"blocked"` for a result the view must not re-load. */
      kind?: ViewErrorKind
    }

/**
 * Resolve the single phase the view is in. Precedence: a payload always wins;
 * a running retry is waiting; a failed retry is an error with ITS reason; a
 * cancellation is terminal; a failed call is an error; a blocked recovery is
 * a `blocked` error, retryable only for a tool not reported as writing; a
 * failed recovery or a latched non-view result nothing can recover is an
 * error; everything else is still waiting.
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
  if (input.recoveryBlocked) {
    const canRetry = input.canRetry && !input.toolWrites
    return { phase: "error", reason: undefined, canRetry, kind: "blocked" }
  }
  if (input.recoveryFailed) return { phase: "error", reason: undefined, canRetry: input.canRetry }
  // A latched result without a renderable view: the recovery re-runs the
  // originating tool, so it can only help when the host names that tool.
  if (input.callStatus === "ready" && !input.canRetry) {
    return { phase: "error", reason: undefined, canRetry: false }
  }
  return { phase: "waiting", slow: input.slow }
}

/**
 * The phase with its slow flag: a wait turns slow only while the wait that
 * outlasted the delay (`slowWait`, a {@link waitKey}) is still the current one,
 * so a new attempt starts without the hint.
 */
export function withSlowHint(
  lifecycle: ViewLifecycle,
  slowWait: string | null,
  currentWait: string | null,
): ViewLifecycle {
  return lifecycle.phase === "waiting" && slowWait !== null && slowWait === currentWait
    ? { phase: "waiting", slow: true }
    : lifecycle
}

/**
 * Where keyboard focus goes after the user pressed retry (the button unmounts
 * as the view starts waiting): the view frame while waiting, the new retry
 * button when the retry failed, the frame again once the view or a
 * cancellation replaced the state. `settled` ends the hand-off.
 */
export function retryFocusTarget(phase: ViewLifecycle["phase"]): {
  target: "frame" | "retry"
  settled: boolean
} {
  if (phase === "waiting") return { target: "frame", settled: false }
  if (phase === "error") return { target: "retry", settled: true }
  return { target: "frame", settled: true }
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

/**
 * A decoded view call (a retry or a refresh), typed so a failure never turns
 * into UI text: `isError` tells a tool error (with its raw `reason`, for the
 * Details disclosure or the console) from a payload that is no view.
 */
export type ViewResultOutcome<T> =
  { ok: true; data: T } | { ok: false; isError: boolean; reason: string | undefined }

/**
 * Decode a view call's result: the payload when it is a complete view,
 * otherwise a failure — a tool error with its `isError` text, or a payload
 * the shell cannot render (no reason).
 */
export function decodeViewResult<T>(
  result: unknown,
  isValid: (value: unknown) => value is T,
): ViewResultOutcome<T> {
  let decoded: unknown
  try {
    decoded = parseToolResult<unknown>(result)
  } catch (err) {
    return { ok: false, isError: true, reason: errorMessage(err) }
  }
  return isValid(decoded)
    ? { ok: true, data: decoded }
    : { ok: false, isError: false, reason: undefined }
}

/** What {@link describeViewForModel} reports on. */
export interface ViewModelContextInput {
  lifecycle: ViewLifecycle
  /** The originating tool, when the host names it. */
  toolName: string | undefined
  /** The shown payload's failed data steps (result phase). */
  stepErrors?: readonly { stepId: string; reason: string }[]
  /** The step-error alert offers a retry (the view can refresh). */
  stepsRetryable?: boolean
  /**
   * When the view re-loaded the shown payload itself (epoch ms, see
   * {@link reloadedAtOf}); `null` for a payload the host delivered.
   */
  reloadedAt?: number | null
  /**
   * How it re-loaded: it re-ran the tool because the host did not pass the
   * result along (`"recovery"`, the default: its own recovery or the user's
   * retry), or the user refreshed the view (`"refresh"`).
   */
  reloadedBy?: "recovery" | "refresh"
}

/**
 * Where the shown payload came from: the host's tool result, the view's own
 * re-execution when the host stripped it, the user's retry, or a refresh.
 */
export type ViewSource = "host" | "recovered" | "retry" | "refresh"

/**
 * When a payload counts as re-loaded by the view itself (N23): `at` when its
 * figures can differ from the result the chat answered from, else `null`. A
 * recovery and a refresh always; a retry only after a call whose result
 * reached the chat (a stripped or unusable one), never after a failed or
 * cancelled call, of which the model never had figures. The host's own
 * payload never.
 */
export function reloadedAtOf(source: ViewSource, at: number, callFailed: boolean): number | null {
  if (source === "host") return null
  if (source === "retry" && callFailed) return null
  return at
}

/**
 * The view's own line of model context (toolkit#176 K20): what failed and
 * that the user sees an error instead of the view; a blocked recovery (the
 * tool ran, its result never reached the view, and the model must not re-run
 * it just to show the view); failed data steps; a payload the view re-loaded
 * itself, whose figures can differ from the tool result the model answered
 * from (N23). `null` while there is nothing to report (waiting, or a plain
 * host-delivered view). English: it is read by the model, never shown.
 */
export function describeViewForModel(input: ViewModelContextInput): string | null {
  const subject = input.toolName ? `The view of ${input.toolName}` : "The view"
  const { lifecycle } = input
  if (lifecycle.phase === "error") {
    if (lifecycle.kind === "blocked") {
      return describeBlockedForModel(subject, input.toolName, lifecycle.canRetry)
    }
    const reason = lifecycle.reason ? ` (reason: ${lifecycle.reason})` : ""
    const offer = lifecycle.canRetry ? "an error message with a retry button" : "an error message"
    return `${subject} could not be shown${reason}. The user sees ${offer} instead of the view.`
  }
  if (lifecycle.phase === "cancelled") {
    return `${subject} was cancelled before it rendered. The user sees a note that the call was cancelled.`
  }
  if (lifecycle.phase === "waiting") return null
  const lines: string[] = []
  if (input.reloadedAt != null) {
    const at = new Date(input.reloadedAt).toISOString()
    const how =
      input.reloadedBy === "refresh"
        ? `was refreshed by the user at ${at}`
        : `re-ran the tool at ${at} because the host did not pass the original result to the view`
    lines.push(
      `${subject} ${how}; its figures are live as of then and can differ from the original result.`,
    )
  }
  const failed = input.stepErrors ?? []
  if (failed.length > 0) {
    const steps = failed.map((e) => `${e.stepId}: ${e.reason}`).join("; ")
    const lead = lines.length > 0 ? "Some" : `${subject} is shown, but some`
    const offer = input.stepsRetryable ? "an alert with a retry button" : "an alert"
    lines.push(`${lead} of its data could not be loaded (${steps}). The user sees ${offer}.`)
  }
  return lines.length > 0 ? lines.join(" ") : null
}

/**
 * The model's line for a blocked recovery: the tool ran (nothing failed), the
 * host kept its result from the view, the view did not re-run it, and the
 * model must not re-run it just to show the view, a write least of all.
 */
function describeBlockedForModel(
  subject: string,
  toolName: string | undefined,
  canRetry: boolean,
): string {
  const tool = toolName ?? "the tool"
  const offer = canRetry
    ? "a note with a button that loads the view"
    : "a note to ask in the chat for the current state"
  return (
    `${subject} is not shown: ${tool} ran, but the host did not pass its result to the view, ` +
    `and the view did not re-run it. The user sees ${offer} instead of the view. ` +
    `Do not re-run ${tool} just to show the view.`
  )
}

/** A displayable message for anything thrown. */
export function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message || undefined
  if (typeof err === "string") return err || undefined
  return undefined
}
