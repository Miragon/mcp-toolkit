import type { WidgetProps } from "@miragon/mcp-toolkit-core"

export function GreetingCard({ keys }: WidgetProps) {
  const raw = keys["hello:greeting"]
  const greeting = typeof raw === "string" ? raw : ""
  return (
    <div style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}>
      <h3 style={{ margin: 0 }}>{greeting || "(no greeting yet)"}</h3>
    </div>
  )
}
