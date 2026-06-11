import { describe, it, expect } from "vitest"
import { extractToolCallName } from "./tool-call-name.js"

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

  it("does not mistake a JSON-RPC batch array for a single call", () => {
    const batch = [{ method: "tools/call", params: { name: "analytics_query" } }]
    expect(extractToolCallName(batch)).toBeUndefined()
  })
})
