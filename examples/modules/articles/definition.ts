import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { resolveArticleStep } from "./steps/resolve-article.js"

export const definition: AppDefinition = {
  name: "articles",
  steps: [resolveArticleStep],
  widgets: [
    {
      id: "articles:article-card",
      requires: ["articles:article"],
      size: "half",
    },
  ],
}
