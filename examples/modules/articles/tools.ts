import type { MCPServer } from "mcp-use"
import { z } from "zod"
import { articleSchema, type ArticleStore } from "./store.js"

/**
 * Registers the two articles tools against an MCP server. Shared by:
 *   - `plugin.ts` — the host module registers them with the `articles_` name
 *     prefix, which is exactly the naming the generated client
 *     (`generated/tools.ts`, `proxyName: "articles"`) expects at runtime, and
 *   - `codegen-source.ts` — the standalone build-time endpoint registers them
 *     unprefixed, so `mcp-tool-codegen generate` (which prepends the
 *     configured `proxyName`) emits those same `articles_*` names.
 *
 * The input-schema `.describe()` strings below are part of the generated
 * client's committed bytes — change them only together with a regeneration.
 */
export function registerArticleTools(
  server: MCPServer,
  store: ArticleStore,
  options: { namePrefix?: string } = {},
): void {
  const prefix = options.namePrefix ?? ""

  server.tool(
    {
      name: `${prefix}list-articles`,
      description: "Returns all articles. The output schema lets the codegen emit a typed result.",
      schema: z.object({}),
      annotations: { readOnlyHint: true },
      outputSchema: z.object({
        articles: z.array(articleSchema),
      }),
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
      const articles = store.list()
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ articles }) }],
        structuredContent: { articles },
      }
    },
  )

  server.tool(
    {
      name: `${prefix}get-article`,
      description: "Fetch a single article by id.",
      schema: z.object({
        id: z.string().describe("The article id returned by list-articles."),
      }),
      annotations: { readOnlyHint: true },
      outputSchema: articleSchema,
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async ({ id }) => {
      const article = store.get(id)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(article) }],
        structuredContent: article,
      }
    },
  )
}
