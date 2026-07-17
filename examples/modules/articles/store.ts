import { z } from "zod"

/**
 * The `articles` domain contract, shared by BOTH servers that expose it:
 *   - the host module's own tools (`plugin.ts`, prefixed `articles_*` names), and
 *   - the build-time codegen source (`codegen-source.ts`, unprefixed names).
 *
 * Keeping the schema and the store in one file guarantees the two surfaces can
 * never drift apart — `pnpm generate:check` then guards the committed
 * generated client against this single source of truth.
 */

export const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  publishedAt: z.string(),
  body: z.string(),
})

export type Article = z.infer<typeof articleSchema>

const ARTICLES: Article[] = [
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

export interface ArticleStore {
  list(): Article[]
  get(id: string): Article
}

/** In-memory article store — one instance per plugin / server. */
export function createArticleStore(): ArticleStore {
  const articles = [...ARTICLES]
  return {
    list: () => articles,
    get: (id) => {
      const article = articles.find((a) => a.id === id)
      if (!article) throw new Error(`unknown article: ${id}`)
      return article
    },
  }
}
