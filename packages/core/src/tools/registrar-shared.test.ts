import { describe, expect, it } from "vitest"
import { z } from "zod"
import { registrarInputSchema, strictInputSchema, unknownKeysMessage } from "./registrar-shared.js"

describe("unknownKeysMessage", () => {
  it("names a single unknown key and every valid key", () => {
    expect(unknownKeysMessage(["qury"], ["query", "limit"])).toBe(
      'Unknown key "qury". Valid keys: "query", "limit".',
    )
  })

  it("pluralises several unknown keys", () => {
    expect(unknownKeysMessage(["a", "b"], ["c"])).toBe('Unknown keys "a", "b". Valid keys: "c".')
  })

  it("says the tool takes no arguments when nothing is valid", () => {
    expect(unknownKeysMessage(["x"], [])).toBe('Unknown key "x". This tool takes no arguments.')
  })
})

describe("strictInputSchema", () => {
  const shape = { query: z.string(), limit: z.number().optional() }

  it("advertises additionalProperties: false", () => {
    expect(z.toJSONSchema(strictInputSchema(shape), { io: "input" })).toMatchObject({
      additionalProperties: false,
    })
  })

  it("accepts known keys and rejects unknown ones with the valid-keys message", () => {
    const schema = strictInputSchema(shape)
    expect(schema.parse({ query: "a" })).toEqual({ query: "a" })

    const result = schema.safeParse({ query: "a", extra: 1 })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Unknown key "extra". Valid keys: "query", "limit".',
    ])
  })

  it("leaves every other issue's default message alone", () => {
    const result = strictInputSchema(shape).safeParse({ query: 1 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).not.toContain("Unknown key")
  })
})

describe("registrarInputSchema", () => {
  it("keeps the 2.x default: no schema without a shape, a stripping object with one", () => {
    expect(registrarInputSchema(undefined, false)).toBeUndefined()

    const loose = registrarInputSchema({ a: z.string() }, false)
    expect(loose?.parse({ a: "x", b: 1 })).toEqual({ a: "x" })
  })

  it("is strict when asked — also without a shape", () => {
    expect(registrarInputSchema({ a: z.string() }, true)?.safeParse({ a: "x", b: 1 }).success).toBe(
      false,
    )
    expect(registrarInputSchema(undefined, true)?.safeParse({ b: 1 }).success).toBe(false)
    expect(registrarInputSchema(undefined, true)?.safeParse({}).success).toBe(true)
  })
})
