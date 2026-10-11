/**
 * The stripped-result recovery of `McpAppView` as plain logic (toolkit#176):
 * WHEN the originating tool may be re-executed ({@link decideRecovery}) and a
 * framework-free controller that runs that decision against the transport
 * observer, a fallback grace timer and a single-flight call
 * ({@link createRecoveryController}). `useToolResultRecovery` only binds the
 * controller to React, so the scenarios here (keep / strip / slow / late
 * observer) are the hook's behaviour.
 *
 * The rule, in order:
 *
 * 1. Never recover a call that was cancelled or failed: the view renders that
 *    state (an `isError` is an error, K14).
 * 2. Recover when the host delivered a result the view cannot render: the
 *    latch fired with an invalid payload, or the observer saw the stripped,
 *    content-only result claude.ai sends. The re-run uses the COMPLETE
 *    arguments of the call (N21), never a partial stream.
 * 3. Otherwise wait. A slow tool on a compliant host is simply still running
 *    (K13): the observer, listening since the handshake, would have seen its
 *    result. Only when it cannot vouch for that (no observer, or installed
 *    after the handshake) does the 2.x grace timer still infer a stripped
 *    result, and only once the call's arguments arrived.
 * 4. A needed recovery runs only for a tool the policy allows
 *    ({@link RecoveryPolicy}: by default never one the host reports as
 *    writing) and only when the host names the tool; else it is `blocked`,
 *    which the view renders as an error whose retry is the user's own call.
 */
import { parseToolResult } from "../lib/parse-tool-result.js"
import type { ToolObservation, ToolResultObserver } from "../lib/tool-result-observer.js"

/**
 * What the host's tool annotations say about re-running the originating
 * tool: `readOnlyHint: true` is `"read-only"`, `readOnlyHint: false` or
 * `destructiveHint: true` is `"writes"`, anything else (no tool definition,
 * no annotations, no read-only hint) is `"unknown"`.
 */
export type ToolSafety = "read-only" | "writes" | "unknown"

/**
 * Which tools the view may re-execute on its own to recover a stripped result.
 *
 * - `"auto"` (default): any tool the host does not report as writing — a
 *   view tool is a read by the toolkit's render contract, so a missing hint
 *   counts as one.
 * - `"read-only"`: only a tool the host reports with `readOnlyHint: true`.
 * - `"never"`: never; a stripped result shows the error state, whose retry
 *   runs the tool on the user's click.
 */
export type RecoveryPolicy = "auto" | "read-only" | "never"

/** Why a needed recovery did not run: the policy forbids it, or the host names no tool. */
export type RecoveryBlockReason = "policy" | "no-tool"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Read {@link ToolSafety} from `hostContext.toolInfo.tool.annotations` (SEP-1865). */
export function resolveToolSafety(hostContext: unknown): ToolSafety {
  if (!isRecord(hostContext) || !isRecord(hostContext.toolInfo)) return "unknown"
  const tool = hostContext.toolInfo.tool
  const annotations = isRecord(tool) ? tool.annotations : undefined
  if (!isRecord(annotations)) return "unknown"
  if (annotations.destructiveHint === true || annotations.readOnlyHint === false) return "writes"
  return annotations.readOnlyHint === true ? "read-only" : "unknown"
}

/** Whether `policy` lets the view re-execute a tool of this `safety` on its own. */
export function policyAllows(policy: RecoveryPolicy, safety: ToolSafety): boolean {
  if (policy === "never") return false
  if (policy === "read-only") return safety === "read-only"
  return safety !== "writes"
}

export interface RecoveryDecisionInput {
  /** The latch fired (`useToolContext().status !== "pending"`). */
  resultReady: boolean
  /** The latched payload is renderable (a conforming host delivered it). */
  payloadValid: boolean
  /** The host cancelled the call. */
  cancelled: boolean
  /** The call latched a tool error (an `isError` result or a failed call). */
  errored: boolean
  /** What the transport observer saw; `null` when none listens. */
  observation: ToolObservation | null
  /** The call's arguments arrived (any tool-input, partial or complete). */
  hasInput: boolean
  /** The originating tool (`hostContext.toolInfo`), when the host names it. */
  toolName: string | undefined
  safety: ToolSafety
  policy: RecoveryPolicy
  /** The fallback grace period passed for the current arguments. */
  graceElapsed: boolean
}

export type RecoveryDecision =
  /** Delivered, failed or cancelled: nothing to recover. */
  | { action: "none" }
  /** The result is not in yet; `armGrace` starts the fallback timer (observer cannot vouch). */
  | { action: "wait"; armGrace: boolean }
  /** Re-execute the originating tool now. */
  | { action: "recover" }
  /** A recovery is needed but must not run. */
  | { action: "blocked"; reason: RecoveryBlockReason }

const NONE: RecoveryDecision = { action: "none" }
const WAIT: RecoveryDecision = { action: "wait", armGrace: false }
const WAIT_ARMED: RecoveryDecision = { action: "wait", armGrace: true }
const RECOVER: RecoveryDecision = { action: "recover" }

