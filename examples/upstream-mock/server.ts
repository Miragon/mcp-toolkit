import { MCPServer, text } from "mcp-use/server"
import { z } from "zod"

/**
 * Minimal fake "external MCP" that the host example proxies to. Exposes three
 * tools so the codegen has something interesting to type-generate:
 *
 *  - echo       plain string round-trip
 *  - list-items returns an array (exercises the outputSchema path)
 *  - get-item   takes an id, returns an item (exercises per-tool input types)
 */

const server = new MCPServer({
  name: "upstream-mock",
  version: "0.0.1",
  host: "0.0.0.0",
})

server.tool(
  {
    name: "echo",
    description: "Echoes the input back — used to smoke-test the proxy handshake.",
    schema: z.object({
      message: z.string().describe("The text to echo."),
    }),
    annotations: { readOnlyHint: true },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async ({ message }) => text(JSON.stringify({ echoed: message })),
)

const items = [
  { id: "1", name: "Alpha", createdAt: "2026-01-01T00:00:00Z" },
  { id: "2", name: "Beta", createdAt: "2026-02-01T00:00:00Z" },
  { id: "3", name: "Gamma", createdAt: "2026-03-01T00:00:00Z" },
]

server.tool(
  {
    name: "list-items",
    description: "Returns all items. The output schema lets the codegen emit a typed result.",
    schema: z.object({}),
    annotations: { readOnlyHint: true },
    outputSchema: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          createdAt: z.string(),
        }),
      ),
    }),
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({ items }) }],
    structuredContent: { items },
  }),
)

server.tool(
  {
    name: "get-item",
    description: "Fetch a single item by id.",
    schema: z.object({
      id: z.string().describe("The item id returned by list-items."),
    }),
    annotations: { readOnlyHint: true },
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      createdAt: z.string(),
    }),
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async ({ id }) => {
    const item = items.find((i) => i.id === id)
    if (!item) throw new Error(`unknown item: ${id}`)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(item) }],
      structuredContent: item,
    }
  },
)

const port = Number(process.env.UPSTREAM_MOCK_PORT ?? 4000)
await server.listen(port)
process.stdout.write(`[upstream-mock] listening on http://localhost:${port}/mcp\n`)
