import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { useItemsGetItem } from "../generated/hooks.js"

export function ItemCard({ keys }: WidgetProps) {
  const raw = keys["items-ui:itemId"]
  const id = typeof raw === "string" ? raw : ""
  const { data, isLoading, error } = useItemsGetItem({ id }, { enabled: !!id })

  if (!id) return <p>(no item id)</p>
  if (isLoading) return <p>Loading…</p>
  if (error) return <p style={{ color: "crimson" }}>{error.message}</p>
  if (!data) return null

  return (
    <div style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}>
      <strong>{data.name}</strong>
      <div style={{ fontSize: "0.85em", color: "#666" }}>id: {data.id}</div>
      <div style={{ fontSize: "0.85em", color: "#666" }}>{data.createdAt}</div>
    </div>
  )
}
