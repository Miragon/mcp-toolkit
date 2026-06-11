import { Badge, KpiGrid, LivePill, WidgetHeader } from "@miragon/mcp-toolkit-ui"
import type { OrdersDashboardData } from "../store.js"

/**
 * OrdersKpi — the first cell of the orders dashboard: a KPI strip with the
 * per-status order counts and the customer's revenue.
 *
 * Data contract: this is a single-data `({ data })` widget. It is registered via
 * `adaptDataWidget(OrdersKpi, "orders:dashboard")`, so it receives the COMBINED
 * `OrdersDashboardData` object and reads only its `kpi` slice. The sibling
 * `OrdersTable` reads the `table` slice of the same object — that shared dataType
 * is what lets one widget registration serve both the eager `buildComposedView`
 * dashboard and the `render-view` pipeline (see `store.ts` `OrdersDashboardData`).
 *
 * Built from the slim composed UI layer (`WidgetHeader`, `KpiGrid`, `LivePill`,
 * `Badge`) — theme tokens only, so it white-labels for free. No tool calls: the
 * data is pushed in, so this widget is pure props.
 */

/** Cents → a localized currency string (the store keeps money in minor units). */
function formatEuro(cents: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function OrdersKpi({ data }: { data: OrdersDashboardData | null }) {
  if (!data) return null
  const { customer, counts, revenueCents } = data.kpi

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-5">
      <WidgetHeader
        icon="€"
        iconTone="success"
        title={customer.name}
        sub={
          <>
            <LivePill tone="success">Orders</LivePill>
            <Badge variant={customer.tier === "premium" ? "default" : "secondary"}>
              {customer.tier}
            </Badge>
          </>
        }
      />

      {/* The headline metrics. `revenue` is tone-tinted; the status cells are
          plain counts. Pre-format the currency — KpiGrid renders values verbatim. */}
      <KpiGrid
        boxed
        header={{ label: "This customer", badge: `${counts.total} orders` }}
        cells={[
          { label: "Revenue", value: formatEuro(revenueCents), tone: "success" },
          { label: "Open", value: counts.open, tone: counts.open > 0 ? "info" : "neutral" },
          { label: "Paid", value: counts.paid },
          { label: "Shipped", value: counts.shipped },
          {
            label: "Cancelled",
            value: counts.cancelled,
            tone: counts.cancelled > 0 ? "danger" : "neutral",
          },
        ]}
      />
    </div>
  )
}
