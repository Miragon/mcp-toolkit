import { useEffect, useState, useSyncExternalStore } from "react"
import { installToolResultObserver, type ToolResultObserver } from "../lib/tool-result-observer.js"
import {
  createRecoveryController,
  type RecoveryPolicy,
  type ToolResultRecoveryState,
} from "./tool-result-recovery-model.js"

export { decodeRecoveredResult } from "./tool-result-recovery-model.js"
export type {
  RecoveryBlockReason,
  RecoveryPolicy,
  ToolResultRecoveryState,
  ToolSafety,
} from "./tool-result-recovery-model.js"

/**
 * Recovery for hosts that deliver the `ui/notifications/tool-result`
 * notification without `structuredContent` (observed on claude.ai and Claude
 * Desktop, which forward only the model-facing `content` blocks). mcp-use
 * 2.x's `useToolContext` latch ignores such a content-only result, so its
 * status stays `"pending"` forever and the shell would idle on its skeleton.
 *
 * The hook re-executes the originating tool once via the host bridge's
 * `callTool` — tool-call RESPONSES carry `structuredContent` intact on those
 * hosts — and exposes the decoded payload. When it does so (toolkit#176):
 *
 * - **Only when the host stripped the result.** A passive observer of the
 *   host's lifecycle notifications (`installToolResultObserver`) sees the
 *   content-only result itself, so the recovery fires as it arrives, and a
 *   slow tool on a compliant host is never re-run (K13): no result has
 *   arrived because none was sent. Where the observer cannot vouch for that
 *   (no browser frame, or installed after the handshake), the 2.x grace timer
 *   ({@link ToolResultRecoveryOptions.assumeStrippedAfterMs}) still infers a
 *   stripped result, once the call's arguments arrived.
 * - **With the call's complete arguments** (N21): the observer's complete
 *   `tool-input`, never a partial stream; an equal re-delivery is the same run.
 * - **Never for a cancelled or failed call:** re-running repeats the failure
 *   or overrides the user's stop; the shell renders that state and offers an
 *   explicit retry.
 * - **Only for a tool the policy allows** ({@link ToolResultRecoveryOptions.policy}):
 *   by default never one the host reports as writing (`readOnlyHint: false`
 *   or `destructiveHint: true` in `hostContext.toolInfo.tool.annotations`).
 *   A blocked recovery is reported (`blocked`) so the view can show its error.
 *
 * The decision and its timer live in `createRecoveryController`; this hook
 * only binds it to React.
 */

/**
 * Default grace period before a silent latch counts as a stripped result —
 * used only where the transport observer cannot vouch that nothing arrived.
 */
export const DEFAULT_ASSUME_STRIPPED_AFTER_MS = 2500

export interface ToolResultRecoveryOptions {
  /**
   * The latch fired (`useToolContext().status !== "pending"`) — a structured
   * result, a tool error, or a host cancellation arrived. On hosts that strip
   * `structuredContent` this never turns true.
   */
  resultReady: boolean
  /**
   * The host cancelled the originating call (`useToolContext().error` is a
   * `ToolCancelledError`). Suppresses the recovery: nothing fires, and an
   * attempt already in flight is dropped. Defaults to `false`.
   */
  cancelled?: boolean
  /**
   * The originating call latched a tool error (`useToolContext().status ===
   * "error"` without a cancellation): an `isError` result or a failed call.
   * Suppresses the recovery exactly like {@link cancelled} — the shell shows
   * the error instead of silently re-running a call that just failed
   * (toolkit#176). Defaults to `false`.
   */
  errored?: boolean
  /** The payload the host delivered (`useToolContext().toolOutput`). */
  props: unknown
  /** Validates a candidate payload. */
  isValid: (value: unknown) => boolean
  /** The tool arguments from `ui/notifications/tool-input` (`useToolContext().toolInput`). */
  toolInput: Record<string, unknown> | null | undefined
  /** Raw host context (`useHostContext().hostContext`); `toolInfo` names the originating tool. */
  hostContext: Record<string, unknown> | null | undefined
  /** The host bridge's `callTool`. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /**
   * Grace period in ms after which a silent latch counts as a stripped
   * result. Applies only where the transport observer cannot vouch that no
   * result arrived (see above); restarts for new arguments. Defaults to
   * {@link DEFAULT_ASSUME_STRIPPED_AFTER_MS}.
   */
  assumeStrippedAfterMs?: number
  /** Which tools may be re-executed on their own. Default `"auto"`. */
  policy?: RecoveryPolicy
  /**
   * The transport observer. Defaults to the document's
   * (`installToolResultObserver()`); `null` disables it, leaving the grace
   * timer to decide alone (the 2.x behaviour).
   */
  observer?: ToolResultObserver | null
}

/**
 * Resolves the originating tool name from the host context's `toolInfo`.
 * Reads the SEP-1865 shape first (`toolInfo.tool.name`), then the flattened
 * variants some hosts send (`toolInfo.name`, `toolInfo.toolName`).
 */
export function resolveRecoveryToolName(hostContext: unknown): string | undefined {
  if (!hostContext || typeof hostContext !== "object") return undefined
  const info = (hostContext as Record<string, unknown>).toolInfo
  if (!info || typeof info !== "object") return undefined
  const rec = info as Record<string, unknown>
  const tool = rec.tool
  const candidates = [
    tool && typeof tool === "object" ? (tool as Record<string, unknown>).name : undefined,
    rec.name,
    rec.toolName,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate
  }
  return undefined
}

/**
 * Whether a latched or assumed-stripped result may be recovered at all: the
 * call was neither cancelled nor failed. Kept for existing imports; the full
 * rule (observer, policy, arguments) is `decideRecovery`.
 * @deprecated Use `decideRecovery` from the recovery model.
 */
export function isRecoveryReady(state: {
  resultReady: boolean
  assumedReady: boolean
  cancelled: boolean
  errored: boolean
}): boolean {
  if (state.cancelled || state.errored) return false
  return state.resultReady || state.assumedReady
}

export function useToolResultRecovery<T>(
  options: ToolResultRecoveryOptions,
): ToolResultRecoveryState<T> {
  const {
    resultReady,
    cancelled = false,
    errored = false,
    props,
    isValid,
    toolInput,
    hostContext,
    callTool,
    assumeStrippedAfterMs = DEFAULT_ASSUME_STRIPPED_AFTER_MS,
    policy = "auto",
    observer,
  } = options
  // One controller per mount; it survives StrictMode's effect re-run, so an
  // in-flight call is never fired twice.
  const [controller] = useState(() =>
    createRecoveryController<T>({
      observer: observer === undefined ? installToolResultObserver() : observer,
    }),
  )
  useEffect(() => {
    controller.start()
    return () => controller.stop()
  }, [controller])
  useEffect(() => {
    controller.update({
      resultReady,
      cancelled,
      errored,
      props,
      isValid,
      toolInput,
      hostContext,
      callTool,
      policy,
      graceMs: assumeStrippedAfterMs,
      resolveToolName: resolveRecoveryToolName,
    })
  })
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
}
