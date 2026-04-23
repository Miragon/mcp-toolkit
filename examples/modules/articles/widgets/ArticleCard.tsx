import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { useArticlesGetArticle } from "../generated/hooks.js"

export function ArticleCard({ keys }: WidgetProps) {
  const raw = keys["articles:articleId"]
  const id = typeof raw === "string" ? raw : ""
  const { data, isLoading, error } = useArticlesGetArticle({ id }, { enabled: !!id })

  if (!id) return <p>(no article id)</p>
  if (isLoading) return <p>Loading…</p>
  if (error) return <p style={{ color: "crimson" }}>{error.message}</p>
  if (!data) return null

  return (
    <div style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}>
      <h3 style={{ margin: "0 0 4px" }}>{data.title}</h3>
      <div style={{ fontSize: "0.85em", color: "#666" }}>
        by {data.author} · {data.publishedAt}
      </div>
      <p style={{ marginTop: 10, marginBottom: 0, color: "#333" }}>{data.body}</p>
    </div>
  )
}
