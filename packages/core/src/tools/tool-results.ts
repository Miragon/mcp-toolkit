/**
 * Toolkit-owned `CallToolResult` builders, byte-for-byte equivalent to the
 * mcp-use v1 response helpers (`text` / `object` / `error`) the registrars
 * used to import. The v2 migration guide deprecates those helpers in favour
 * of raw result structures; owning the three shapes the toolkit actually
 * emits keeps the wire output identical across the swap and survives their
 * eventual upstream removal.
 */

/** A plain-text tool result (`text/plain` mime hint), as mcp-use's `text()` emitted. */
export function textResult(content: string) {
  return {
    content: [{ type: "text" as const, text: content }],
    _meta: { mimeType: "text/plain" },
  }
}

/**
 * An object tool result: pretty-printed JSON text plus `structuredContent`,
 * as mcp-use's `object()` emitted for non-array payloads (the registrars wrap
 * arrays into `{ data }` before calling this — see `toStructuredContent`).
 */
export function objectResult<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    _meta: { mimeType: "application/json" },
  }
}

/**
 * An error tool result. The literal `isError: true` matters: tools with an
 * `outputSchema` (every view-bound tool) have a callback type demanding
 * either matching `structuredContent` or an explicit `isError: true` result.
 */
export function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  }
}