/** Rules 1–3: does the result need recovering, or is it delivered / still on its way? */
function recoveryNeed(input: RecoveryDecisionInput): RecoveryDecision | "needed" {
  if (input.resultReady) return input.payloadValid ? NONE : "needed"
  const observed = input.observation?.result ?? "none"
  if (observed === "stripped") return "needed"
  // A structured result or an error: the latch is about to follow.
  if (observed !== "none") return NONE
  // Listening since the handshake: nothing arrived because nothing was sent.
  if (input.observation?.sawHandshake) return WAIT
  if (input.toolName === undefined || !input.hasInput) return WAIT
  return input.graceElapsed ? "needed" : WAIT_ARMED
}

/** The recovery rule (see the module comment). Pure: every input is explicit. */
export function decideRecovery(input: RecoveryDecisionInput): RecoveryDecision {
  if (input.cancelled || input.errored || input.observation?.cancelled) return NONE
  const need = recoveryNeed(input)
  if (need !== "needed") return need
  if (input.toolName === undefined) return { action: "blocked", reason: "no-tool" }
  if (!policyAllows(input.policy, input.safety)) return { action: "blocked", reason: "policy" }
  return RECOVER
}

/**
 * The arguments a re-execution runs with: the complete tool-input the
 * observer saw, else the view runtime's latest input, else none.
 */
export function recoveryArgs(
  observation: ToolObservation | null,
  toolInput: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return observation?.completeInput ?? toolInput ?? {}
}

/**
 * Content identity of a JSON value, independent of key order and object
 * identity: a re-delivered equal input is the same input (N21).
 */
export function stableKey(value: unknown): string {
  return (
    JSON.stringify(value, (_key, v: unknown) =>
      isRecord(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]]),
          )
        : v,
    ) ?? "undefined"
  )
}

/**
 * Decodes a re-executed tool result and validates it: the payload, or `null`
 * for an error result, an empty one or one the validator refuses.
 */
export function decodeRecoveredResult<T>(
  result: unknown,
  isValid: (value: unknown) => boolean,
): T | null {
  let decoded: unknown
  try {
    decoded = parseToolResult<unknown>(result)
  } catch {
    return null
  }
  return decoded !== null && isValid(decoded) ? (decoded as T) : null
}

export interface ToolResultRecoveryState<T> {
  /** The recovered payload, `null` until the re-execution resolved (or when it failed). */
  data: T | null
  /** The single recovery attempt failed — the view shows its error state, no retry loop. */
  failed: boolean
  /**
   * A recovery was needed but did not run: the policy forbids re-executing
   * this tool, or the host names no tool. `null` otherwise.
   */
  blocked: RecoveryBlockReason | null
  /** When the recovered payload arrived (epoch ms) — its data is live as of then (N23). */
  recoveredAt: number | null
  /** The arguments the recovered payload was computed for. */
  args: Record<string, unknown> | null
}

export const RECOVERY_IDLE: ToolResultRecoveryState<never> = Object.freeze({
  data: null,
  failed: false,
  blocked: null,
  recoveredAt: null,
  args: null,
})

/** What the view knows about the rendering call on each render. */
export interface RecoveryInputs {
  resultReady: boolean
  cancelled: boolean
  errored: boolean
  /** The payload the host delivered (`useToolContext().toolOutput`). */
  props: unknown
  isValid: (value: unknown) => boolean
  toolInput: Record<string, unknown> | null | undefined
  /** Raw host context; `toolInfo` names the originating tool and its annotations. */
  hostContext: Record<string, unknown> | null | undefined
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  policy: RecoveryPolicy
  /** The fallback grace period (observer cannot vouch). */
  graceMs: number
  /** Resolves the originating tool name from the host context. */
  resolveToolName: (hostContext: unknown) => string | undefined
}

export interface RecoveryController<T> {
  subscribe: (listener: () => void) => () => void
  getState: () => ToolResultRecoveryState<T>
  /** Feed the latest inputs (every commit) and act on the decision. */
  update: (inputs: RecoveryInputs) => void
  /** Listen to the observer (mount). */
  start: () => void
  /** Stop listening and drop the grace timer; an in-flight call still lands (StrictMode re-runs). */
  stop: () => void
}

export interface RecoveryControllerOptions {
  /** The transport observer; `null` when none listens (the grace timer decides alone). */
  observer: ToolResultObserver | null
  /** Clock for {@link ToolResultRecoveryState.recoveredAt}. Default `Date.now`. */
  now?: () => number
}

interface Flight {
  key: string
  promise: Promise<unknown>
}

/** One evaluation of the inputs: the decision plus the run it concerns. */
interface Evaluation {
  decision: RecoveryDecision
  toolName: string | undefined
  args: Record<string, unknown>
  /** Content identity of `args` (the grace timer's key). */
  argsKey: string
  /** Identity of the run: the tool and its arguments (the single flight's key). */
  runKey: string
}

