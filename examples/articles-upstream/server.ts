import { MCPServer } from "mcp-use/server"
import { z } from "zod"

/**
 * Fake "articles" external MCP — exercises the *host-bundled + codegen* path.
 *
 * The host ships the widget code locally; the codegen types the `articles_*`
 * tool calls. This server does NOT advertise a module manifest — it's a plain
 * upstream that the host's `articles` plugin wraps with `proxyBinding`.
 *
 * Tools:
 *   - list-articles   returns all articles (typed output schema feeds codegen)
 *   - get-article     returns a single article by id
 */

const server = new MCPServer({
  name: "articles-upstream",
  version: "0.0.1",
  host: "0.0.0.0",
})

const articles = [
  {
    id: "1",
    title: "The Morning Buzz",
    author: "Alice Chen",
    publishedAt: "2026-01-15",
    body: "A cheerful dispatch about early-morning routines and the ritual of the first coffee.",
  },
  {
    id: "2",
    title: "On Remote Work",
    author: "Bob Martinez",
    publishedAt: "2026-02-22",
    body: "Reflections on three years of remote collaboration and what still feels unresolved.",
  },
  {
    id: "3",
    title: "Type Systems Are Fun",
    author: "Carol Nakamura",
    publishedAt: "2026-03-10",
    body: "Why discriminated unions are the unsung heroes of everyday application code.",
  },
]

const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  publishedAt: z.string(),
  body: z.string(),
})

server.tool(
  {
    name: "list-articles",
    description: "Returns all articles. The output schema lets the codegen emit a typed result.",
    schema: z.object({}),
    annotations: { readOnlyHint: true },
    outputSchema: z.object({
      articles: z.array(articleSchema),
    }),
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({ articles }) }],
    structuredContent: { articles },
  }),
)

server.tool(
  {
    name: "get-article",
    description: "Fetch a single article by id.",
    schema: z.object({
      id: z.string().describe("The article id returned by list-articles."),
    }),
    annotations: { readOnlyHint: true },
    outputSchema: articleSchema,
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async ({ id }) => {
    const article = articles.find((a) => a.id === id)
    if (!article) throw new Error(`unknown article: ${id}`)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(article) }],
      structuredContent: article,
    }
  },
)

const port = Number(process.env.UPSTREAM_ARTICLES_PORT ?? 4000)
await server.listen(port)
process.stdout.write(`[articles-upstream] listening on http://localhost:${port}/mcp\n`)
