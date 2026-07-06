import { describe, it, expect } from "vitest"
import { extractToolCallName, extractToolCallNames, isMcpTransportPath } from "./tool-call-name.js"

describe("extractToolCallName", () => {
  it("returns params.name for a tools/call envelope", () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "analytics_query" },
    }
    expect(extractToolCallName(body)).toBe("analytics_query")
  })

  it("returns undefined for a non-tools/call method", () => {
    expect(extractToolCallName({ method: "tools/list", params: { name: "x" } })).toBeUndefined()
  })

  it("returns undefined when method is missing", () => {
    expect(extractToolCallName({ params: { name: "x" } })).toBeUndefined()
  })

  it("returns undefined when params is missing", () => {
    expect(extractToolCallName({ method: "tools/call" })).toBeUndefined()
  })

  it("returns undefined when params.name is missing", () => {
    expect(extractToolCallName({ method: "tools/call", params: {} })).toBeUndefined()
  })

  it("returns undefined when params.name is not a string", () => {
    expect(extractToolCallName({ method: "tools/call", params: { name: 42 } })).toBeUndefined()
    expect(
      extractToolCallName({ method: "tools/call", params: { name: { nested: true } } }),
    ).toBeUndefined()
  })

  it.each([null, undefined, 42, "string", [], true])(
    "returns undefined for non-object body %p",
    (body) => {
      expect(extractToolCallName(body)).toBeUndefined()
    },
  )

  // Streamable-HTTP revision 2025-03-26 allows JSON-RPC batches, and claude.ai
  // (via mcp-remote) frames single tools/call requests as one-element batches —
  // treating batches as "no name" made every claude.ai call log as "unknown"
  // and let batched calls slip past the role-filter guard.
  it("resolves the name of a single-element JSON-RPC batch", () => {
    const batch = [{ method: "tools/call", params: { name: "analytics_query" } }]
    expect(extractToolCallName(batch)).toBe("analytics_query")
  })

  it("returns the first tools/call name of a multi-entry batch", () => {
    const batch = [
      { method: "tools/list" },
      { method: "tools/call", params: { name: "analytics_query" } },
      { method: "tools/call", params: { name: "billing_invoice" } },
    ]
    expect(extractToolCallName(batch)).toBe("analytics_query")
  })
})

describe("extractToolCallNames", () => {
  it("returns a single-element array for a plain tools/call envelope", () => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "a_b" } }
    expect(extractToolCallNames(body)).toEqual(["a_b"])
  })

  it("returns every tools/call name of a batch, in order", () => {
    const batch = [
      { method: "tools/call", params: { name: "analytics_query" } },
      { method: "tools/call", params: { name: "billing_invoice" } },
    ]
    expect(extractToolCallNames(batch)).toEqual(["analytics_query", "billing_invoice"])
  })

  it("skips non-tools/call and malformed batch entries", () => {
    const batch = [
      { method: "tools/list" },
      null,
      "garbage",
      { method: "tools/call", params: { name: 42 } },
      { method: "tools/call", params: { name: "analytics_query" } },
    ]
    expect(extractToolCallNames(batch)).toEqual(["analytics_query"])
  })

  it.each([null, undefined, 42, "string", [], true, {}])(
    "returns an empty array for a body without tools/call %p",
    (body) => {
      expect(extractToolCallNames(body)).toEqual([])
    },
  )
})

describe("isMcpTransportPath", () => {
  // mcp-use mounts the Streamable-HTTP handler at BOTH endpoints, so a
  // `tools/call` over /sse must be captured too — otherwise the role-filter
  // guard falls open for calls routed through /sse.
  it.each(["/mcp", "/sse"])("captures MCP transport endpoint %s", (path) => {
    expect(isMcpTransportPath(path)).toBe(true)
  })

  it.each(["/oauth/callback/x", "/", "/mcp/", "/messages", ""])(
    "ignores non-transport path %p",
    (path) => {
      expect(isMcpTransportPath(path)).toBe(false)
    },
  )
})
