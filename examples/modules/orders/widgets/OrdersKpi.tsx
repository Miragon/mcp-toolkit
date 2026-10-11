import { Badge, KpiGrid, WidgetHeader, formatCount, useLocale } from "@miragon/mcp-toolkit-ui"
import type { OrdersDashboardData } from "../store.js"
import { formatEuro, useOrdersText } from "./messages.js"

/**
 * OrdersKpi: the top widget of the orders dashboard: the customer's revenue
 * as the headline figure and a KPI strip with the per-status order counts. Its header names the
 * customer, so the composed view needs no title of its own.
 *
 * Data contract: this is a single-data `({ data })` widget. It is registered via
 * `adaptDataWidget(OrdersKpi, "orders:dashboard")`, so it receives the COMBINED
 * `OrdersDashboardData` object and reads only its `kpi` slice. The sibling
 * `OrdersTable` reads the `table` slice of the same object; that shared dataType
 * is what lets one widget registration serve both the eager `buildComposedView`
 * dashboard and the `render-view` pipeline (see `store.ts` `OrdersDashboardData`).
 *
 * Built from the slim composed UI layer (`WidgetHeader`, `KpiGrid`, `Badge`),
 * theme tokens only, so it white-labels for free. No tool calls: the data is
 * pushed in, so this widget is pure props. Every word comes from the module's
 * en/de catalog (`messages.ts`); money and counts are formatted in the
 * widget's locale.
 *
 * Colour stays for states: an open or cancelled order is a state and carries a
 * status dot; revenue and the customer's tier are facts, so they stay neutral.
 */
export function OrdersKpi({ data }: { data: OrdersDashboardData | null }) {
  const locale = useLocale()
  const text = useOrdersText()
  if (!data) return null
  const { customer, counts, revenueCents } = data.kpi
  const count = (n: number) => formatCount(n, locale)

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-5">
      <WidgetHeader
        title={customer.name}
        sub={
          <>
            <Badge variant="outline">{text.tier[customer.tier]}</Badge>
            <span>{text.orderCount(counts.total, count(counts.total))}</span>
          </>
        }
      />

      {/* Revenue is the headline figure, on its own line: an amount needs more
          room than a fifth of an inline chat frame gives a KPI cell (German
          "1.998,00 €" touched the next cell at 760 px). Pre-formatted, since
          the toolkit renders values verbatim. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-muted-foreground text-sm font-medium">{text.revenue}</span>
        <span className="text-foreground text-2xl font-bold tracking-tight tabular-nums">
          {formatEuro(revenueCents, locale)}
        </span>
      </div>

      {/* The order counts by status: four cells, so each keeps its figure readable. */}
      <KpiGrid
        boxed
        header={{ label: text.kpiHeader }}
        cells={[
          {
            label: text.status.open,
            value: count(counts.open),
            tone: counts.open > 0 ? "info" : "neutral",
          },
          { label: text.status.paid, value: count(counts.paid) },
          { label: text.status.shipped, value: count(counts.shipped) },
          {
            label: text.status.cancelled,
            value: count(counts.cancelled),
            tone: counts.cancelled > 0 ? "danger" : "neutral",
          },
        ]}
      />
    </div>
  )
}
