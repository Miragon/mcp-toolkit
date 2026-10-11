import type { ViewStructuredContent } from "@miragon/mcp-toolkit-core"

export interface ParseToolResultOptions {
  /**
   * Which channel to read first when both are present.
   *
   * - `"structured"` (default): `structuredContent`-first. Since the widget-tool
   *   "text-channel diet" the text block carries only a short model-facing
   *   summary, while the data payload lives in `structuredContent` (the view
   *   builders and `*_data` feeds always set it). The text channel remains a
   *   fallback for plain results from other servers.
   * - `"text"`: text-first (the pre-0.4 behaviour) — JSON-decode the first text
   *   block, then fall back to `structuredContent`. Kept for callers that
   *   deliberately prefer a tool's human-readable text payload.
   */
  prefer?: "structured" | "text"
}

/**
 * A tool answered with an `isError` result: a deterministic failure of the
 * call itself (a validation error, an engine 404), not of the transport.
 * Thrown by {@link parseToolResult}; the query hooks never retry it by
 * default, since repeating the call repeats the answer. Still an `Error`
 * with the tool's first text block as its message.
 */
export class ToolResultError extends Error {
  /** The `isError` result as the tool returned it. */
  readonly result: unknown

  constructor(message: string, result: unknown) {
    super(message)
    this.name = "ToolResultError"
    this.result = result
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Whether `error` is a tool's own `isError` answer: a {@link ToolResultError},
 * or mcp-use's `ToolError` (how `useDynamicTool` rejects an `isError` result
 * inside a view), recognised by its name and result so the root barrel never
 * imports `mcp-use/react`. Transport failures (a lost connection, a JSON-RPC
 * error such as an unknown tool) are not tool errors.
 */
export function isToolError(error: unknown): boolean {
  if (error instanceof ToolResultError) return true
  if (!(error instanceof Error) || error.name !== "ToolError") return false
  const result: unknown = (error as Error & { result?: unknown }).result
  return isRecord(result) && result.isError === true
}

/**
 * Decodes an MCP tool result down to its data payload.
 *
 * Default (`prefer: "structured"`): `isError` → throw a
 * {@link ToolResultError} with the first text block,
 * then `structuredContent` (if non-null), then JSON-decode the first text
 * block (verbatim string if it isn't JSON), then the raw result.
 *
 * This is **structured-first** — a deliberate, observable change from the
 * pre-0.4 text-first parsing: tools that return BOTH a text summary and
 * `structuredContent` now yield the structured payload, not the summary
 * string. `useToolQuery`/`useToolMutation` and the MCP App shell all decode
 * through this one parser so the convention is uniform.
 */
export function parseToolResult<T = unknown>(result: unknown, opts?: ParseToolResultOptions): T {
  const r = result as
    | {
        content?: Array<{ text?: string }>
        structuredContent?: unknown
        isError?: boolean
      }
    | undefined
  if (r?.isError) throw new ToolResultError(r.content?.[0]?.text ?? "Tool call failed", result)

  const fromStructured = (): T | undefined =>
    r?.structuredContent != null ? (r.structuredContent as T) : undefined
  const fromText = (): T | undefined => {
    const text = r?.content?.[0]?.text
    if (text == null) return undefined
    try {
      return JSON.parse(text) as T
    } catch {
      return text as T
    }
  }

  if (opts?.prefer === "text") {
    const text = fromText()
    if (text !== undefined) return text
    const structured = fromStructured()
    if (structured !== undefined) return structured
    return r as T
  }

  const structured = fromStructured()
  if (structured !== undefined) return structured
  const text = fromText()
  if (text !== undefined) return text
  return r as T
}

/** Shape of the `structuredContent` envelope emitted by the view builders. */
type ViewEnvelope = Pick<ViewStructuredContent, "context">

/**
 * Decodes a `*_show_*` widget-tool result down to the widget's flat data
 * payload. `buildSingleWidgetView`/`buildComposedView` wrap the data in the
 * `McpAppView` envelope (`context.stepData[<id>].data`); this unwraps it:
 * single-step views yield the step's data directly, multi-step composed views
 * yield an object keyed by step id. Non-envelope results (e.g. `*_data`
 * feeds) pass through {@link parseToolResult} unchanged.
 */
export function parseViewToolResult<T = unknown>(result: unknown): T {
  const parsed = parseToolResult<unknown>(result)
  const ctx = (parsed as ViewEnvelope | null)?.context
  const stepIds = ctx?.stepIds
  if (ctx?.stepData && Array.isArray(stepIds) && stepIds.length > 0) {
    if (stepIds.length === 1) return ctx.stepData[stepIds[0] ?? ""]?.data as T
    return Object.fromEntries(stepIds.map((id) => [id, ctx.stepData[id]?.data])) as T
  }
  return parsed as T
}