/** Run {@link decideRecovery} on the controller's current knowledge. */
export function evaluateRecovery(
  inputs: RecoveryInputs,
  observation: ToolObservation | null,
  grace: { key: string | null; elapsed: boolean },
): Evaluation {
  const toolName = inputs.resolveToolName(inputs.hostContext)
  const args = recoveryArgs(observation, inputs.toolInput)
  const argsKey = stableKey(args)
  const decision = decideRecovery({
    resultReady: inputs.resultReady,
    payloadValid: inputs.isValid(inputs.props),
    cancelled: inputs.cancelled,
    errored: inputs.errored,
    observation,
    hasInput: inputs.toolInput != null || observation?.completeInput !== undefined,
    toolName,
    safety: resolveToolSafety(inputs.hostContext),
    policy: inputs.policy,
    graceElapsed: grace.elapsed && grace.key === argsKey,
  })
  return { decision, toolName, args, argsKey, runKey: `${toolName ?? ""}\u0000${argsKey}` }
}

/** Re-execute the tool and decode its answer; `null` for anything unusable. */
async function rerun<T>(
  callTool: RecoveryInputs["callTool"],
  isValid: RecoveryInputs["isValid"],
  toolName: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  try {
    const data = decodeRecoveredResult<T>(await callTool(toolName, args), isValid)
    if (data === null) {
      console.warn(
        `[mcp-toolkit] tool-result recovery: re-executing "${toolName}" returned no usable payload`,
      )
    }
    return data
  } catch (err) {
    console.warn(`[mcp-toolkit] tool-result recovery for "${toolName}" failed:`, err)
    return null
  }
}

/**
 * Runs {@link decideRecovery} for the view: re-evaluates on every input
 * update and observer change, arms the fallback grace timer per argument set,
 * and makes at most one call per run (single flight, keyed by the tool and
 * its arguments; a newer run drops an older call's outcome).
 */
export function createRecoveryController<T>(
  options: RecoveryControllerOptions,
): RecoveryController<T> {
  const { observer } = options
  const now = options.now ?? Date.now
  const listeners = new Set<() => void>()
  let state: ToolResultRecoveryState<T> = RECOVERY_IDLE
  let inputs: RecoveryInputs | null = null
  let unsubscribe: (() => void) | null = null
  let flight: Flight | null = null
  // The fallback grace timer: armed per argument set, elapsed once it fired.
  const grace: { key: string | null; elapsed: boolean } = { key: null, elapsed: false }
  let graceTimer: ReturnType<typeof setTimeout> | null = null

  const setState = (next: ToolResultRecoveryState<T>) => {
    if (next === state) return
    state = next
    for (const listener of [...listeners]) listener()
  }

  const clearGraceTimer = () => {
    if (graceTimer !== null) clearTimeout(graceTimer)
    graceTimer = null
  }

  const armGrace = (key: string, ms: number) => {
    if (grace.key === key && (grace.elapsed || graceTimer !== null)) return
    clearGraceTimer()
    grace.key = key
    grace.elapsed = false
    graceTimer = setTimeout(() => {
      graceTimer = null
      grace.elapsed = true
      evaluate()
    }, ms)
  }

  const launch = (current: RecoveryInputs, run: Evaluation, toolName: string) => {
    const own: Flight = {
      key: run.runKey,
      promise: rerun<T>(current.callTool, current.isValid, toolName, run.args),
    }
    flight = own
    void own.promise.then((data) => {
      // A newer run superseded this call: its outcome is stale.
      if (flight !== own) return
      setState(
        data === null
          ? { ...RECOVERY_IDLE, failed: true, args: run.args }
          : { data: data as T, failed: false, blocked: null, recoveredAt: now(), args: run.args },
      )
    })
  }

  /** Act on one evaluation: drop a superseded attempt, launch, block or settle. */
  const apply = (current: RecoveryInputs, run: Evaluation) => {
    const { decision } = run
    // A new run (the need went away, or new arguments) drops the previous
    // attempt and its outcome.
    if (flight && (decision.action !== "recover" || flight.key !== run.runKey)) {
      flight = null
      setState(RECOVERY_IDLE)
    }
    if (decision.action === "blocked") {
      if (state.blocked !== decision.reason) {
        setState({ ...RECOVERY_IDLE, blocked: decision.reason })
      }
      return
    }
    // A lifted block (the tool got named, the policy changed) is gone at once,
    // also while the re-run it allows is still in flight.
    if (state.blocked !== null) setState(RECOVERY_IDLE)
    if (decision.action === "recover" && !flight && run.toolName !== undefined) {
      launch(current, run, run.toolName)
    }
  }

  function evaluate() {
    if (!inputs) return
    const run = evaluateRecovery(inputs, observer?.getSnapshot() ?? null, grace)
    if (run.decision.action === "wait" && run.decision.armGrace)
      armGrace(run.argsKey, inputs.graceMs)
    else clearGraceTimer()
    apply(inputs, run)
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getState: () => state,
    update: (next) => {
      inputs = next
      evaluate()
    },
    start: () => {
      if (!unsubscribe && observer) unsubscribe = observer.subscribe(evaluate)
      evaluate()
    },
    stop: () => {
      unsubscribe?.()
      unsubscribe = null
      // A stopped timer restarts in full on the next start (armGrace re-arms
      // a key whose timer is gone); an elapsed grace stays elapsed.
      clearGraceTimer()
    },
  }
}
