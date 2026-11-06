import { describe, expect, it } from "vitest"
import { draft07Tuples, markOptionalElements } from "./declarations.js"

const markers = { open: "OPEN", close: "CLOSE" }
const string = { type: "string" }
const number = { type: "number" }
/** An optional element, framed by the markers. */
const optional = (element: unknown) => [{ tsType: "OPEN" }, element, { tsType: "CLOSE" }]

// toStrictEqual: an `additionalItems: undefined` left behind is a different schema to read.
describe("draft07Tuples", () => {
  it("spells a 2020-12 tuple as draft-07 does: prefixItems as items, items as additionalItems", () => {
    expect(
      draft07Tuples({ type: "array", prefixItems: [string], items: false, minItems: 1 }, markers),
    ).toStrictEqual({ type: "array", items: [string], additionalItems: false })
    expect(
      draft07Tuples({ prefixItems: [string], items: number, minItems: 1 }, markers),
    ).toStrictEqual({ items: [string], additionalItems: number })
    expect(
      draft07Tuples({ prefixItems: [string], items: true, minItems: 1 }, markers),
    ).toStrictEqual({ items: [string], additionalItems: true })
  })

  it("leaves a tuple open unless items: false, additionalItems: false or maxItems closes it", () => {
    const cases: [Record<string, unknown>, Record<string, unknown>][] = [
      // 2020-12: no items, an items list or additionalItems beside prefixItems leaves it open
      [
        { prefixItems: [string], minItems: 1 },
        { items: [string], additionalItems: true },
      ],
      [
        { prefixItems: [string], items: [true], minItems: 1 },
        { items: [string], additionalItems: true },
      ],
      [
        { prefixItems: [], additionalItems: false },
        { items: [], additionalItems: true },
      ],
      // draft-07
      [
        { items: [string], minItems: 1 },
        { items: [string], additionalItems: true },
      ],
      [
        { items: [string], additionalItems: false, minItems: 1 },
        { items: [string], additionalItems: false },
      ],
      [
        { items: [string], additionalItems: number, minItems: 1 },
        { items: [string], additionalItems: number },
      ],
      // maxItems up to the listed elements closes it, with a rest or without, and drops the
      // elements past it; a larger one does not
      [
        { prefixItems: [string, number], items: number, minItems: 2, maxItems: 2 },
        { items: [string, number], additionalItems: false },
      ],
      [
        { items: [string, number], minItems: 1, maxItems: 1 },
        { items: [string], additionalItems: false },
      ],
      [
        { prefixItems: [string, number], maxItems: 0 },
        { items: [], additionalItems: false },
      ],
      [
        { prefixItems: [string], items: number, minItems: 1, maxItems: 2 },
        { items: [string], additionalItems: number },
      ],
    ]
    for (const [tuple, draft07] of cases) {
      expect(draft07Tuples(tuple, markers), JSON.stringify(tuple)).toStrictEqual(draft07)
    }
  })

  it("frames every element past minItems (0 without one) with the markers", () => {
    const cases: [Record<string, unknown>, Record<string, unknown>][] = [
      [
        { prefixItems: [string, number], items: false },
        { items: [...optional(string), ...optional(number)], additionalItems: false },
      ],
      [
        { prefixItems: [string, number], items: false, minItems: 0 },
        { items: [...optional(string), ...optional(number)], additionalItems: false },
      ],
      [
        { items: [string, number], minItems: 1 },
        { items: [string, ...optional(number)], additionalItems: true },
      ],
      [
        { prefixItems: [string, number], items: number, minItems: 1 },
        { items: [string, ...optional(number)], additionalItems: number },
      ],
      // a minItems past the listed elements makes them all required; past maxItems too
      [
        { prefixItems: [string], items: false, minItems: 9 },
        { items: [string], additionalItems: false },
      ],
      [
        { prefixItems: [string, number], minItems: 3, maxItems: 1 },
        { items: [string], additionalItems: false },
      ],
    ]
    for (const [tuple, draft07] of cases) {
      expect(draft07Tuples(tuple, markers), JSON.stringify(tuple)).toStrictEqual(draft07)
    }
  })

  it("rewrites tuples at every depth and leaves everything else as it is", () => {
    const tuple = { prefixItems: [string], items: false, minItems: 1 }
    const draft07 = { items: [string], additionalItems: false }
    const schema = {
      type: "object",
      properties: { a: tuple, prefixItems: { type: "array", items: [tuple], minItems: 1 } },
      anyOf: [{ prefixItems: [tuple] }, true],
      $defs: { T: tuple },
      required: ["a"],
      enum: [null, 1],
    }
    expect(draft07Tuples(schema, markers)).toStrictEqual({
      type: "object",
      properties: {
        a: draft07,
        prefixItems: { type: "array", items: [draft07], additionalItems: true },
      },
      anyOf: [{ items: optional(draft07), additionalItems: true }, true],
      $defs: { T: draft07 },
      required: ["a"],
      enum: [null, 1],
    })
  })
})

describe("markOptionalElements", () => {
  it("writes every framed element optional, in parentheses Prettier drops where it can", () => {
    expect(
      markOptionalElements(
        "[string, OPEN, (number | boolean), CLOSE, OPEN, {\nx?: string\n}, CLOSE, ...(unknown)[]]",
        markers,
      ),
    ).toBe("[string, ((number | boolean))?, ({\nx?: string\n})?, ...(unknown)[]]")
    expect(markOptionalElements("[OPEN, [OPEN, string, CLOSE], CLOSE]", markers)).toBe(
      "[([(string)?])?]",
    )
  })

  it("replaces only a marker in its place in a tuple", () => {
    const code = '{\n"OPEN": OPEN\n/** CLOSE */\nb?: "OPEN,CLOSE"\n}'
    expect(markOptionalElements(code, markers)).toBe(code)
  })
})
