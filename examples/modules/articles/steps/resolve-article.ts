import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { ArticlesCallTool } from "../generated/tools.js"

/**
 * Resolves a single article via the typed `articles_get-article` call.
 *
 * The `callTool` in `appConfig` is the typed closure the plugin itself
 * injects (see `plugin.ts`), with the per-request userId pre-bound by the
 * pipeline executor — so step code only deals with `(toolName, args)` and
 * gets compile-time checking on names, args, and result from the generated
 * `ArticlesCallTool` type.
 */
export const resolveArticleStep: PipelineStepDefinition<{ callTool: ArticlesCallTool }> = {
  id: "articles:resolve-article",
  dataType: "articles:article",
  requires: ["articles:articleId"],
  produces: ["articles:article"],
  async execute(ctx, { callTool }) {
    const id = String(ctx.keys["articles:articleId"])
    const article = await callTool("articles_get-article", { id })
    return {
      _app: "articles",
      _step: "resolve-article",
      data: article,
      keys: { "articles:article": article },
    }
  },
}
