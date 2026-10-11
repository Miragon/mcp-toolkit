/**
 * A passive observer of the MCP Apps (SEP-1865) host → view lifecycle
 * notifications, read straight off the postMessage channel the view runtime
 * itself listens on (toolkit#176 K13, N21).
 *
 * mcp-use 2.x latches only a result WITH `structuredContent` (or an
 * `isError`); a content-only result, which claude.ai and Claude Desktop send,
 * leaves its status `"pending"` forever, and its tool input merges partial and
 * complete arguments into one field. Watching the notifications themselves
 * tells the three cases apart that the latch cannot:
 *
 * - the host delivered a STRIPPED result (re-run the tool now, with the
 *   complete arguments it was called with),
 * - the host delivered a structured result (the latch follows; never re-run),
 * - nothing arrived yet (a slow tool on a compliant host: keep waiting).
 *
 * The last case is only certain when the observer was listening before the
 * host answered `ui/initialize` ({@link ToolObservation.sawHandshake}): hosts
 * send the lifecycle notifications after the handshake, so an observer that
 * saw it has seen everything sent so far. `mountMcpToolkitApp` installs it
 * ahead of `bootstrapView` for exactly that reason.
 *
 * Read-only: it never sends, never answers and never stops a message.
 */

/** What the host's `ui/notifications/tool-result` carried. */
export type ObservedToolResult = "none" | "structured" | "stripped" | "error"

/** Everything the observer learned about the rendering call so far. */
export interface ToolObservation {
  /**
   * The observer saw the host answer `ui/initialize`, so it was listening
   * before any lifecycle notification could be sent: a result it has not
   * seen has not been delivered yet.
   */
  sawHandshake: boolean
  /**
   * The arguments of the complete `ui/notifications/tool-input` — never a
   * partial stream (`tool-input-partial` is ignored). `undefined` until it
   * arrived.
   */
  completeInput: Record<string, unknown> | undefined
  /** What the first `ui/notifications/tool-result` carried. */
  result: ObservedToolResult
  /** The host sent `ui/notifications/tool-cancelled`. */
  cancelled: boolean
}

export const EMPTY_TOOL_OBSERVATION: ToolObservation = Object.freeze({
  sawHandshake: false,
  completeInput: undefined,
  result: "none",
  cancelled: false,
})

/** A host → view message the observer acts on. */
export type HostLifecycleMessage =
  | { kind: "handshake" }
  | { kind: "tool-input"; arguments: Record<string, unknown> }
  | { kind: "tool-result"; result: Exclude<ObservedToolResult, "none"> }
  | { kind: "tool-cancelled" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Classify a tool-result notification the way mcp-use 2.x's latch does: an
 * `isError` result is an error, a result with `structuredContent` (even
 * `null`) latches as ready, and anything else is the stripped, content-only
 * result the latch ignores.
 */
export function classifyToolResult(
  params: Record<string, unknown>,
): Exclude<ObservedToolResult, "none"> {
  if (params.isError === true) return "error"
  return params.structuredContent === undefined ? "stripped" : "structured"
}

/** The host's answer to `ui/initialize`: a response carrying its capabilities or protocol version. */
function isHandshakeResponse(message: Record<string, unknown>): boolean {
  if (!("id" in message) || !isRecord(message.result)) return false
  return (
    isRecord(message.result.hostCapabilities) || typeof message.result.protocolVersion === "string"
  )
}

/**
 * Decode one postMessage payload into the lifecycle message it is, or `null`
 * for anything else (other methods, requests, responses, foreign traffic).
 */
export function classifyHostMessage(data: unknown): HostLifecycleMessage | null {
  if (!isRecord(data) || data.jsonrpc !== "2.0") return null
  if (typeof data.method !== "string") {
    return isHandshakeResponse(data) ? { kind: "handshake" } : null
  }
  const params = isRecord(data.params) ? data.params : {}
  switch (data.method) {
    case "ui/notifications/tool-input":
      return {
        kind: "tool-input",
        arguments: isRecord(params.arguments) ? params.arguments : {},
      }
    case "ui/notifications/tool-result":
      return { kind: "tool-result", result: classifyToolResult(params) }
    case "ui/notifications/tool-cancelled":
      return { kind: "tool-cancelled" }
    default:
      return null
  }
}

/**
 * Fold one message into the observation. Like the mcp-use latch, the call
 * settles once: after its result or cancellation, later inputs, results and
 * cancellations change nothing.
 */
export function reduceToolObservation(
  state: ToolObservation,
  message: HostLifecycleMessage,
): ToolObservation {
  if (message.kind === "handshake") {
    return state.sawHandshake ? state : { ...state, sawHandshake: true }
  }
  if (state.result !== "none" || state.cancelled) return state
  switch (message.kind) {
    case "tool-input":
      return { ...state, completeInput: message.arguments }
    case "tool-result":
      return { ...state, result: message.result }
    case "tool-cancelled":
      return { ...state, cancelled: true }
  }
}

/** The `window` slice the observer listens on (any `EventTarget`, e.g. in tests). */
export interface MessageEventSource {
  addEventListener(type: "message", listener: (event: Event) => void): void
  removeEventListener(type: "message", listener: (event: Event) => void): void
}

/** A subscribable observation, shaped for `useSyncExternalStore`. */
export interface ToolResultObserver {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => ToolObservation
  /** Stop listening; the last observation stays readable. */
  dispose: () => void
}

/**
 * Observe the lifecycle notifications arriving on `source`. `accept` filters
 * the events (the view accepts only its host: `event.source === window.parent`,
 * the same check the ext-apps transport makes).
 */
export function createToolResultObserver(
  source: MessageEventSource,
  accept: (event: MessageEvent) => boolean = () => true,
): ToolResultObserver {
  let snapshot: ToolObservation = EMPTY_TOOL_OBSERVATION
  const listeners = new Set<() => void>()
  const onMessage = (received: Event) => {
    // Only `message` events are subscribed: each one is a MessageEvent.
    const event = received as MessageEvent
    if (!accept(event)) return
    const message = classifyHostMessage(event.data)
    if (!message) return
    const next = reduceToolObservation(snapshot, message)
    if (next === snapshot) return
    snapshot = next
    for (const listener of [...listeners]) listener()
  }
  source.addEventListener("message", onMessage)
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    dispose: () => {
      source.removeEventListener("message", onMessage)
    },
  }
}

let documentObserver: ToolResultObserver | null = null

/**
 * The view document's observer: installed once and kept for the document's
 * lifetime (one document renders one view). `null` outside a browser and in
 * a top-level window, where no host frames the view.
 *
 * It must listen before the view runtime connects, so it sees the
 * handshake. This module therefore installs it as the bundle evaluates
 * (below), ahead of any `bootstrapView` call in the entry module, whatever
 * the mount; `mountMcpToolkitApp` calls it again (idempotent). Installed any
 * later, it still sees what arrives afterwards, and the recovery falls back
 * to its grace timer for the rest.
 */
export function installToolResultObserver(): ToolResultObserver | null {
  if (documentObserver) return documentObserver
  if (typeof window === "undefined" || window.parent === window) return null
  const host = window.parent
  documentObserver = createToolResultObserver(window, (event) => event.source === host)
  return documentObserver
}

// Listen from the moment the view bundle evaluates (a passive listener; a
// no-op outside a framed browser document).
installToolResultObserver()
