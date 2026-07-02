import { type MCPServer, array, object, text } from "mcp-use/server"
import { z } from "zod"
import { withToolErrors } from "./with-tool-errors.js"

type ZodRawShape = Record<string, z.ZodTypeAny>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK provides args as Record<string, any> after zod validation
type ToolArgs = Record<string, any>

export interface ToolConfig<TClient> {
  name: string
  description: string
  category?: string
  inputSchema?: ZodRawShape
  /**
   * Zod schema describing the tool's structured output. Mirrored into the
   * MCP `outputSchema` advertised to clients and used to populate
   * `structuredContent` on each response.
   *
   * If you pass a `z.array(...)`, the schema is auto-wrapped to
   * `z.object({ data: <array> })` because MCP requires `structuredContent`
   * to be an object. The runtime wrapping happens automatically too — your
   * handler can return either the bare array or `{ data: [...] }`.
   */
  outputSchema?: z.ZodTypeAny
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  handler: (client: TClient, args: ToolArgs) => Promise<unknown>
  formatResult?: (result: unknown, args: ToolArgs) => string
}

export interface RegisteredToolMeta {
  name: string
  category?: string
}

function wrapArraySchema(schema: z.ZodTypeAny | undefined): z.ZodTypeAny | undefined {
  if (!schema) return undefined
  return schema instanceof z.ZodArray ? z.object({ data: schema }) : schema
}

/**
 * Coerces a handler result into the `structuredContent` object shape MCP
 * requires, mirroring {@link wrapArraySchema}: bare arrays become `{ data }`,
 * objects pass through.
 *
 * A declared `outputSchema` is a promise to the client that this tool emits an
 * *object* `structuredContent`. If the handler instead returns a scalar,
 * `null`, or `undefined`, the SDK would reject the response with an opaque
 * protocol error ("has an output schema but no structured content" / "invalid
 * structured content"). We turn that into a clear, house-style tool error
 * instead — thrown here and caught by {@link withToolErrors}, which surfaces it
 * as an `isError` result the SDK passes through without output-schema
 * validation.
 */
function toStructuredContent(result: unknown, toolName: string): Record<string, unknown> {
  if (Array.isArray(result)) return { data: result }
  if (result !== null && typeof result === "object") return result as Record<string, unknown>
  const kind = result === null ? "null" : typeof result
  throw new Error(
    `Tool "${toolName}" declares an outputSchema but its handler returned a ${kind} value; ` +
      `structured output must be an object or array.`,
  )
}

export function createToolRegistrar<TClient>(server: MCPServer, client: TClient) {
  const registeredTools: RegisteredToolMeta[] = []

  function register(config: ToolConfig<TClient>) {
    registeredTools.push({ name: config.name, category: config.category })
    server.tool(
      {
        name: config.name,
        description: config.description,
        schema: config.inputSchema ? z.object(config.inputSchema) : undefined,
        outputSchema: wrapArraySchema(config.outputSchema),
        annotations: config.annotations,
      },
      withToolErrors(async (args: ToolArgs) => {
        const result = await config.handler(client, args)
        if (config.formatResult) {
          const formatted = text(config.formatResult(result, args))
          // When an outputSchema is declared the tool promised structured
          // output, so mirror the raw result into structuredContent alongside
          // the human-readable text instead of dropping it. Without an
          // outputSchema the formatResult path stays text-only as before.
          if (config.outputSchema) {
            return { ...formatted, structuredContent: toStructuredContent(result, config.name) }
          }
          return formatted
        }
        if (Array.isArray(result)) {
          return array(result)
        }
        if (result !== null && typeof result === "object") {
          return object(result as Record<string, unknown>)
        }
        // A declared outputSchema requires an object `structuredContent`; a
        // scalar/null/undefined result would make the SDK reject the response
        // with an opaque protocol error. Surface a clear tool error instead
        // (see toStructuredContent). Without an outputSchema, the text-only
        // fallbacks below are valid.
        if (config.outputSchema) {
          return object(toStructuredContent(result, config.name))
        }
        if (result !== null && result !== undefined) {
          return text(JSON.stringify(result, null, 2))
        }
        return text("Success (no content returned)")
      }),
    )
  }

  register.getRegisteredTools = () => registeredTools

  return register
}
