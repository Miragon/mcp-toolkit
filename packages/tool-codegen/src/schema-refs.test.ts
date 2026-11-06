import { describe, expect, it } from "vitest"
import { sanitizeSchema } from "./sanitize-schema.js"
import { normalizeRefs } from "./schema-refs.js"

/** What the generator hands json-schema-to-typescript. */
const prepared = (schema: unknown) => normalizeRefs(sanitizeSchema(schema))

/** An object schema with these properties. */
const object = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  type: "object",
  properties,
  ...extra,
})

describe("normalizeRefs: targets move into the root $defs", () => {
  // json2ts names only root $defs entries; any other target is inlined at every use, so a
  // chain of them doubles the output per level and a cycle of them gets an unprefixed name.
  it("moves a target reached by path into $defs, under a key its path spells", () => {
    const filter = {
      anyOf: [{ type: "string" }, { type: "array", items: { $ref: "#/properties/filter" } }],
    }
    expect(prepared(object({ filter }))).toEqual({
      type: "object",
      properties: { filter: { $ref: "#/$defs/Filter" } },
      $defs: {
        Filter: {
          anyOf: [{ type: "string" }, { type: "array", items: { $ref: "#/$defs/Filter" } }],
        },
      },
    })
  })

  it("moves nested targets apart, each referring to the other", () => {
    expect(
      prepared(
        object({
          a: { type: "array", items: { type: "object" } },
          x: { $ref: "#/properties/a" },
          y: { $ref: "#/properties/a/items" },
        }),
      ),
    ).toEqual({
      type: "object",
      properties: {
        a: { $ref: "#/$defs/A" },
        x: { $ref: "#/$defs/A" },
        y: { $ref: "#/$defs/AItems" },
      },
      $defs: {
        A: { type: "array", items: { $ref: "#/$defs/AItems" } },
        AItems: { type: "object" },
      },
    })
  })

  it("spells the key of tuple items, compositions and additionalProperties", () => {
    const schema = object(
      {
        p: { type: "array", items: [{ type: "string" }, { type: "number" }] },
        q: { anyOf: [{ type: "string" }] },
        r: { $ref: "#/properties/p/items/1" },
        s: { $ref: "#/properties/q/anyOf/0" },
        t: { $ref: "#/additionalProperties" },
        u: { $ref: "#/additionalProperties/additionalItems" },
      },
      { additionalProperties: { type: "array", additionalItems: { type: "null" } } },
    )
    expect(prepared(schema).$defs).toEqual({
      AdditionalProperties: {
        type: "array",
        additionalItems: { $ref: "#/$defs/AdditionalPropertiesAdditionalItems" },
      },
      AdditionalPropertiesAdditionalItems: { type: "null" },
      PItems1: { type: "number" },
      QAnyOf0: { type: "string" },
    })
  })

  it("walks draft 2020-12 prefixItems like a tuple's items, and its items as one schema", () => {
    const schema = object({
      p: {
        type: "array",
        prefixItems: [{ type: "string" }, { type: "object", properties: { n: { $ref: "#" } } }],
        items: { type: "boolean" },
      },
      r: { $ref: "#/properties/p/prefixItems/1" },
      s: { $ref: "#/properties/p/items" },
    })
    const out = prepared(schema)
    expect(out.$defs).toEqual({
      PItems: { type: "boolean" },
      PPrefixItems1: { type: "object", properties: { n: { $ref: "#" } } },
    })
    expect((out.properties as Record<string, unknown>).p).toEqual({
      type: "array",
      prefixItems: [{ type: "string" }, { $ref: "#/$defs/PPrefixItems1" }],
      items: { $ref: "#/$defs/PItems" },
    })
  })

  it("keeps the root's own definitions referenced, under a sanitised key, and drops the rest", () => {
    const schema = object(
      {
        a: { $ref: "#/$defs/my-type" },
        b: { $ref: "#/definitions/Legacy" },
        c: { $ref: "#/$defs/Unused/properties/x" },
        self: { $ref: "#" },
      },
      {
        $defs: { "my-type": { type: "string" }, Unused: object({ x: { type: "number" } }) },
        definitions: { Legacy: { type: "boolean" } },
      },
    )
    expect(prepared(schema)).toEqual({
      type: "object",
      properties: {
        a: { $ref: "#/$defs/MyType" },
        b: { $ref: "#/$defs/Legacy" },
        c: { $ref: "#/$defs/UnusedX" },
        self: { $ref: "#" },
      },
      $defs: {
        MyType: { type: "string" },
        UnusedX: { type: "number" },
        Legacy: { type: "boolean" },
      },
    })
  })

  it("drops $defs and definitions below the root, moving a referenced entry up", () => {
    const schema = object({
      a: object(
        { b: { $ref: "#/properties/a/$defs/B" } },
        { $defs: { B: { type: "string" }, C: {} } },
      ),
    })
    expect(prepared(schema)).toEqual({
      type: "object",
      properties: { a: { type: "object", properties: { b: { $ref: "#/$defs/AB" } } } },
      $defs: { AB: { type: "string" } },
    })
  })

  it("rewrites and resolves $refs in every map and list: patternProperties, allOf, oneOf", () => {
    const schema = object(
      {
        x: { oneOf: [{ $ref: "#/$defs/my-a" }, { type: "null" }] },
        y: { $ref: "#/patternProperties/^p-" },
        z: { $ref: "#/oneOf/1" },
        w: { $ref: "#/allOf/0" },
      },
      {
        patternProperties: { "^p-": { type: "number" }, "^q-": { $ref: "#/$defs/my-a" } },
        allOf: [{ type: "object" }, { $ref: "#/$defs/my-a" }],
        oneOf: [{ $ref: "#/$defs/my-a" }, { type: "object", required: [] }],
        $defs: { "my-a": { type: "string" } },
      },
    )
    expect(prepared(schema)).toEqual({
      type: "object",
      properties: {
        x: { oneOf: [{ $ref: "#/$defs/MyA" }, { type: "null" }] },
        y: { $ref: "#/$defs/P" },
        z: { $ref: "#/$defs/OneOf1" },
        w: { $ref: "#/$defs/AllOf0" },
      },
      patternProperties: { "^p-": { $ref: "#/$defs/P" }, "^q-": { $ref: "#/$defs/MyA" } },
      allOf: [{ $ref: "#/$defs/AllOf0" }, { $ref: "#/$defs/MyA" }],
      oneOf: [{ $ref: "#/$defs/MyA" }, { $ref: "#/$defs/OneOf1" }],
      $defs: {
        P: { type: "number" },
        AllOf0: { type: "object" },
        OneOf1: { type: "object", required: [] },
        MyA: { type: "string" },
      },
    })
  })

  it("indexes a list by canonical decimal indexes only, of any length", () => {
    const members = Array.from({ length: 11 }, (_, i) => ({ const: i }))
    const schema = object({
      u: { anyOf: members },
      ten: { $ref: "#/properties/u/anyOf/10" },
      one: { $ref: "#/properties/u/anyOf/01" },
      zero: { $ref: "#/properties/u/anyOf/00" },
    })
    const properties = prepared(schema).properties as Record<string, unknown>
    expect([properties.ten, properties.one, properties.zero]).toEqual([
      { $ref: "#/$defs/UAnyOf10" },
      {},
      {},
    ])
  })

  it("numbers a key another one already holds, and names a key without letters", () => {
    const schema = object(
      {
        filter: { type: "string" },
        工具: { type: "number" },
        r: { $ref: "#/properties/filter" },
        s: { $ref: "#/properties/工具" },
        t: { $ref: "#/$defs/工具" },
      },
      { $defs: { Filter: { type: "boolean" }, 工具: { type: "null" } } },
    )
    expect(prepared(schema).$defs).toEqual({
      Filter2: { type: "string" },
      Ref: { type: "number" },
      Def: { type: "null" },
    })
  })

  it("counts on past the numbers taken, and lets a boolean definition hold no key", () => {
    const schema = object(
      {
        a: { type: "string" },
        b: { type: "number" },
        r: { $ref: "#/properties/a" },
        s: { $ref: "#/properties/b" },
      },
      { $defs: { A: { type: "null" }, A2: { type: "null" }, B: true } },
    )
    expect(Object.keys(prepared(schema).$defs as object)).toEqual(["A3", "B"])
  })
})

