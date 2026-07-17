import { MCPServer } from "mcp-use/server"
import { createArticleStore } from "./store.js"
import { registerArticleTools } from "./tools.js"

/**
 * Build-time codegen source for the articles typed client — a minimal,
 * standalone MCP endpoint that `pnpm generate` / `pnpm generate:check`
 * snapshot via tools/list (see `codegen.config.ts`).
 *
 * It exists only so the codegen demo has a live endpoint to fetch from; it
 * plays no role at runtime — the host serves the same tools itself (as
 * `articles_*`, registered by `plugin.ts` from the same `tools.ts`/`store.ts`
 * source, so the two surfaces cannot drift). In a real project this would be
 * whatever MCP server you want a typed client for.
 *
 * Tool names here are unprefixed (`list-articles`, `get-article`): the
 * codegen prepends its configured `proxyName` (`articles`), producing the
 * `articles_*` names the host registers.
 */

const server = new MCPServer({
  name: "articles-codegen-source",
  version: "0.0.1",
  host: "0.0.0.0",
})

registerArticleTools(server, createArticleStore())

const port = Number(process.env.ARTICLES_CODEGEN_SOURCE_PORT ?? 4000)
await server.listen(port)
process.stdout.write(`[articles-codegen-source] listening on http://localhost:${port}/mcp\n`)
