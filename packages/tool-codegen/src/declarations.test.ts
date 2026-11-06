import { describe, expect, it } from "vitest"
import { draft07Tuples } from "./declarations.js"

describe("draft07Tuples", () => {
  // toStrictEqual: an `additionalItems: undefined` left behind is a different schema to read.
  it("spells a 2020-12 tuple as draft-07 does: prefixItems as items, items as additionalItems", () => {
    const string = { type: "string" }
    expect(draft07Tuples({ type: "array", prefixItems: [string], items: false })).toStrictEqual({
      type: "array",
      items: [string],
      additionalItems: false,
    })
    expect(draft07Tuples({ prefixItems: [string], items: { type: "number" } })).toStrictEqual({
      items: [string],
      additionalItems: { type: "number" },
    })
    expect(draft07Tuples({ prefixItems: [string], items: true })).toStrictEqual({
      items: [string],
      additionalItems: true,
    })
  })

  it("closes a tuple whose rest 2020-12 does not type, and drops what 2020-12 does not know", () => {
    const string = { type: "string" }
    expect(draft07Tuples({ prefixItems: [string] })).toStrictEqual({ items: [string] })
    expect(draft07Tuples({ prefixItems: [string], items: [true] })).toStrictEqual({
      items: [string],
    })
    expect(draft07Tuples({ prefixItems: [], additionalItems: true })).toStrictEqual({ items: [] })
  })

  it("rewrites tuples at every depth and leaves everything else as it is", () => {
    const tuple = { prefixItems: [{ type: "string" }], items: false }
    const draft07 = { items: [{ type: "string" }], additionalItems: false }
    const schema = {
      type: "object",
      properties: { a: tuple, prefixItems: { type: "array", items: [tuple] } },
      anyOf: [{ prefixItems: [tuple] }, true],
      $defs: { T: tuple },
      required: ["a"],
      enum: [null, 1],
    }
    expect(draft07Tuples(schema)).toStrictEqual({
      type: "object",
      properties: { a: draft07, prefixItems: { type: "array", items: [draft07] } },
      anyOf: [{ items: [draft07] }, true],
      $defs: { T: draft07 },
      required: ["a"],
      enum: [null, 1],
    })
  })
})
