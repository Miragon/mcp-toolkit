/**
 * A tool's JSON schemas come from the server and are untrusted input to
 * json-schema-to-typescript, which copies parts of a schema into the generated
 * code as raw text and resolves `$ref`s by reading files and URLs
 * (Miragon/mcp-toolkit#177). `sanitizeSchema` rebuilds a schema from the
 * keywords that shape a TypeScript type, each checked for its JSON Schema
 * shape. Everything else is dropped, notably:
 *
 * - `tsType` and `tsEnumNames`, json-schema-to-typescript's extensions that
 *   emit their value as raw TypeScript;
 * - `title`, `$id` and `id`, which would name top-level declarations after
 *   upstream text (and `$id` moves the base of `$ref` resolution);
 * - `minItems`/`maxItems` (a value that is not a number lands raw in a JSDoc
 *   tag, and json2ts expands a huge one into a huge tuple), but a tuple's as
 *   non-negative safe integers: draft07Tuples reads them and removes them
 *   before json2ts sees the schema;
 * - every `$ref` that is not local to the schema (`#` or `#/…`): such a
 *   reference becomes `unknown` instead of a file read or an HTTP request;
 * - `enum`/`const` values that are not JSON primitives.
 *
 * Descriptions and `patternProperties` keys, which end up in comments, go
 * through `commentText`.
 */
import { commentText } from "./safe-text.js"

export type JsonObject = { [key: string]: unknown }

const JSON_TYPES: ReadonlySet<unknown> = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string",
])
const LOCAL_REF = /^#(?:\/.*)?$/s

/** The kept keywords, each with the check that rebuilds its value (`undefined`: drop it). */
const KEYWORDS: Record<string, (value: unknown) => unknown> = {
  type: sanitizeType,
  enum: (value) => (Array.isArray(value) && value.every(isPrimitive) ? [...value] : undefined),
  const: (value) => (isPrimitive(value) ? value : undefined),
  required: sanitizeRequired,
  $ref: (value) => (typeof value === "string" && LOCAL_REF.test(value) ? value : undefined),
  description: (value) => (typeof value === "string" ? commentText(value) : undefined),
  deprecated: booleanOnly,
  nullable: booleanOnly,
  additionalProperties: schemaOrBoolean,
  additionalItems: schemaOrBoolean,
  // A tuple: draft 2020-12's `prefixItems`, or draft-07's `items` as a list.
  prefixItems: schemaList,
  items: (value) => (Array.isArray(value) ? value.map(sanitizeNode) : schemaOrBoolean(value)),
  allOf: schemaList,
  anyOf: schemaList,
  oneOf: schemaList,
  properties: (value) => schemaMap(value, (key) => key),
  $defs: (value) => schemaMap(value, (key) => key),
  definitions: (value) => schemaMap(value, (key) => key),
  patternProperties: (value) => schemaMap(value, commentText),
}

/** The schema rebuilt from its type-shaping keywords; a non-object schema becomes `{}`. */
export function sanitizeSchema(schema: unknown): JsonObject {
  if (!isJsonObject(schema)) return {}
  const out: JsonObject = {}
  for (const [keyword, sanitize] of Object.entries(KEYWORDS)) {
    const value = sanitize(schema[keyword])
    if (value !== undefined) out[keyword] = value
  }
  return declareRequired(tupleBounds(schema, keywordsForItsTypes(out)))
}

/** The keywords that shape an object type, and those that shape an array type. */
const OBJECT_KEYWORDS = ["properties", "patternProperties", "additionalProperties"]
const ARRAY_KEYWORDS = ["items", "prefixItems"]

/**
 * Whether the object keywords give an object type a member. Without one it is `{}`, which takes
 * any value but null, so in a union it would switch off the check of the other side.
 */
function typesAnObject({ properties, patternProperties, additionalProperties }: JsonObject) {
  return (
    [properties, patternProperties].some(
      (map) => isJsonObject(map) && Object.keys(map).length > 0,
    ) ||
    (additionalProperties !== undefined && additionalProperties !== false)
  )
}

