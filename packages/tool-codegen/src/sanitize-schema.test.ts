import { describe, expect, it } from "vitest"
import { sanitizeSchema } from "./sanitize-schema.js"

describe("sanitizeSchema", () => {
  it("keeps the keywords that shape a type", () => {
    const schema = {
      type: "object",
      description: "An order.",
      properties: {
        id: { type: "string", deprecated: true },
        status: { enum: ["open", "done", 1, true, null] },
        kind: { const: "order" },
        note: { type: ["string", "null"], nullable: true },
        tags: { type: "array", items: { type: "string" } },
        pair: {
          type: "array",
          items: [{ type: "string" }, { type: "number" }],
          additionalItems: false,
        },
        prefixed: {
          type: "array",
          prefixItems: [{ type: "string" }, { $ref: "#/$defs/Other" }],
          items: { type: "boolean" },
        },
        closed: { type: "array", prefixItems: [true], items: false },
        choice: { anyOf: [{ type: "string" }, { $ref: "#/$defs/Other" }] },
        both: { allOf: [{ type: "object" }], oneOf: [true, false] },
      },
      patternProperties: { "^x-": { type: "string" } },
      additionalProperties: { type: "number" },
      required: ["id"],
      $defs: { Other: { type: "integer" } },
      definitions: { Legacy: { type: "boolean", required: true } },
    }
    expect(sanitizeSchema(schema)).toEqual(schema)
  })

  it("drops raw-text extensions, naming keywords and everything unknown, at every depth", () => {
    const hostile = {
      tsType: "x",
      tsEnumNames: ["A"],
      title: "T",
      $id: "http://evil/",
      id: "legacy-id",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      default: { $ref: "file:///etc/passwd" },
      examples: [1],
      minItems: "*/ x /*",
      maxItems: 1e9,
      format: "uri",
      "x-vendor": { tsType: "y" },
    }
    expect(
      sanitizeSchema({
        ...hostile,
        type: "object",
        properties: { a: { ...hostile, type: "string" } },
        items: { ...hostile },
        prefixItems: [{ ...hostile }],
        anyOf: [{ ...hostile }],
        additionalProperties: { ...hostile },
        $defs: { D: { ...hostile } },
      }),
    ).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
      items: {},
      prefixItems: [{}],
      anyOf: [{}],
      additionalProperties: {},
      $defs: { D: {} },
    })
  })

  it("keeps only local $refs", () => {
    const refs = [
      "#",
      "#/$defs/A",
      "#/properties/a/items",
      "file:///etc/hosts",
      "http://127.0.0.1/s.json",
      "s.json",
      "#anchor",
      "//host/x",
      "#\n/x",
      "other.json#/definitions/x",
    ]
    expect(refs.map((ref) => sanitizeSchema({ $ref: ref }))).toEqual([
      { $ref: "#" },
      { $ref: "#/$defs/A" },
      { $ref: "#/properties/a/items" },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
    ])
    expect(sanitizeSchema({ $ref: 42 })).toEqual({})
    expect(sanitizeSchema({ $ref: ["#"] })).toEqual({})
  })

  it("cleans descriptions and patternProperties keys for comments", () => {
    expect(
      sanitizeSchema({
        description: "a */ b\r\nc",
        patternProperties: { "^a*/b*/": { type: "string", description: "*/" } },
      }),
    ).toEqual({
      description: "a *\\/ b\nc",
      patternProperties: { "^a*\\/b*\\/": { type: "string", description: "*\\/" } },
    })
    expect(sanitizeSchema({ description: 42 })).toEqual({})
  })

  it("drops enum and const values that are not JSON primitives", () => {
    expect(sanitizeSchema({ enum: ["a", { $ref: "file:///etc/hosts" }] })).toEqual({})
    expect(sanitizeSchema({ enum: [[1]] })).toEqual({})
    expect(sanitizeSchema({ enum: "a" })).toEqual({})
    expect(sanitizeSchema({ const: { $ref: "file:///etc/hosts" } })).toEqual({})
    expect(sanitizeSchema({ const: null })).toEqual({ const: null })
    expect(sanitizeSchema({ enum: [Number.NaN] })).toEqual({})
  })

  it("checks each keyword's shape", () => {
    expect(
      sanitizeSchema({
        type: "*/ evil",
        required: "id",
        deprecated: "yes",
        nullable: 1,
        properties: ["a"],
        allOf: { type: "string" },
        additionalProperties: "x",
        additionalItems: 0,
        items: "string",
        prefixItems: { type: "string" },
        patternProperties: null,
        $defs: "D",
      }),
    ).toEqual({})
    expect(sanitizeSchema({ prefixItems: "*/ evil" })).toEqual({})
    expect(sanitizeSchema({ type: ["string", "*/", 1, "null"] })).toEqual({
      type: ["string", "null"],
    })
    expect(sanitizeSchema({ type: ["*/"] })).toEqual({})
    expect(sanitizeSchema({ required: ["a", 1, "b"] })).toEqual({ required: ["a", "b"] })
    expect(sanitizeSchema({ required: false })).toEqual({})
  })

  it("turns subschemas that are not schemas into {}, and keeps boolean schemas", () => {
    expect(
      sanitizeSchema({
        properties: { a: 5, b: "string", c: null, d: true, e: false },
        anyOf: [1, true],
        prefixItems: ["string", null, false],
        items: true,
      }),
    ).toEqual({
      properties: { a: {}, b: {}, c: {}, d: true, e: false },
      anyOf: [{}, true],
      prefixItems: [{}, {}, false],
      items: true,
    })
    expect(sanitizeSchema("not a schema")).toEqual({})
    expect(sanitizeSchema([{ type: "string" }])).toEqual({})
    expect(sanitizeSchema(null)).toEqual({})
  })

  // json2ts types `{ type: "object", required: ["id"] }` as `{}`, which accepts 42.
  it("declares the required names an object schema has no property for as {}", () => {
    expect(sanitizeSchema({ type: "object", required: ["id", "name"] })).toEqual({
      type: "object",
      required: ["id", "name"],
      properties: { id: {}, name: {} },
    })
    expect(
      sanitizeSchema({
        type: ["object", "null"],
        properties: { id: { type: "string" } },
        required: ["id", "__proto__"],
        additionalProperties: true,
      }).properties,
    ).toEqual(JSON.parse('{"id":{"type":"string"},"__proto__":{}}'))
  })

  it("leaves required alone where it declares nothing new or an index signature types the names", () => {
    const untouched = [
      { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      { type: "object", required: [] },
      { type: "string", required: ["id"] },
      { required: ["id"] },
      { type: "object", required: true },
      { type: "object", required: ["id"], additionalProperties: { type: "number" } },
      { type: "object", required: ["id"], patternProperties: { "^i": { type: "string" } } },
    ]
    for (const schema of untouched) expect(sanitizeSchema(schema)).toEqual(schema)
  })

  it("keeps a __proto__ property an own key instead of a prototype", () => {
    const schema: unknown = JSON.parse(
      '{"properties":{"__proto__":{"type":"string"},"constructor":{"type":"number"}}}',
    )
    const properties = sanitizeSchema(schema).properties as Record<string, unknown>
    expect(Object.getPrototypeOf(properties)).toBe(Object.prototype)
    expect(Object.keys(properties)).toEqual(["__proto__", "constructor"])
    expect(Object.getOwnPropertyDescriptor(properties, "__proto__")?.value).toEqual({
      type: "string",
    })
  })
})
