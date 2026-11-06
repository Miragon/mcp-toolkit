import { describe, expect, it } from "vitest"
import { parseToolResult } from "./parse-tool-result.js"
import { isToolCallError, ToolCallError } from "./tool-call-error.js"
import type { ToolCallResult } from "./types.js"

const text = (value: string) => ({ type: "text", text: value })
const image = { type: "image", data: "aGk=", mimeType: "image/png" }

function caught(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error("expected the call to throw")
}

describe("parseToolResult on isError", () => {
  it("throws a ToolCallError carrying the tool name, the raw result and its text", () => {
    const result: ToolCallResult = { isError: true, content: [text("Order 42 not found")] }

    const error = caught(() => parseToolResult("get_order", result))

    expect(error).toBeInstanceOf(ToolCallError)
    expect(error).toMatchObject({
      name: "ToolCallError",
      message: "Order 42 not found",
      toolName: "get_order",
    })
    expect((error as ToolCallError).result).toBe(result)
  })

  it("joins every text block of the result into the message, skipping other blocks", () => {
    const result = { isError: true, content: [text("first"), image, text("second")] }

    expect(() => parseToolResult("t", result)).toThrow(/^first\nsecond$/)
  })

  it("trims the message", () => {
    expect(new ToolCallError("t", { content: [text("  spaced out \n")] }).message).toBe(
      "spaced out",
    )
  })

  it("names the tool when the result carries no text", () => {
    for (const result of [
      { isError: true },
      { isError: true, content: [image] },
      { isError: true, content: [text(" \n ")] },
    ]) {
      expect(() => parseToolResult("delete_order", result)).toThrow(
        /^Tool "delete_order" reported an error$/,
      )
    }
  })

  it("throws even when the result also carries structuredContent", () => {
    expect(() =>
      parseToolResult("t", { isError: true, structuredContent: { ok: true }, content: [] }),
    ).toThrow(ToolCallError)
  })

  it("decodes a result with isError: false like any other", () => {
    expect(parseToolResult("t", { isError: false, structuredContent: 1 })).toBe(1)
  })
})

describe("parseToolResult on success", () => {
  it("returns structuredContent as is, ahead of the text content", () => {
    const structuredContent = { items: [1, 2] }

    expect(parseToolResult("t", { structuredContent, content: [text('{"items":[]}')] })).toBe(
      structuredContent,
    )
  })

  it.each([0, false, null, ""])("returns the falsy structuredContent %j", (value) => {
    expect(parseToolResult("t", { structuredContent: value, content: [text("42")] })).toBe(value)
  })

  it.each([
    ['{"id":7,"tags":["a"]}', { id: 7, tags: ["a"] }],
    ["[1,2]", [1, 2]],
    ["42", 42],
    ["true", true],
    ["null", null],
    ['"quoted"', "quoted"],
  ])("returns the JSON value of the text %s", (raw, expected) => {
    expect(parseToolResult("t", { content: [text(raw)] })).toEqual(expected)
  })

  it.each(["Order created", "{not json", ""])("returns the non-JSON text %j as is", (raw) => {
    expect(parseToolResult("t", { content: [text(raw)] })).toBe(raw)
  })

  it("reads the first text block, past a non-text block before it", () => {
    expect(parseToolResult("t", { content: [image, text("[1]"), text("[2]")] })).toEqual([1])
  })

  it("skips blocks that only look like text blocks", () => {
    const content = [
      null,
      undefined,
      "text",
      { type: "text" },
      { type: "text", text: 1 },
      { type: "markdown", text: "# not a text block" },
      text("ok"),
    ]

    expect(parseToolResult("t", { content })).toBe("ok")
  })

  it.each<[string, ToolCallResult]>([
    ["no content", {}],
    ["empty content", { content: [] }],
    ["only non-text blocks", { content: [image] }],
    ["content that is not an array", { content: "oops" as unknown as readonly unknown[] }],
  ])("returns undefined for %s", (_, result) => {
    expect(parseToolResult("t", result)).toBeUndefined()
  })
})

describe('parseToolResult with { text: "raw" }', () => {
  it.each(["2.10", "12345678901234567890", "true", "null", '{"id":1}', " 42 \n", "plain"])(
    "returns the text %j as it is",
    (raw) => {
      expect(parseToolResult("t", { content: [text(raw)] }, { text: "raw" })).toBe(raw)
    },
  )

  it("still prefers structuredContent, throws on isError and yields undefined without text", () => {
    expect(
      parseToolResult("t", { structuredContent: 7, content: [text("8")] }, { text: "raw" }),
    ).toBe(7)
    expect(() => parseToolResult("t", { isError: true }, { text: "raw" })).toThrow(ToolCallError)
    expect(parseToolResult("t", { content: [image] }, { text: "raw" })).toBeUndefined()
  })

  it('decodes JSON as before with { text: "json" }', () => {
    expect(parseToolResult("t", { content: [text("2.10")] }, { text: "json" })).toBe(2.1)
  })
})

describe("isToolCallError", () => {
  const BRAND = Symbol.for("@miragon/mcp-toolkit-tool-codegen-core/ToolCallError")

  it("is true for a ToolCallError", () => {
    expect(isToolCallError(new ToolCallError("t", { isError: true }))).toBe(true)
  })

  it("is true for a ToolCallError of another copy of the package, which instanceof misses", () => {
    const foreign = Object.defineProperty(new Error("from another copy"), BRAND, { value: true })

    expect(foreign).not.toBeInstanceOf(ToolCallError)
    expect(isToolCallError(foreign)).toBe(true)
  })

  it.each([
    ["a plain Error", new Error("boom")],
    ["an error named ToolCallError", Object.assign(new Error("x"), { name: "ToolCallError" })],
    ["a non-true brand", { [BRAND]: "yes" }],
    ["null", null],
    ["undefined", undefined],
    ["a string", "ToolCallError"],
  ])("is false for %s", (_, value) => {
    expect(isToolCallError(value)).toBe(false)
  })
})
