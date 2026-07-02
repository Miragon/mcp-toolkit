import { describe, it, expect } from "vitest"
import { z } from "zod"
import { jsonSchemaToZod } from "./jsonSchemaToZod.js"

describe("jsonSchemaToZod", () => {
  it("returns z.any() for null/undefined/non-object input", () => {
    for (const value of [null, undefined, "schema", 42]) {
      const schema = jsonSchemaToZod(value)
      expect(schema.safeParse({ anything: true }).success).toBe(true)
      expect(schema.safeParse("string").success).toBe(true)
    }
  })

  it("maps primitive types to their Zod equivalents", () => {
    expect(jsonSchemaToZod({ type: "string" }).safeParse("ok").success).toBe(true)
    expect(jsonSchemaToZod({ type: "string" }).safeParse(1).success).toBe(false)

    expect(jsonSchemaToZod({ type: "number" }).safeParse(1.5).success).toBe(true)
    expect(jsonSchemaToZod({ type: "number" }).safeParse("1").success).toBe(false)

    expect(jsonSchemaToZod({ type: "integer" }).safeParse(7).success).toBe(true)

    expect(jsonSchemaToZod({ type: "boolean" }).safeParse(true).success).toBe(true)
    expect(jsonSchemaToZod({ type: "boolean" }).safeParse("true").success).toBe(false)

    expect(jsonSchemaToZod({ type: "null" }).safeParse(null).success).toBe(true)
    expect(jsonSchemaToZod({ type: "null" }).safeParse(undefined).success).toBe(false)
  })

  it("maps array → z.array with the items schema applied to entries", () => {
    const schema = jsonSchemaToZod({ type: "array", items: { type: "string" } })
    expect(schema.safeParse(["a", "b"]).success).toBe(true)
    expect(schema.safeParse(["a", 1]).success).toBe(false)
  })

  it("defaults missing items to z.any() for arrays", () => {
    const schema = jsonSchemaToZod({ type: "array" })
    expect(schema.safeParse([1, "two", { nested: true }]).success).toBe(true)
  })

  it("maps object → required fields are required, others are optional", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id"],
    })

    expect(schema.safeParse({ id: "x" }).success).toBe(true)
    expect(schema.safeParse({ id: "x", name: "y" }).success).toBe(true)
    expect(schema.safeParse({ name: "y" }).success).toBe(false)
  })

  it("treats schemas with `properties` but no explicit `type: object` as objects", () => {
    const schema = jsonSchemaToZod({
      properties: { id: { type: "string" } },
      required: ["id"],
    })
    expect(schema.safeParse({ id: "x" }).success).toBe(true)
    expect(schema.safeParse({ id: 1 }).success).toBe(false)
  })

  it("strips extra properties when additionalProperties is false", () => {
    // The converter uses Zod 4's default object mode (strip) for
    // `additionalProperties: false`. Extras parse successfully but are
    // dropped from the output — sufficient for proxy forwarding where the
    // upstream is the real validator.
    const schema = jsonSchemaToZod({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    })
    const result = schema.safeParse({ id: "x", extra: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ id: "x" })
  })

  it("keeps extra properties when additionalProperties is unset (loose mode)", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    })
    const result = schema.safeParse({ id: "x", extra: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ id: "x", extra: true })
  })

  it("maps `enum` with primitive literals to a z.union of literals", () => {
    const schema = jsonSchemaToZod({ type: "string", enum: ["1d", "7d", "30d"] })
    expect(schema.safeParse("7d").success).toBe(true)
    expect(schema.safeParse("90d").success).toBe(false)
  })

  it("collapses a single-value enum to a literal", () => {
    const schema = jsonSchemaToZod({ enum: ["only"] })
    expect(schema.safeParse("only").success).toBe(true)
    expect(schema.safeParse("other").success).toBe(false)
  })

  it("falls through to the type mapping when enum contains no primitive literals", () => {
    // An enum of objects can't become z.union(z.literal(...)) — fall back to
    // the type-based mapping so the field still parses something useful.
    const schema = jsonSchemaToZod({ type: "string", enum: [{ a: 1 }] })
    expect(schema.safeParse("anything").success).toBe(true)
  })

  it('maps `type: ["string", "null"]` to a nullable primitive', () => {
    const schema = jsonSchemaToZod({ type: ["string", "null"] })
    expect(schema.safeParse("ok").success).toBe(true)
    expect(schema.safeParse(null).success).toBe(true)
    expect(schema.safeParse(123).success).toBe(false)
  })

  it("falls back to z.any() for broader unions (more than one non-null type)", () => {
    const schema = jsonSchemaToZod({ type: ["string", "number"] })
    expect(schema.safeParse("ok").success).toBe(true)
    expect(schema.safeParse(123).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(true)
  })

  it("returns z.any() for unsupported constructs (oneOf/anyOf/$ref)", () => {
    // The converter is intentionally minimal: the upstream is the real
    // validator, so unsupported shapes fall through to z.any() rather than
    // erroring at proxy boot.
    expect(jsonSchemaToZod({ oneOf: [{ type: "string" }] }).safeParse(123).success).toBe(true)
    expect(jsonSchemaToZod({ anyOf: [{ type: "string" }] }).safeParse(true).success).toBe(true)
    expect(jsonSchemaToZod({ $ref: "#/definitions/Foo" }).safeParse({}).success).toBe(true)
  })

  it("recurses into object properties", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        outer: {
          type: "object",
          properties: { inner: { type: "number" } },
          required: ["inner"],
        },
      },
      required: ["outer"],
    })
    expect(schema.safeParse({ outer: { inner: 1 } }).success).toBe(true)
    expect(schema.safeParse({ outer: { inner: "no" } }).success).toBe(false)
  })

  it("returns a ZodType instance for every supported branch", () => {
    // Loose smoke check: the contract is documented as "always returns a
    // ZodTypeAny", so blindly handing the result to `.parse(...)` should
    // never throw because we returned undefined.
    const inputs: unknown[] = [
      null,
      {},
      { type: "string" },
      { type: "object", properties: {} },
      { type: "array" },
    ]
    for (const input of inputs) {
      const out = jsonSchemaToZod(input)
      expect(out).toBeInstanceOf(z.ZodType)
    }
  })

  it("does not overflow the stack on a pathologically deep schema", () => {
    // A malicious/broken upstream could serve a deeply self-nested schema.
    // The converter must bound its recursion instead of blowing the stack.
    let deep: Record<string, unknown> = { type: "string" }
    for (let i = 0; i < 5000; i++) {
      deep = { type: "object", properties: { next: deep }, required: ["next"] }
    }
    let schema: z.ZodTypeAny | undefined
    expect(() => {
      schema = jsonSchemaToZod(deep)
    }).not.toThrow()
    // Beyond the depth cap the shape degrades to permissive (z.any()), so a
    // value that stops short of the cap still parses without throwing.
    expect(schema).toBeInstanceOf(z.ZodType)
    expect(() => schema!.safeParse({ next: { next: {} } })).not.toThrow()
  })
})
