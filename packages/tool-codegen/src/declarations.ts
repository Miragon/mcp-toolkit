/**
 * The type declarations of one side (input or output) of a tool: an override,
 * `unknown` without a schema, `Record<string, …>` for an object without
 * properties, else json-schema-to-typescript's output for the prepared schema.
 */
import { compile, type Options as CompileOptions } from "json-schema-to-typescript"
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
  // Format like Prettier with the toolkit's style (and the template's code).
  // "preserve" keeps json2ts's own quoting: a key stays quoted unless it is a
  // plain ASCII identifier, so no Unicode (an invisible filler, a homoglyph)
  // reaches an identifier position.
  style: {
    printWidth: 100,
    quoteProps: "preserve",
    semi: false,
    trailingComma: "all",
  },
  // Never read a file or a URL for a `$ref`. sanitizeSchema already drops
  // non-local refs; should one slip through, the compile fails instead.
  $refOptions: { resolve: { external: false } },
}

/**
 * One declaration (plus those of its `$defs`) for a prepared schema. Exported
 * for tests. Every name it declares starts with `name`: two tools never
 * declare the same type, and none can shadow a global the files use.
 */
export async function compileSchema(schema: JsonObject, name: string): Promise<string> {
  const code = await compile({ ...schema, title: name }, name, {
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
