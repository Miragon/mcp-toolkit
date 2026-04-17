import { z, type ZodTypeAny } from "zod"

/**
 * Minimal JSON-Schema → Zod runtime converter covering the subset real MCP
 * tools use (object/string/number/boolean/array, enum, required). Exotic
 * constructs (oneOf/anyOf/allOf/$ref) fall through to `z.any()`. A proxy is a
 * forwarder — the upstream is the real validator, so we only need enough
 * structure for the inbound client's tools/list to render.
 */
export function jsonSchemaToZod(schema: unknown): ZodTypeAny {
  if (!schema || typeof schema !== "object") {
    return z.any()
  }
  const s = schema as Record<string, unknown>

  const type = s.type

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
