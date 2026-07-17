import type { MCPServer } from "mcp-use/server"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { ArticlesCallTool } from "./generated/tools.js"
import { definition } from "./definition.js"
import { createArticleStore, type ArticleStore } from "./store.js"
import { registerArticleTools } from "./tools.js"

/**
 * The `articles` module — the tool-codegen example: a self-owned module whose
 * tool surface is described by a *generated, typed client*.
 *
 * `pnpm generate` (see `codegen.config.ts`) snapshots the tools/list of the
 * standalone `codegen-source.ts` endpoint into `generated/tools.ts` +
 * `generated/hooks.tsx`. Two consumers then use that typed surface:
 *   - the `articles:resolve-article` pipeline step calls the typed `callTool`
 *     this plugin injects into its own `appConfig` (below), and
 *   - the `ArticleCard` widget self-fetches via the generated
 *     `useArticlesGetArticle` React-Query hook.
 *
 * The module registers its own tools under the `articles_*` names the
 * generated client expects — everything is served by this host, no other
 * server involved at runtime.
 */

/**
 * Typed in-process implementation of the generated `ArticlesCallTool`
 * surface, backed by the module's own store. Steps call it as
 * `callTool(name, args)`; the pipeline executor's `bindAppConfig` rewrap
 * (which threads the per-request userId as a hidden 3rd argument) passes
 * through transparently — this closure simply has no per-user scoping.
 *
 * Every switch arm returns exactly the shape the generated
 * `ArticlesToolMap` declares for that tool name, so the closure satisfies
 * the generic `TypedCallTool` signature without a cast.
 */
function createArticlesCallTool(store: ArticleStore): ArticlesCallTool {
  return (name: string, args: unknown) => {
    switch (name) {
      case "articles_list-articles":
        return Promise.resolve({ articles: store.list() })
      case "articles_get-article":
        return Promise.resolve(store.get((args as { id: string }).id))
      default:
        return Promise.reject(new Error(`unknown articles tool: ${name}`))
    }
  }
}

export function createPlugin(): AppPlugin {
  const store = createArticleStore()

  return {
    definition,
    // The typed callTool the `articles:resolve-article` step receives as its
    // `appConfig` — see `steps/resolve-article.ts`.
    appConfig: { callTool: createArticlesCallTool(store) },
    // The framework types the `server` param as `unknown` (the core root
    // barrel stays mcp-use-free); at runtime it is always the host's
    // `MCPServer`, so we narrow it here — the single, documented cast.
    registerTools: (server) =>
      registerArticleTools(server as MCPServer, store, { namePrefix: "articles_" }),
  }
}
