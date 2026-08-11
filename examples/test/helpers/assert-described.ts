/**
 * Gate helper for the `.describe()` wire test: every property a model-visible
 * tool accepts must carry a non-empty JSON-Schema `description` — it is the
 * only documentation the model ever sees for that argument.
 *
 * Exported (rather than inlined in the test) so the gate itself is testable —
 * see `fitness-gates.test.ts`.
 */

interface JsonSchemaNode {
  description?: unknown
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode | JsonSchemaNode[]
}

function hasDescription(node: JsonSchemaNode): boolean {
  return typeof node.description === "string" && node.description.trim().length > 0
}

/**
 * Walks `inputSchema.properties` (recursing into nested objects and array
 * items) and returns the dotted paths of every field without a non-empty
 * `description`. An empty array means the tool is fully described.
 */
export function findUndescribedFields(inputSchema: unknown): string[] {
  const undescribed: string[] = []
  const root = inputSchema as JsonSchemaNode | undefined
  if (!root?.properties) return undescribed

  const visit = (properties: Record<string, JsonSchemaNode>, prefix: string): void => {
    for (const [key, node] of Object.entries(properties)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (!hasDescription(node)) undescribed.push(path)
      if (node.properties) visit(node.properties, path)
      const items = Array.isArray(node.items) ? node.items : node.items ? [node.items] : []
      for (const item of items) {
        if (item.properties) visit(item.properties, `${path}[]`)
      }
    }
  }

  visit(root.properties, "")
  return undescribed
}
