import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { resolveArticleStep } from "./steps/resolve-article.js"

export const definition: AppDefinition = {
  name: "articles",
  title: { en: "Articles", de: "Artikel" },
  steps: [resolveArticleStep],
  widgets: [
    {
      id: "articles:article-card",
      title: { en: "Article", de: "Artikel" },
      summary: { en: "One article with its key data.", de: "Ein Artikel mit seinen Eckdaten." },
      requires: ["articles:article"],
      size: "half",
    },
  ],
}
