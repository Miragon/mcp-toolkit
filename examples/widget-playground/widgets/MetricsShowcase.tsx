import { useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CountPill,
  FilterBar,
  KpiGrid,
  LivePill,
  ListFooter,
  SectionHeading,
  WidgetHeader,
  useDebouncedValue,
  type FilterChip,
} from "@miragon/mcp-toolkit-ui"

interface Row {
  id: string
  name: string
  tone: "danger" | "warning" | "neutral"
  count: number
}

/**
 * Demonstrates the promoted composed building blocks — `WidgetHeader`, `LivePill`,
 * `KpiGrid`, `FilterBar` (+ `useDebouncedValue`), `SectionHeading`, `CountPill`,
 * and `ListFooter` — wired together the way a real dashboard widget uses them.
 * Pure props: the playground feeds `{ data }` straight in.
 */
export function MetricsShowcase({ data }: { data?: { rows?: Row[] } | null }) {
  const rows = data?.rows ?? []
  const [search, setSearch] = useState("")
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const debounced = useDebouncedValue(search, 200)

  const chips: FilterChip[] = [
    { id: "danger", label: "Critical", active: activeChip === "danger" },
    { id: "warning", label: "Warning", active: activeChip === "warning" },
  ]

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch = r.name.toLowerCase().includes(debounced.toLowerCase())
      const matchesChip = !activeChip || r.tone === activeChip
      return matchesSearch && matchesChip
    })
  }, [rows, debounced, activeChip])

  return (
    <div className="bg-card text-card-foreground mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <WidgetHeader
        icon="◆"
        iconTone="info"
        title="Metrics showcase"
        sub={<LivePill tone="success">Live</LivePill>}
      />

      <KpiGrid
        boxed
        header={{ label: "Health", badge: "last 24h" }}
        cells={[
          { label: "Open", value: rows.length, tone: "danger" },
          { label: "Filtered", value: filtered.length },
          { label: "Resolved", value: 130, trend: "+8 today", trendDirection: "down" },
          { label: "SLA", value: "98%", tone: "success" },
        ]}
      />

      <div>
        <SectionHeading title="Items" hint={`${filtered.length} shown`} />
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          chips={chips}
          onChipToggle={(id) => setActiveChip((c) => (c === id ? null : id))}
        />
        <div className="mt-3 flex flex-col gap-2">
          {filtered.map((row) => (
            <Card key={row.id} size="sm">
              <CardContent className="flex items-center justify-between">
                <span className="text-sm font-medium">{row.name}</span>
                <CountPill tone={row.tone}>{row.count}</CountPill>
              </CardContent>
            </Card>
          ))}
        </div>
        <ListFooter
          shown={filtered.length}
          total={rows.length}
          hasMore={false}
          onLoadMore={() => {}}
          noun="items"
        />
      </div>
    </div>
  )
}
