import { describe, expect, it } from "vitest"
import { errorResult, objectResult, textResult } from "./tool-results.js"

/**
 * Pinned against the exact shapes mcp-use v1's `text()` / `object()` /
 * `error()` emitted — these builders replaced those deprecated helpers, and
 * the wire output must not drift in the swap.
 */
describe("tool result builders", () => {
  it("textResult mirrors mcp-use's text()", () => {
    expect(textResult("hello")).toEqual({
      content: [{ type: "text", text: "hello" }],
      _meta: { mimeType: "text/plain" },
    })
  })

  it("objectResult mirrors mcp-use's object() for records", () => {
    expect(objectResult({ a: 1 })).toEqual({
      content: [{ type: "text", text: JSON.stringify({ a: 1 }, null, 2) }],
      structuredContent: { a: 1 },
      _meta: { mimeType: "application/json" },
    })
  })

  it("errorResult mirrors mcp-use's error() with a literal isError", () => {
    const result = errorResult("[503] nope")
    expect(result).toEqual({ isError: true, content: [{ type: "text", text: "[503] nope" }] })
    // Literal true, not a widened boolean — outputSchema'd callbacks need it.
    const _check: true = result.isError
    void _check
  })
})