/**
 * JSON Schema applies object keywords to objects only and array keywords to arrays only, but
 * json2ts intersects the types of every kind of keyword a schema has: `{ properties, items }`
 * became `{ a?: string } & string[]`, a type neither a valid object nor a valid array has. So a
 * schema without `type` that has both kinds gets `type: ["object", "array"]`, which json2ts
 * types as the union of the two, if its object keywords type anything; one whose `type` names no
 * object loses its object keywords, which json2ts reads on the root and on a `$defs` target
 * whatever the `type` says. `normalizeRefs` moves a `type` list away from a composition next to it.
 */
function keywordsForItsTypes(schema: JsonObject): JsonObject {
  if (schema.type === undefined) {
    const typesAnArray = ARRAY_KEYWORDS.some((keyword) => Object.hasOwn(schema, keyword))
    return typesAnArray && typesAnObject(schema) ? { type: ["object", "array"], ...schema } : schema
  }
  if ([schema.type].flat().includes("object")) return schema
  return Object.fromEntries(
    Object.entries(schema).filter(([keyword]) => !OBJECT_KEYWORDS.includes(keyword)),
  )
}

/**
 * A tuple's `minItems` and `maxItems`, as non-negative safe integers (a larger
 * one, such as `1e300`, is not exact and counts as absent): they decide
 * which elements are optional and whether it takes more (see draft07Tuples).
 * Any other array's bounds are not typed.
 */
function tupleBounds(schema: JsonObject, out: JsonObject): JsonObject {
  if (!Array.isArray(out.prefixItems) && !Array.isArray(out.items)) return out
  for (const keyword of ["minItems", "maxItems"]) {
    const value = schema[keyword]
    if (Number.isSafeInteger(value) && (value as number) >= 0) out[keyword] = value
  }
  return out
}

/**
 * An object schema whose `required` names properties it does not describe
 * gets them as `{}` (`unknown`): json2ts would type `{ type: "object",
 * required: ["id"] }` as `{}`, which accepts any value but null. Not when an
 * index signature types them: an `unknown` property would conflict with it.
 */
function declareRequired(schema: JsonObject): JsonObject {
  const isObject =
    schema.type === "object" || (Array.isArray(schema.type) && schema.type.includes("object"))
  if (!isObject || !Array.isArray(schema.required)) return schema
  if (schema.patternProperties !== undefined || isJsonObject(schema.additionalProperties))
    return schema
  const properties = isJsonObject(schema.properties) ? schema.properties : {}
  const missing = (schema.required as string[]).filter((name) => !Object.hasOwn(properties, name))
  if (missing.length === 0) return schema
  return {
    ...schema,
    properties: { ...properties, ...Object.fromEntries(missing.map((name) => [name, {}])) },
  }
}

function sanitizeNode(value: unknown): boolean | JsonObject {
  return typeof value === "boolean" ? value : sanitizeSchema(value)
}

function booleanOnly(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function schemaOrBoolean(value: unknown): boolean | JsonObject | undefined {
  return typeof value === "boolean" || isJsonObject(value) ? sanitizeNode(value) : undefined
}

function schemaList(value: unknown): (boolean | JsonObject)[] | undefined {
  return Array.isArray(value) ? value.map(sanitizeNode) : undefined
}

/** A name → schema map; `Object.fromEntries` keeps a `__proto__` key an own property. */
function schemaMap(value: unknown, sanitizeKey: (key: string) => string): JsonObject | undefined {
  if (!isJsonObject(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).map(([key, schema]) => [sanitizeKey(key), sanitizeNode(schema)]),
  )
}

function sanitizeType(type: unknown): string | string[] | undefined {
  if (!Array.isArray(type)) return JSON_TYPES.has(type) ? (type as string) : undefined
  // Each type once: json2ts builds one union member per entry, whose schema it prints to compare.
  const known = new Set(type.filter((entry): entry is string => JSON_TYPES.has(entry)))
  return known.size > 0 ? [...known] : undefined
}

/** Draft 4+ `required: [names]`, or the draft 3 property flag `required: true`. */
function sanitizeRequired(required: unknown): string[] | true | undefined {
  if (required === true) return true
  if (!Array.isArray(required)) return undefined
  return required.filter((name): name is string => typeof name === "string")
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    Number.isFinite(value)
  )
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
