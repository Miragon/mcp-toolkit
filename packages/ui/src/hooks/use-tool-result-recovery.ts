import { useEffect, useRef, useState } from "react"
import { parseToolResult } from "../lib/parse-tool-result.js"

/**
 * Recovery for hosts that deliver the `ui/notifications/tool-result`
 * notification without `structuredContent` (observed on claude.ai and Claude
 * Desktop, which forward only the model-facing `content` blocks). Since
 * mcp-use 2.x such a result is not even observable: the `useToolContext`
 * latch ignores content-only successes, so the tool status stays `"pending"`
 * forever and the shell would idle on its loading skeleton.
 *
 * Because the stripped notification is invisible, readiness is inferred two
 * ways: the hard `resultReady` signal (the latch fired but the payload is
 * invalid), or a grace timer — once the originating tool is known and no
 * result has latched within
 * {@link ToolResultRecoveryOptions.assumeStrippedAfterMs}, the result is
 * assumed delivered-but-stripped. Either way the hook re-executes the
 * originating tool once via the host bridge's official `callTool` — tool-call
 * RESPONSES carry `structuredContent` intact on those hosts — and exposes the
 * decoded payload. Spec-conforming hosts (e.g. the mcp-use inspector) deliver
 * a valid payload up front, so the recovery never fires there.
 *
 * Assumes the originating tool is a read-only render pipeline (true for all
 * toolkit `render-view`/`show_*` tools) — the re-execution must be safe to
 * repeat, and may rarely run concurrently with the original invocation when
 * the grace timer beats a slow but conforming host.
 */

/**
 * Default grace period before a silent latch counts as a stripped result.
 * Long enough for a conforming host to latch a typical render tool first,
 * short enough that users on stripping hosts are not left staring at the
 * skeleton noticeably.
 */
export const DEFAULT_ASSUME_STRIPPED_AFTER_MS = 2500

export interface ToolResultRecoveryOptions {
  /**
   * The latch fired (`useToolContext().status !== "pending"`) — a structured
   * result or tool error arrived. On hosts that strip `structuredContent`
   * this never turns true; the grace timer below covers that case.
   */
  resultReady: boolean
  /** The payload the host delivered (`useToolContext().toolOutput`). */
  props: unknown
  /**
   * Validates a candidate payload. MUST be referentially stable (module-level
   * function or memoised) — it is an effect dependency.
   */
  isValid: (value: unknown) => boolean
  /** The tool arguments from `ui/notifications/tool-input` (`useToolContext().toolInput`). */
  toolInput: Record<string, unknown> | null | undefined
  /** Raw host context (`useHostContext().hostContext`); `toolInfo` names the originating tool. */
  hostContext: Record<string, unknown> | null | undefined
  /** The host bridge's `callTool`. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /**
   * Grace period in ms after which a silent latch counts as a stripped
   * result. Armed once the originating tool is known while `resultReady` is
   * still false; re-armed on every `toolInput` update, because streaming
   * arguments mean the invocation may not have finished yet. Defaults to
   * {@link DEFAULT_ASSUME_STRIPPED_AFTER_MS}.
   */
  assumeStrippedAfterMs?: number
}

export interface ToolResultRecoveryState<T> {
  /** The recovered payload, `null` until the re-execution resolved (or when it failed). */
  data: T | null
  /** `true` when the single recovery attempt failed — the shell keeps its skeleton, no retry loop. */
  failed: boolean
}

const IDLE: ToolResultRecoveryState<never> = { data: null, failed: false }

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
 * Decodes a re-executed tool result and validates it. Exposed for tests;
 * the hook uses it on the `callTool` response.
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

export function useToolResultRecovery<T>(
  options: ToolResultRecoveryOptions,
): ToolResultRecoveryState<T> {
  const {
    resultReady,
    props,
    isValid,
    toolInput,
    hostContext,
    callTool,
    assumeStrippedAfterMs = DEFAULT_ASSUME_STRIPPED_AFTER_MS,
  } = options
  const [state, setState] = useState<ToolResultRecoveryState<T>>(IDLE)
  // Single-flight: the promise ref survives StrictMode's dev-mode
  // effect re-run (cleanup + setup on the same instance), so the re-run
  // re-subscribes to the SAME in-flight call instead of firing a second one.
  const flightRef = useRef<Promise<ToolResultRecoveryState<T>> | null>(null)
  const flightInputRef = useRef<unknown>(null)

  const toolName = resolveRecoveryToolName(hostContext)

  // A stripped result is unobservable (the 2.x latch ignores content-only
  // results), so infer it: once a recovery could fire but the latch has been
  // silent for the grace period, treat the result as delivered-but-stripped.
  // Re-armed on every toolInput identity change — streaming arguments mean
  // the invocation may still be running, so the grace period starts over.
  // The re-arm is a render-phase reset (not an effect) so the cascading-
  // render lint stays satisfied; the timer effect below restarts anyway
  // because toolInput is one of its dependencies.
  const [assumedReady, setAssumedReady] = useState(false)
  const [prevTimerInput, setPrevTimerInput] = useState<unknown>(toolInput)
  if (prevTimerInput !== toolInput) {
    setPrevTimerInput(toolInput)
    if (assumedReady) setAssumedReady(false)
  }
  useEffect(() => {
    if (resultReady || toolName === undefined) return
    const timer = setTimeout(() => setAssumedReady(true), assumeStrippedAfterMs)
    return () => clearTimeout(timer)
  }, [resultReady, toolName, toolInput, assumeStrippedAfterMs])

  const ready = resultReady || assumedReady

  useEffect(() => {
    // A new tool run (result no longer ready, or fresh tool-input identity)
    // invalidates any previous recovery attempt and re-arms the single-flight.
    if (flightRef.current && (!ready || flightInputRef.current !== toolInput)) {
      flightRef.current = null
      setState((prev) => (prev.data === null && !prev.failed ? prev : IDLE))
    }
    // Never fire on conforming hosts (valid payload) or before the
    // originating tool is known.
    if (!ready || isValid(props) || toolName === undefined) return

    if (!flightRef.current) {
      flightInputRef.current = toolInput
      flightRef.current = (async (): Promise<ToolResultRecoveryState<T>> => {
        try {
          const result = await callTool(toolName, toolInput ?? {})
          const data = decodeRecoveredResult<T>(result, isValid)
          if (data !== null) return { data, failed: false }
          console.warn(
            `[mcp-toolkit] tool-result recovery: re-executing "${toolName}" returned no usable payload`,
          )
          return { data: null, failed: true }
        } catch (err) {
          console.warn(`[mcp-toolkit] tool-result recovery for "${toolName}" failed:`, err)
          return { data: null, failed: true }
        }
      })()
    }

    const flight = flightRef.current
    let stale = false
    void flight.then((outcome) => {
      // Drop the outcome when this subscription was superseded or the flight
      // was invalidated by a newer tool run.
      if (!stale && flightRef.current === flight) setState(outcome)
    })
    return () => {
      stale = true
    }
  }, [ready, props, isValid, toolName, toolInput, callTool])

  return state
}
