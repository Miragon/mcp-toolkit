/**
 * The type declarations of one side (input or output) of a tool: an override,
 * `unknown` without a schema, `Record<string, …>` for an object without
 * properties, else json-schema-to-typescript's output for the prepared schema.
 */
import { randomUUID } from "node:crypto"
import { compile, DEFAULT_OPTIONS, type Options as CompileOptions } from "json-schema-to-typescript"
import { format } from "prettier"
import type { ToolDescriptor } from "./fetch-tools.js"
import { jsString } from "./identifiers.js"
import { assignment, printDoc } from "./layout.js"
import { docComment, escapeInvisible } from "./safe-text.js"
import { isJsonObject, type JsonObject } from "./sanitize-schema.js"

export interface Declaration {
  readonly code: string
  /** The names it declares at the top level. */
  readonly names: readonly string[]
}

export async function declareType(
  tool: ToolDescriptor,
  side: "input" | "output",
  name: string,
  override: string | undefined,
  schema: JsonObject | undefined,
): Promise<Declaration> {
  const alias = (type: string, doc = "") => ({
    code: doc + printDoc(assignment(`export type ${name}`, type)),
    names: [name],
  })
  if (override !== undefined) return alias(override.trim())
  if (schema === undefined) return alias("unknown")
  if (isEmptyObjectSchema(schema)) {
    // No arguments, but an output object the schema says nothing more about may hold anything.
    const open = side === "output" && schema.additionalProperties !== false
    return alias(
      open ? "Record<string, unknown>" : "Record<string, never>",
      docComment(schema.description),
    )
  }
  try {
    const code = await compileSchema(schema, name)
    return { code, names: Array.from(code.matchAll(DECLARATION), (match) => match[1] as string) }
  } catch (error) {
    const literal = jsString(tool.name)
    throw new Error(
      `cannot generate the ${side} type of the tool ${literal}: ${(error as Error).message}. ` +
        `Set overrides[${literal}].${side} to a TypeScript type to skip its schema.`,
      { cause: error },
    )
  }
}

/**
 * A top-level declaration in json-schema-to-typescript's Prettier-formatted
 * output. It declares no enums: those need `tsEnumNames`, which
 * `sanitizeSchema` drops.
 */
const DECLARATION = /^export (?:interface|type) ([A-Za-z_$][\w$]*)/gm

/** json-schema-to-typescript's options, where they differ from its defaults. */
const COMPILE_OPTIONS: Partial<CompileOptions> = {
  // A property the schema does not declare is an error, not an index signature.
  additionalProperties: false,
  bannerComment: "",
  // compileSchema formats the code itself, once the optional tuple elements are marked.
  format: false,
  // Never read a file or a URL for a `$ref`. sanitizeSchema already drops
  // non-local refs; should one slip through, the compile fails instead.
  $refOptions: { resolve: { external: false } },
  // draft07Tuples reads and removes a tuple's `minItems` and `maxItems`.
  // json2ts's own reading spells a tuple as the union of every length from
  // `minItems` up, `[] | [A] | [A, B]`: output that grows with the square of
  // the tuple's length.
  ignoreMinAndMaxItems: true,
}

/**
 * Prettier's options for json2ts's code, as json2ts would format it: its
 * default style under the toolkit's (and the template's) style. "preserve"
 * keeps json2ts's own quoting: a key stays quoted unless it is a plain ASCII
 * identifier, so no Unicode (an invisible filler, a homoglyph) reaches an
 * identifier position. A `.d.ts` path spares Prettier its JSX detection.
 */
const FORMAT_OPTIONS = {
  ...DEFAULT_OPTIONS.style,
  printWidth: 100,
  quoteProps: "preserve",
  semi: false,
  trailingComma: "all",
  parser: "typescript",
  filepath: "schema.d.ts",
} as const