describe("normalizeRefs: what a $ref may name", () => {
  // A pointer at a name→schema map, a keyword value or a prototype member would make json2ts
  // read map keys as keywords (a $defs entry named tsType), crash or emit nonsense.
  it.each([
    "#/$defs",
    "#/properties",
    "#/patternProperties",
    "#/required",
    "#/required/0",
    "#/description",
    "#/type",
    "#/__proto__",
    "#/toString",
    "#/__proto__/constructor",
    "#/properties/__proto__",
    "#/properties/missing",
    "#/properties/a/items/0",
    "#/properties/t/0",
    "#/properties/u/prefixItems",
    "#/properties/u/prefixItems/1",
    "#/properties/u/prefixItems/00",
    "#/properties/u/prefixItems/length",
    "#/properties/v/prefixItems/0",
    "#/allOf/01",
    "#/allOf/-1",
    "#/allOf/9",
    "#/",
    "#/properties/b/type",
  ])("turns %j into unknown", (ref) => {
    const schema = object(
      {
        a: { type: "array", items: { type: "string" } },
        b: true,
        t: { type: "array", items: [{ type: "string" }] },
        u: { type: "array", prefixItems: [{ type: "string" }] },
        // not a list: the sanitiser drops it
        v: { type: "array", prefixItems: { type: "string" } },
        // what "#/properties" would wrongly reach, should the map's key be read as undefined
        undefined: { type: "string" },
        x: { $ref: ref },
      },
      {
        required: ["a"],
        description: "d",
        allOf: [{ type: "object" }, { type: "object" }],
        $defs: { tsType: true },
      },
    )
    expect((prepared(schema).properties as Record<string, unknown>).x).toEqual({})
  })

  it("names nothing by a pointer that is not local, should one reach it unsanitised", () => {
    const schema = object({
      a: { type: "string" },
      b: { $ref: "#xproperties/a" },
      c: { $ref: "#anchor" },
      d: { $ref: "other.json#/properties/a" },
    })
    expect(normalizeRefs(schema)).toEqual(object({ a: { type: "string" }, b: {}, c: {}, d: {} }))
  })

  it("turns a $ref to a boolean schema into unknown (json2ts crashes on it)", () => {
    const schema = object(
      { b: true, x: { $ref: "#/properties/b" }, y: { $ref: "#/$defs/T" } },
      { $defs: { T: false } },
    )
    expect(prepared(schema)).toEqual(object({ b: true, x: {}, y: {} }))
  })

  it("reads a pointer segment as json-schema-ref-parser does: ~1, ~0, then URI decoding", () => {
    const schema = object({
      "a/b": { type: "string" },
      "c~d": { type: "integer" },
      a: { type: "number" },
      "%": { type: "boolean" },
      r1: { $ref: "#/properties/a~1b" },
      r2: { $ref: "#/properties/c~0d" },
      r3: { $ref: "#/properties/%61" },
      r4: { $ref: "#/properties/%" },
    })
    const properties = prepared(schema).properties as Record<string, unknown>
    expect([properties.r1, properties.r2, properties.r3, properties.r4]).toEqual([
      { $ref: "#/$defs/AB" },
      { $ref: "#/$defs/CD" },
      { $ref: "#/$defs/A" },
      { $ref: "#/$defs/Ref" },
    ])
  })
})

