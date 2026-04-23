import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { definition } from "./definition.js"

/**
 * Full-module example: provides a step, a widget, and registers a domain
 * tool on the MCP server. Serves as the counter-point to `items-ui` —
 * contrast what's needed for a self-contained module vs. a UI-only wrapper
 * around an external MCP.
 */
export function createPlugin(): AppPlugin<MCPServer> {
  return {
    definition,
    registerTools(server) {
      server.tool(
        {
          name: "hello_say-hi",
          description: "Returns a friendly greeting for a given name.",
          annotations: { readOnlyHint: true },
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        async (args: { name?: string }) => ({
          content: [{ type: "text" as const, text: `Hello, ${args.name ?? "world"}!` }],
        }),
      )
    },
  }
}