/**
 * The `tsType`s draft07Tuples puts before and after an optional tuple element.
 * json2ts writes a tuple's elements joined by ", ", so `[A, open, B, close]`
 * reads `[A, (B)?]` once `markOptionalElements` has replaced them, and
 * Prettier drops the parentheses it does not need. Each compile draws a fresh
 * UUID for them after the server has sent its schemas, so no key, literal or
 * description can spell one; one left over is a syntax error (its "-"), never
 * a type.
 */
export interface OptionalElementMarkers {
  readonly open: string
  readonly close: string
}

function optionalElementMarkers(): OptionalElementMarkers {
  const nonce = randomUUID()
  return { open: `__open-${nonce}`, close: `__close-${nonce}` }
}

/**
 * json2ts's unformatted code with every element framed by `markers` written
 * optional. Exported for tests.
 */
export function markOptionalElements(code: string, markers: OptionalElementMarkers): string {
  return code.replaceAll(`${markers.open}, `, "(").replaceAll(`, ${markers.close}`, ")?")
}

/**
 * The schema in the tuple spelling json-schema-to-typescript reads, draft-07's:
 * `items` as a list and `additionalItems` for the elements after it, every
 * optional element framed by `markers`. Draft 2020-12 spells a tuple
 * `prefixItems` with `items` for the rest (zod 4 emits `z.tuple([a, b])` as
 * `prefixItems: [a, b], items: false`); json2ts ignores `prefixItems` and
 * types that `never[]`. Runs after normalizeRefs, so a `$ref` into
 * `prefixItems` already names its hoisted target.
 *
 * As JSON Schema reads a tuple: an element past `minItems` (default 0) may be
 * missing, so it is optional, `[A, B?]`. The tuple is closed only by
 * `items: false` (`additionalItems: false` in draft-07) or a `maxItems` no
 * larger than the listed elements (pydantic closes a tuple so), which also
 * drops the elements past it. Otherwise further elements are allowed: of the
 * rest's schema, or `unknown` when nothing types them, `[A, ...unknown[]]`.
 * A `maxItems` above the listed elements and a `minItems` past them are not
 * typed (as for any array): expanding them would let a number from the server
 * size the output.
 *
 * Walks every object below `schema`: only a schema node can hold a list under
 * `prefixItems` or `items`, since the values of a name→schema map are schemas,
 * never lists. Exported for tests.
 */
export function draft07Tuples(schema: JsonObject, markers: OptionalElementMarkers): JsonObject {
  // One node per marker for the whole schema: json2ts parses a node it meets again only once.
  return tuplesIn(schema, { open: { tsType: markers.open }, close: { tsType: markers.close } })
}

interface Frame {
  readonly open: JsonObject
  readonly close: JsonObject
}

function tuplesIn(schema: JsonObject, frame: Frame): JsonObject {
  const out = Object.fromEntries(
    Object.entries(schema).map(([keyword, value]) => [keyword, tuplesBelow(value, frame)]),
  )
  const { prefixItems, items, additionalItems, minItems, maxItems, ...tuple } = out
  const listed: unknown = Array.isArray(prefixItems) ? prefixItems : items
  if (!Array.isArray(listed)) return out
  // 2020-12 has no `additionalItems` and no `items` list: next to `prefixItems` they mean nothing.
  const rest = listed === prefixItems ? items : additionalItems
  // sanitizeSchema keeps `minItems` and `maxItems` only as non-negative safe integers.
  const max = maxItems as number | undefined
  const elements: unknown[] = listed.slice(0, max)
  const required = Math.min((minItems as number | undefined) ?? 0, elements.length)
  tuple.items = [
    ...elements.slice(0, required),
    ...elements.slice(required).flatMap((element) => [frame.open, element, frame.close]),
  ]
  // A `maxItems` no larger than the listed elements closes it, and is the length of `elements`.
  const closed = rest === false || elements.length === max
  tuple.additionalItems = closed ? false : isJsonObject(rest) ? rest : true
  return tuple
}

function tuplesBelow(value: unknown, frame: Frame): unknown {
  if (Array.isArray(value)) return value.map((entry) => tuplesBelow(entry, frame))
  return isJsonObject(value) ? tuplesIn(value, frame) : value
}

