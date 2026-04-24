import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { ArticlesCallTool } from "../generated/tools.js"

/**
 * Resolves a single article via the federated `articles_get-article` proxy tool.
 *
 * The `callTool` in `appConfig` is injected by `buildProxyAppConfigs` when
 * `plugin.proxyBinding === "articles"`, with `userId` pre-bound by the pipeline
 * executor — so step code only deals with `(toolName, args)`.
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
