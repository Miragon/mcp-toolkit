import { z, type ZodTypeAny } from "zod"

/**
 * Minimal JSON-Schema → Zod runtime converter covering the subset real MCP
 * tools use (object/string/number/boolean/array, enum, nullable type union,
 * required). Exotic constructs (oneOf/anyOf/allOf/$ref) fall through to
 * `z.any()`. A proxy is a forwarder — the upstream is the real validator, so
 * we only need enough structure for the inbound client's tools/list to render.
 */
export function jsonSchemaToZod(schema: unknown): ZodTypeAny {
  if (!schema || typeof schema !== "object") {
    return z.any()
  }
  const s = schema as Record<string, unknown>

  // `enum: [...]` is independent of `type` in JSON Schema. Honour it before
  // falling back to a generic primitive — otherwise `{ type: "string", enum: [...] }`
  // would lose the value constraint at the proxy boundary.
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    const literals = s.enum
      .filter(
        (v): v is string | number | boolean | null =>
          v === null || ["string", "number", "boolean"].includes(typeof v),
      )
      .map((v) => z.literal(v))
    if (literals.length === 1) return literals[0] as ZodTypeAny
    if (literals.length >= 2) {
      return z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
    }
    // No usable literals (e.g. an enum of objects) — fall through to type-based mapping.
  }

  const type = s.type

  // `type: ["string", "null"]` is the canonical JSON-Schema spelling for
  // a nullable primitive. Map any union including "null" to the corresponding
  // primitive union; broader unions fall through to z.any().
  if (Array.isArray(type)) {
    const nonNull = type.filter((t): t is string => typeof t === "string" && t !== "null")
    if (nonNull.length === 1 && type.includes("null")) {
      return jsonSchemaToZod({ ...s, type: nonNull[0] }).nullable()
    }
    return z.any()
  }

  if (type === "object" || s.properties) {
    const properties = (s.properties as Record<string, unknown>) ?? {}
    const required: string[] = Array.isArray(s.required) ? (s.required as string[]) : []
    const shape: Record<string, ZodTypeAny> = {}
    for (const [key, sub] of Object.entries(properties)) {
      let field = jsonSchemaToZod(sub)
      if (!required.includes(key)) {
        field = field.optional()
      }
      shape[key] = field
    }
    const obj = z.object(shape)
    return s.additionalProperties === false ? obj : obj.loose()
  }

  if (type === "array") {
    return z.array(jsonSchemaToZod(s.items ?? {}))
  }

  if (type === "string") {
    return z.string()
  }

  if (type === "number" || type === "integer") {
    return z.number()
  }

  if (type === "boolean") {
    return z.boolean()
  }

  if (type === "null") {
    return z.null()
  }

  return z.any()
}
