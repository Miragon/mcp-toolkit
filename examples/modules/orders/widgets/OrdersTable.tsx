import { PackageOpen } from "lucide-react"
import {
  Badge,
  EmptyState,
  SectionHeading,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  formatCount,
  useLocale,
  type ToneVariant,
} from "@miragon/mcp-toolkit-ui"
import type { OrderStatus, OrdersDashboardData } from "../store.js"
import { formatDay, formatEuro, useOrdersText } from "./messages.js"

/**
 * OrdersTable — the second widget of the orders dashboard: a table of the
 * customer's orders built from the shared `Table` primitive plus `SectionHeading`
 * and the kit's `StatusBadge` for each order's state (tint, rim and dot in the
 * tone, the words in the foreground).
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

export function OrdersTable({ data }: { data: OrdersDashboardData | null }) {
  const locale = useLocale()
  const text = useOrdersText()
  if (!data) return null
  const { orders } = data.table

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 p-5">
      <SectionHeading
        title={text.tableTitle}
        hint={text.inTotal(formatCount(orders.length, locale))}
      />

      {orders.length === 0 ? (
        <EmptyState icon={<PackageOpen />} title={text.emptyTitle} description={text.emptyHint} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{text.columns.order}</TableHead>
              <TableHead>{text.columns.placed}</TableHead>
              <TableHead>{text.columns.status}</TableHead>
              <TableHead className="text-right">{text.columns.amount}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <div className="font-medium">{order.summary}</div>
                  <div className="text-muted-foreground text-small">
                    <Badge variant="outline">{order.id}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDay(order.placedAt, locale)}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS_TONE[order.status]}>
                    {text.status[order.status]}
                  </StatusBadge>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    order.status === "cancelled" && "text-muted-foreground line-through",
                  )}
                >
                  {formatEuro(order.amountCents, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
