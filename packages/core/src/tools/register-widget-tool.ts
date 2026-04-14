import { type MCPServer, error } from "mcp-use/server"
import { z } from "zod"

type ZodRawShape = Record<string, z.ZodTypeAny>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK provides args as Record<string, any> after zod validation
type ToolArgs = Record<string, any>

interface WidgetToolResult {
  text: string
  structuredContent: Record<string, unknown>
}

export interface WidgetToolConfig<TClient> {
  name: string
  title: string
  description: string
  inputSchema?: ZodRawShape
  handler: (client: TClient, params: ToolArgs) => Promise<WidgetToolResult>
}

export function createWidgetToolRegistrar<TClient>(
  server: MCPServer,
  client: TClient,
  resourceUri: string,
) {
  return function register(config: WidgetToolConfig<TClient>) {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback type incompatible with ToolArgs
      async (params: any) => {
        try {
          const result = await config.handler(client, params as ToolArgs)
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