/**
 * One declaration (plus those of its `$defs`) for a prepared schema. Exported
 * for tests. Every name it declares starts with `name`: two tools never
 * declare the same type, and none can shadow a global the files use.
 */
export async function compileSchema(schema: JsonObject, name: string): Promise<string> {
  const markers = optionalElementMarkers()
  const raw = await compile({ ...draft07Tuples(schema, markers), title: name }, name, {
    ...COMPILE_OPTIONS,
    // Declarations json-schema-to-typescript names after a `$ref` target or a
    // `$defs` key are prefixed with the tool's type name.
    customName: (node, definitionKey) => {
      if (node.title === name) return name
      const id: unknown = node.$id
      const source = typeof id === "string" ? id : definitionKey
      return source === undefined ? undefined : `${name}${source}`
    },
  })
  const code = await format(markOptionalElements(raw, markers), FORMAT_OPTIONS)
  // normalizeRefs leaves json2ts nothing to name on its own; should it still
  // (an anonymous cycle is named after a property key), fail rather than emit it.
  const stray = Array.from(code.matchAll(DECLARATION), (match) => match[1] as string).find(
    (declared) => !declared.startsWith(name),
  )
  if (stray !== undefined) {
    throw new Error(
      `json-schema-to-typescript declared ${JSON.stringify(stray)} without the prefix ${name}`,
    )
  }
  return escapeInvisible(code.trim())
}

const EMPTY_OBJECT_KEYS = new Set([
  "type",
  "description",
  "properties",
  "required",
  "additionalProperties",
])

/** `{ type: "object" }` without properties: `Record<string, never>`, not the `{}` that accepts any value. */
function isEmptyObjectSchema(schema: JsonObject): boolean {
  return (
    schema.type === "object" &&
    Object.keys(schema).every((key) => EMPTY_OBJECT_KEYS.has(key)) &&
    (schema.properties === undefined ||
      (isJsonObject(schema.properties) && Object.keys(schema.properties).length === 0)) &&
    (schema.additionalProperties === undefined || schema.additionalProperties === false) &&
    !hasRequiredEntries(schema)
  )
}

/** No root `$ref` among them: normalizeRefs turns one with siblings (such as `type`) into `allOf`. */
const COMPOSITION_KEYS = ["allOf", "anyOf", "oneOf"]

/**
 * The members TypeScript gives every object type: `{}` has them, so `{}` is
 * not assignable to an input with an optional property of that name and
 * another type.
 */
export const OBJECT_MEMBERS = new Set([
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
])

/** True when `{}` is a valid input, so the generated `args` parameter may default to it. */
export function argsAreOptional(schema: JsonObject): boolean {
  const properties = isJsonObject(schema.properties) ? schema.properties : {}
  return (
    schema.type === "object" &&
    !COMPOSITION_KEYS.some((key) => Object.hasOwn(schema, key)) &&
    !hasRequiredEntries(schema) &&
    !Object.keys(properties).some((key) => OBJECT_MEMBERS.has(key)) &&
    !Object.values(properties).some((property) => isFlaggedRequired(schema, property))
  )
}

/**
 * The draft 3 flag `required: true`, on the property or on the target of its
 * `$ref` (json2ts reads it after dereferencing). A normalised `$ref` is `#` or
 * a root `$defs` entry, never another bare `$ref`.
 */
function isFlaggedRequired(root: JsonObject, property: unknown): boolean {
  // A boolean schema destructures to undefined fields.
  const { required, $ref } = property as { required?: unknown; $ref?: unknown }
  if (required === true) return true
  if (typeof $ref !== "string") return false
  const definitions = isJsonObject(root.$defs) ? root.$defs : {}
  const target = $ref === "#" ? root : definitions[$ref.slice("#/$defs/".length)]
  return isJsonObject(target) && target.required === true
}

function hasRequiredEntries(schema: JsonObject): boolean {
  return Array.isArray(schema.required) && schema.required.length > 0
}
