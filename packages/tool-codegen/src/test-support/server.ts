/** A real mcp-use server on a loopback port, for the handshake and CLI tests. */
import { MCPServer } from "mcp-use"
import { z } from "zod"

export interface TestServer {
  url: string
  /** The headers of every HTTP request the server saw. */
  requests: Record<string, string>[]
  close(): Promise<void>
}

/** `tools: false` starts the server without a tool, as a wrong endpoint or a missing scope looks. */
export async function startTestServer({ tools = true } = {}): Promise<TestServer> {
  const requests: Record<string, string>[] = []
  const server = new MCPServer({
    name: "codegen-test-server",
    version: "0.0.0",
    description: "loopback MCP server for the codegen tests",
  })
  server.use("*", async (context, next) => {
    requests.push(context.req.header())
    await next()
  })
  if (tools) registerTools(server)
  const { port } = await server.listen(0, { host: "127.0.0.1" })
  return { url: `http://127.0.0.1:${port}/mcp`, requests, close: () => server.close() }
}

function registerTools(server: MCPServer): void {
  server.tool(
    {
      name: "list_tasks",
      description: "Lists the tasks.",
      inputSchema: z.object({ status: z.enum(["open", "done"]).optional() }),
      outputSchema: z.object({ tasks: z.array(z.string()) }),
      annotations: { readOnlyHint: true },
    },
    () => ({
      content: [{ type: "text", text: "[]" }],
      structuredContent: { tasks: [] },
    }),
  )
  server.tool(
    {
      name: "create_task",
      title: "Create task",
      description: "Creates a task.",
      inputSchema: z.object({ title: z.string().describe("The task's title.") }),
      annotations: { destructiveHint: false },
    },
    ({ title }) => ({ content: [{ type: "text", text: title }] }),
  )
}
