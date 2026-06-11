import {
  Badge,
  SectionHeading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TONE_SOFT,
  cn,
  type ToneVariant,
} from "@miragon/mcp-toolkit-ui"
import type { OrderStatus, OrdersDashboardData } from "../store.js"

/**
 * OrdersTable — the second cell of the orders dashboard: a table of the
 * customer's orders built from the shared `Table` primitive plus `SectionHeading`
 * and tone-tinted status `Badge`s.
 *
 * Data contract: like `OrdersKpi`, this is a single-data `({ data })` widget
 * registered via `adaptDataWidget(OrdersTable, "orders:dashboard")`. It receives
 * the same combined `OrdersDashboardData` object and reads only its `table` slice.
 * Pure props — the data is pushed in (eager dashboard) or resolved by the pipeline
 * step; no tool calls.
 */

const STATUS_TONE: Record<OrderStatus, ToneVariant> = {
  open: "info",
  paid: "neutral",
  shipped: "success",
  cancelled: "danger",
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  open: "Open",
  paid: "Paid",
  shipped: "Shipped",
  cancelled: "Cancelled",
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return iso
  }
}

/** Small tone-tinted status pill, built from the shared `TONE_SOFT` token map. */
function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        TONE_SOFT[STATUS_TONE[status]],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export function OrdersTable({ data }: { data: OrdersDashboardData | null }) {
  if (!data) return null
  const { orders } = data.table

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 p-5">
      <SectionHeading title="Orders" hint={`${orders.length} total`} />

      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">This customer has no orders yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <div className="font-medium">{order.summary}</div>
                  <div className="text-muted-foreground text-xs">
                    <Badge variant="outline">{order.id}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(order.placedAt)}
                </TableCell>
                <TableCell>
                  <StatusPill status={order.status} />
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    order.status === "cancelled" && "text-muted-foreground line-through",
                  )}
                >
                  {formatEuro(order.amountCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
