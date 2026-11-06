/**
 * The local `$ref`s of a sanitised schema, rewritten so that
 * json-schema-to-typescript declares every reference target once, by name, and
 * inlines none:
 *
 * - A `$ref` has to name a schema position of this schema: `#`, or a path
 *   through `properties`, `patternProperties`, `$defs`, `definitions`,
 *   `prefixItems`, `items`, `additionalProperties`, `additionalItems`, `allOf`,
 *   `anyOf` and `oneOf`, own keys only. Anything else (a name→schema map, a
 *   `required` list, a prototype member), a boolean schema and a cycle of bare
 *   `$ref`s become `unknown`: json2ts would read map keys as keywords, crash or
 *   recurse.
 * - Every target but the root moves into the root `$defs`, under a key built
 *   from the [A-Za-z0-9] runs of its path, and its old place refers to it.
 *   json2ts names a root `$defs` entry after its key (prefixed by
 *   `customName`) and inlines any other target at every use: a chain of such
 *   targets doubled the output per level, and a cycle of them got a name
 *   without the tool's prefix.
 * - A `$ref` with sibling keywords becomes `allOf: [{ $ref }]` next to them:
 *   json2ts copies the target for such a `$ref` and inlines the copy, which
 *   doubles the output per level just the same.
 * - A `type` list next to `allOf`, `anyOf` or `oneOf` moves into a last branch
 *   of `allOf`, with what it types: json2ts copies a node with a `type` list into
 *   one union member per type, siblings included, and each member prints the
 *   composition again, which multiplies the output per level.
 *
 * Every `$ref` left is `#` or `#/$defs/<key>` with an [A-Za-z0-9] key, the root
 * `$defs` hold exactly the referenced targets, and no `$defs` or `definitions`
 * is left below the root (json2ts declares only the root's).
 *
 * In a sanitised schema an object sits only in a schema position or in a
 * name→schema map (every other keyword holds a primitive or a list of them),
 * so the walks below treat any other keyword's object value as a subschema.
 */
import { pascalCase } from "./identifiers.js"
import { isJsonObject, type JsonObject } from "./sanitize-schema.js"

const MAPS = new Set(["properties", "patternProperties", "$defs", "definitions"])
const LISTS = new Set(["allOf", "anyOf", "oneOf", "prefixItems"])
const DEFINITIONS = new Set(["$defs", "definitions"])
const INDEX = /^(?:0|[1-9]\d*)$/

/** A keyword's value that may be a subschema, and the word its position adds to a hoisted key. */
interface Child {
  readonly keyword: string
  readonly schema: unknown
  readonly word: string
}

/** `items` as a tuple (indexed like `allOf`), or one schema. */
function isListed(keyword: string, value: unknown): boolean {
  return LISTS.has(keyword) || (keyword === "items" && Array.isArray(value))
}

/** The values of a sanitised node that may be subschemas, in its keyword order. */
function childrenOf(node: JsonObject): Child[] {
  return Object.entries(node).flatMap(([keyword, value]): Child[] => {
    if (MAPS.has(keyword)) {
      return Object.entries(value as JsonObject).map(([key, schema]) => ({
        keyword,
        schema,
        word: pascalCase(key),
      }))
    }
    const word = pascalCase(keyword)
    if (isListed(keyword, value)) {
      return (value as unknown[]).map((schema, index) => ({
        keyword,
        schema,
        word: `${word}${index}`,
      }))
    }
    return [{ keyword, schema: value, word }]
  })
}

/** JSON Pointer unescaping, then URI decoding, as json-schema-ref-parser reads a segment. */
function decodeSegment(segment: string): string {
  const unescaped = segment.replaceAll("~1", "/").replaceAll("~0", "~")
  try {
    return decodeURIComponent(unescaped)
  } catch {
    return unescaped
  }
}

/** An own entry of a map, or the entry at a canonical index of a list. */
function entryOf(container: unknown, key: string): unknown {
  if (Array.isArray(container)) return INDEX.test(key) ? container[Number(key)] : undefined
  return isJsonObject(container) && Object.hasOwn(container, key) ? container[key] : undefined
}

/** What a local pointer names, walking schema positions and own keys only. */
function resolvePointer(root: JsonObject, ref: string): unknown {
  if (ref === "#") return root
  if (!ref.startsWith("#/")) return undefined
  const segments = ref.slice(2).split("/").map(decodeSegment)
  let node: unknown = root
  for (let at = 0; at < segments.length; at++) {
    if (!isJsonObject(node)) return undefined
    const keyword = segments[at] as string
    const value = Object.hasOwn(node, keyword) ? node[keyword] : undefined
    if (MAPS.has(keyword) || isListed(keyword, value)) {
      at++
      node = at < segments.length ? entryOf(value, segments[at] as string) : undefined
    } else {
      node = value
    }
  }
  return node
}

/** A node that only refers elsewhere, once its `$defs` and `definitions` are gone. */
function isBareRef(node: JsonObject): boolean {
  return Object.keys(node).every((key) => key === "$ref" || DEFINITIONS.has(key))
}