describe("normalizeRefs: chains, cycles and sibling keywords", () => {
  it("follows bare $refs to the schema they end at, and turns a cycle of them into unknown", () => {
    const schema = object(
      { a: { $ref: "#/$defs/A" }, c: { $ref: "#/$defs/C" }, d: { $ref: "#/$defs/D" } },
      {
        $defs: {
          A: { $ref: "#/$defs/B" },
          B: { type: "string" },
          C: { $ref: "#/$defs/D" },
          D: { $ref: "#/$defs/C" },
        },
      },
    )
    expect(prepared(schema)).toEqual({
      type: "object",
      properties: { a: { $ref: "#/$defs/B" }, c: {}, d: {} },
      $defs: { B: { type: "string" } },
    })
  })

  it("walks a long chain of bare $refs once, without recursion", () => {
    const length = 5000
    const $defs = Object.fromEntries(
      Array.from({ length }, (_, i) => [
        `D${i}`,
        i === length - 1 ? { type: "string" } : { $ref: `#/$defs/D${i + 1}` },
      ]),
    )
    const started = performance.now()
    const out = prepared(
      object({ a: { $ref: "#/$defs/D0" }, b: { $ref: "#/$defs/D1" } }, { $defs }),
    )
    expect(out.properties).toEqual({
      a: { $ref: `#/$defs/D${length - 1}` },
      b: { $ref: `#/$defs/D${length - 1}` },
    })
    expect(performance.now() - started).toBeLessThan(2000)
  })

  // json2ts copies the target of a $ref with siblings and inlines the copy: as costly as an
  // anonymous target.
  it("moves a $ref with sibling keywords into allOf next to them", () => {
    const schema = object(
      {
        a: { $ref: "#/$defs/A", description: "d" },
        b: { $ref: "#/$defs/A", allOf: [{ type: "object" }] },
      },
      { $defs: { A: { type: "object" } } },
    )
    expect(prepared(schema).properties).toEqual({
      a: { description: "d", allOf: [{ $ref: "#/$defs/A" }] },
      b: { allOf: [{ type: "object" }, { $ref: "#/$defs/A" }] },
    })
  })

  it("drops a $ref of a schema to itself", () => {
    expect(prepared(object({ a: { $ref: "#/properties/a", type: "string" } }))).toEqual({
      type: "object",
      properties: { a: { $ref: "#/$defs/A" } },
      $defs: { A: { type: "string" } },
    })
    expect(prepared({ $ref: "#" })).toEqual({})
    expect(prepared({ $ref: "#", type: "object" })).toEqual({ type: "object" })
  })

  it("keeps a root that only refers to one of its definitions", () => {
    expect(prepared({ $ref: "#/$defs/A", $defs: { A: { type: "string" } } })).toEqual({
      $ref: "#/$defs/A",
      $defs: { A: { type: "string" } },
    })
  })

  it("leaves a schema without $refs as sanitizeSchema rebuilt it", () => {
    const schema = object(
      { a: { type: "array", items: [{ type: "string" }], additionalItems: false } },
      { additionalProperties: true },
    )
    expect(prepared(schema)).toEqual(sanitizeSchema(schema))
  })
})
