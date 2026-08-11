import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { parseToolResult } from "./parse-tool-result.js"

// Deterministic PRNG: a property failure in CI must replay identically on the
// next run, never appear as a fresh random draw (FITNESS.md phase 5c).
fc.configureGlobal({ seed: 42, numRuns: 100 })

// CallToolResult-ish shapes: structuredContent × content arrays whose first
// text block is valid JSON about half the time and arbitrary text otherwise.
const textArb = fc.oneof(
  fc.string(),
  fc.jsonValue().map((value) => JSON.stringify(value)),
)
const contentArb = fc.oneof(
  fc.constant([]),
  fc.array(fc.record({ type: fc.constant("text"), text: textArb }, { requiredKeys: ["type"] }), {
    maxLength: 2,
  }),
)
const resultArb = fc.record(
  {
    isError: fc.constant(false),
    structuredContent: fc.oneof(fc.constant(null), fc.jsonValue()),
    content: contentArb,
  },
  { requiredKeys: [] },
)

describe("parseToolResult (property)", () => {
  // Bug class guarded: this is the single decode seam every widget, query hook
  // and the app shell funnel through — a malformed host response crashing here
  // would take down the whole widget render path instead of one data read.
  it("never throws on arbitrary junk without a truthy isError", () => {
    const junkArb = fc
      .anything()
      .filter((junk) => !(typeof junk === "object" && junk !== null && "isError" in junk))
    fc.assert(
      fc.property(junkArb, (junk) => {
        expect(() => parseToolResult(junk)).not.toThrow()
      }),
    )
  })

  // Bug class guarded: the structured-first precedence IS the 0.4 contract —
  // a tool emitting both a text summary and structuredContent must decode to
  // the data payload, never regress to the summary string; and every result
  // must land on a documented outcome (structured, JSON text, verbatim text,
  // raw result), never on undefined.
  it("yields exactly the documented outcome, structured content first", () => {
    fc.assert(
      fc.property(resultArb, (result) => {
        const out: unknown = parseToolResult(result)
        const text = Array.isArray(result.content) ? result.content[0]?.text : undefined
        if (result.structuredContent != null) {
          expect(out).toBe(result.structuredContent)
        } else if (text !== undefined) {
          let decoded: unknown = text
          try {
            decoded = JSON.parse(text)
          } catch {
            // Non-JSON text is returned verbatim — that IS the documented outcome.
          }
          expect(out).toEqual(decoded)
        } else {
          expect(out).toBe(result)
        }
      }),
    )
  })

  // Bug class guarded: error results must surface as thrown Errors carrying
  // the first text block, so TanStack Query error states (and try/catch in
  // widgets) show the server's message instead of silently rendering junk.
  it("throws the first text block for every isError result", () => {
    fc.assert(
      fc.property(resultArb, fc.string(), (result, message) => {
        const errorResult = { ...result, isError: true, content: [{ type: "text", text: message }] }
        let thrown: unknown
        try {
          parseToolResult(errorResult)
        } catch (err) {
          thrown = err
        }
        expect(thrown).toBeInstanceOf(Error)
        expect((thrown as Error).message).toBe(message)
      }),
    )
  })
})
