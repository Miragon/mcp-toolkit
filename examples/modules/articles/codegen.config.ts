import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

/**
 * Codegen config for the articles typed client. Start the source endpoint
 * first (`pnpm dev:codegen-source` in `examples/`), then run `pnpm generate`
 * (or `pnpm generate:check` for the CI-style drift check).
 *
 * `proxyName` is the name prefix for the generated tool names + types:
 * source tool `get-article` → runtime name `articles_get-article`, hook
 * `useArticlesGetArticle` — matching the `articles_*` tools the host module
 * registers itself (see `plugin.ts`).
 */
const config: CodegenConfig = {
  proxyName: "articles",
  upstreamUrl: process.env.ARTICLES_CODEGEN_SOURCE_URL ?? "http://localhost:4000/mcp",
  auth: { mode: "none" },
  out: "./generated",
}

export default config
