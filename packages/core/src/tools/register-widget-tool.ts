import { type MCPServer, error } from "mcp-use/server"
import { z } from "zod"

type ZodRawShape = Record<string, z.ZodTypeAny>

type InferArgs<TSchema extends ZodRawShape | undefined> = TSchema extends ZodRawShape
  ? z.infer<z.ZodObject<TSchema>>
  : Record<string, never>

interface WidgetToolResult {
  text: string
  structuredContent: Record<string, unknown>
}

export interface WidgetToolConfig<TClient, TSchema extends ZodRawShape | undefined = undefined> {
  name: string
  title: string
  description: string
  inputSchema?: TSchema
  handler: (client: TClient, params: InferArgs<TSchema>) => Promise<WidgetToolResult>
}

export function createWidgetToolRegistrar<TClient>(
  server: MCPServer,
  client: TClient,
  resourceUri: string,
) {
  return function register<TSchema extends ZodRawShape | undefined = undefined>(
    config: WidgetToolConfig<TClient, TSchema>,
  ) {
    server.tool(
      {
        name: config.name,
        title: config.title,
        description: config.description,
        schema: config.inputSchema ? z.object(config.inputSchema) : undefined,
        _meta: {
          ui: { resourceUri, visibility: ["app"] },
        },
      },
      async (params) => {
        try {
          const typedParams = params as InferArgs<TSchema>
          const result = await config.handler(client, typedParams)
          return {
            content: [{ type: "text" as const, text: result.text }],
            structuredContent: result.structuredContent,
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          const code = (e as { status?: number }).status ?? (e as { code?: string }).code
          return error(code ? `[${code}] ${message}` : message)
        }
      },
    )
  }
}