/**
 * Looks up the object schema a `$ref` finally names, following bare `$ref`s;
 * undefined for no `$ref`, a pointer that names no schema position, a boolean
 * schema or a cycle. Memoised per pointer, so a long chain is walked once.
 */
function targetFinder(root: JsonObject): (ref: unknown) => JsonObject | undefined {
  const found = new Map<string, JsonObject | undefined>()
  return (ref) => {
    const chain = new Set<string>()
    let target: JsonObject | undefined
    for (let next = ref; typeof next === "string";) {
      if (found.has(next)) {
        target = found.get(next)
        break
      }
      if (chain.has(next)) {
        target = undefined
        break
      }
      chain.add(next)
      const node = resolvePointer(root, next)
      target = isJsonObject(node) ? node : undefined
      next = target !== undefined && isBareRef(target) ? target.$ref : undefined
    }
    for (const link of chain) found.set(link, target)
    return target
  }
}

/** `base`, or `base` with the first free number appended; marks it used. */
function uniqueKey(base: string, used: Set<string>): string {
  let key = base
  for (let n = 2; used.has(key); n++) key = `${base}${n}`
  used.add(key)
  return key
}

/** Every object node below `node` (itself included), depth first, with the name its path spells. */
function nodesOf(node: JsonObject, name: string): [JsonObject, string][] {
  return [
    [node, name],
    ...childrenOf(node)
      .filter((child): child is Child & { schema: JsonObject } => isJsonObject(child.schema))
      .flatMap(({ schema, word }) => nodesOf(schema, name + word)),
  ]
}

/** What stays on a node when its `type` list moves into a branch of `allOf`. */
const BESIDE_TYPE_LIST = new Set(["allOf", "anyOf", "oneOf", "description", "deprecated"])

/** The node with its `type` list in a branch of `allOf`, if a composition is next to it. */
function typeListAsBranch(node: JsonObject): JsonObject {
  const { type, allOf, anyOf, oneOf } = node
  if (!Array.isArray(type) || type.length < 2) return node
  if (allOf === undefined && anyOf === undefined && oneOf === undefined) return node
  // The draft 3 flag `required: true` speaks for the node's place in its parent, so it stays.
  const stays = ([keyword, value]: [string, unknown]) =>
    BESIDE_TYPE_LIST.has(keyword) || (keyword === "required" && value === true)
  const entries = Object.entries(node)
  return {
    ...Object.fromEntries(entries.filter(stays)),
    allOf: [
      ...((allOf as unknown[] | undefined) ?? []),
      Object.fromEntries(entries.filter((entry) => !stays(entry))),
    ],
  }
}

/** Rewrites the `$ref`s of a sanitised schema; see the module comment. */
export function normalizeRefs(root: JsonObject): JsonObject {
  const targetOf = targetFinder(root)
  const nodes = nodesOf(root, "")

  // The root's own definitions keep their (sanitised) key, ahead of any hoisted one.
  const used = new Set<string>()
  const definitionKeys = new Map<unknown, string>()
  for (const { keyword, schema, word } of childrenOf(root)) {
    if (DEFINITIONS.has(keyword) && isJsonObject(schema)) {
      definitionKeys.set(schema, uniqueKey(word || "Def", used))
    }
  }

  const targets = new Set(nodes.map(([node]) => targetOf(node.$ref)))
  targets.delete(root)
  const keys = new Map<JsonObject, string>()
  for (const [node, name] of nodes) {
    if (targets.has(node))
      keys.set(node, definitionKeys.get(node) ?? uniqueKey(name || "Ref", used))
  }

  const refTo = (target: JsonObject) => (target === root ? "#" : `#/$defs/${keys.get(target)}`)
  const place = (schema: unknown): unknown => {
    if (!isJsonObject(schema)) return schema
    return keys.has(schema) ? { $ref: refTo(schema) } : rebuild(schema)
  }
  const rebuild = (node: JsonObject): JsonObject => {
    const out: JsonObject = {}
    for (const [keyword, value] of Object.entries(node)) {
      if (keyword === "$ref" || DEFINITIONS.has(keyword)) continue
      if (MAPS.has(keyword)) {
        const map = Object.entries(value as JsonObject)
        out[keyword] = Object.fromEntries(map.map(([key, schema]) => [key, place(schema)]))
      } else {
        out[keyword] = isListed(keyword, value) ? (value as unknown[]).map(place) : place(value)
      }
    }
    const target = targetOf(node.$ref)
    if (target === undefined || target === node) return typeListAsBranch(out)
    if (Object.keys(out).length === 0) return { $ref: refTo(target) }
    return typeListAsBranch({
      ...out,
      allOf: [...((out.allOf as unknown[] | undefined) ?? []), { $ref: refTo(target) }],
    })
  }

  const out = rebuild(root)
  if (keys.size > 0) {
    out.$defs = Object.fromEntries(Array.from(keys, ([node, key]) => [key, rebuild(node)]))
  }
  return out
}
