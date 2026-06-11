/**
 * In-memory orders domain for the `orders` example module.
 *
 * Like the `tasks` module, `orders` is a *self-owned* MCP server: it registers
 * its **own** tools backed by this store (no upstream proxy, no network, no
 * `node:*`), so the whole example runs as-is and the pure logic
 * (`summariseOrders`, `filterByCustomer`) is Vitest-tested.
 *
 * Unlike `tasks` (one widget pushed eagerly), `orders` exists to demonstrate the
 * two composition paths the toolkit offers, side by side, against one domain:
 *
 *   1. A real **two-step pipeline** — `resolve-customer` → `list-customer-orders`
 *      — where the second step consumes the first step's output key. The store's
 *      `getCustomer` / `listOrders` back the two steps. This is the ADVANCED path
 *      (chain tool outputs), driven by `render-view` + a layout (see
 *      `steps/` and `examples/layouts/orders-dashboard.yaml`).
 *   2. An eager **multi-widget dashboard** — `show_orders_dashboard` composes a
 *      KPI strip and an orders table into one view with `buildComposedView`,
 *      computing both slices up front. This is the recommended DEFAULT path for a
 *      dashboard (see `plugin.ts`).
 *
 * In a real server you would swap this closure for a repository over your own
 * persistence; neither the steps nor the tool handlers would change.
 */

/** Lifecycle of an order. Drives the KPI tallies and the row status tone. */
export type OrderStatus = "open" | "paid" | "shipped" | "cancelled"

/** A customer the dashboard can be scoped to. */
export interface Customer {
  /** Stable id (`c-…`). Used as the pipeline's initial `orders:customerId` key. */
  id: string
  name: string
  /** Service tier, surfaced as a badge in the KPI strip. */
  tier: "standard" | "premium"
}

export interface Order {
  /** Stable id (`o-…`). */
  id: string
  /** Owning customer id — the join the second pipeline step filters on. */
  customerId: string
  /** Human-readable line summary (e.g. "3× Cargo bike rack"). */
  summary: string
  status: OrderStatus
  /** Order total in minor units (cents) to avoid float drift. Formatted in the widget. */
  amountCents: number
  /** ISO-8601 order date. */
  placedAt: string
}

/** Per-status tallies + revenue, shown in the KPI strip (`OrdersKpi`). */
export interface OrdersKpiData {
  customer: Customer
  counts: { total: number; open: number; paid: number; shipped: number; cancelled: number }
  /** Sum of `amountCents` across non-cancelled orders, in minor units. */
  revenueCents: number
}

/** The row model the orders table (`OrdersTable`) renders. */
export interface OrdersTableData {
  customer: Customer
  orders: Order[]
}

/**
 * The combined view-model both dashboard widgets share. The two widgets render
 * different slices of it: `OrdersKpi` reads `kpi`, `OrdersTable` reads `table`.
 *
 * One *combined* dataType (`orders:dashboard`) — rather than one per widget — is
 * what lets the SAME widget registration work in BOTH composition paths:
 *
 *   - eager `buildComposedView`: two layout cells, both entries carry this object
 *     under `_dataType: "orders:dashboard"`; each widget picks its slice.
 *   - pipeline `render-view`: the `list-customer-orders` step emits this object as
 *     its `dataType: "orders:dashboard"`; `adaptDataWidget(Widget, "orders:dashboard")`
 *     resolves it for both widgets.
 *
 * (`buildComposedView` documents exactly this: "widgets that share a `dataType`
 * all receive the same data object and are expected to render their own slice".)
 */
export interface OrdersDashboardData {
  kpi: OrdersKpiData
  table: OrdersTableData
}

export interface OrderStore {
  /** Returns the customer by id; throws on an unknown id (drives the step's error path). */
  getCustomer(id: string): Customer
  /** Returns every order belonging to `customerId`, newest first. */
  listOrders(customerId: string): Order[]
  /** All customers (so `list_customers` / the smoke test can pick a valid id). */
  customers(): Customer[]
  /** KPI view-model for one customer (the eager dashboard's first cell). */
  kpi(customerId: string): OrdersKpiData
  /** Table view-model for one customer (the eager dashboard's second cell). */
  table(customerId: string): OrdersTableData
  /** Combined view-model both dashboard widgets share (KPI + table in one object). */
  dashboard(customerId: string): OrdersDashboardData
}

export interface CreateOrderStoreOptions {
  /** Replace the default demo seed (e.g. a deterministic fixture in a test). */
  customers?: Customer[]
  orders?: Order[]
}

/** Pure: tally a customer's orders by status + sum non-cancelled revenue. Unit-tested. */
export function summariseOrders(customer: Customer, orders: Order[]): OrdersKpiData {
  const counts = { total: orders.length, open: 0, paid: 0, shipped: 0, cancelled: 0 }
  let revenueCents = 0
  for (const order of orders) {
    counts[order.status] += 1
    if (order.status !== "cancelled") revenueCents += order.amountCents
  }
  return { customer, counts, revenueCents }
}

/** Pure: a customer's orders, newest first. Unit-tested. */
export function filterByCustomer(orders: Order[], customerId: string): Order[] {
  return orders
    .filter((order) => order.customerId === customerId)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
}

/** A small, readable demo dataset so the dashboard + pipeline show content out of the box. */
function defaultCustomers(): Customer[] {
  return [
    { id: "c-1", name: "Miravelo Leasing GmbH", tier: "premium" },
    { id: "c-2", name: "Nordwind Logistik", tier: "standard" },
  ]
}

function defaultOrders(): Order[] {
  return [
    {
      id: "o-1001",
      customerId: "c-1",
      summary: "3× Cargo bike rack",
      status: "shipped",
      amountCents: 47900,
      placedAt: "2026-05-02T10:15:00.000Z",
    },
    {
      id: "o-1002",
      customerId: "c-1",
      summary: "Annual service contract",
      status: "paid",
      amountCents: 120000,
      placedAt: "2026-05-18T08:40:00.000Z",
    },
    {
      id: "o-1003",
      customerId: "c-1",
      summary: "Replacement battery pack",
      status: "open",
      amountCents: 31900,
      placedAt: "2026-06-01T14:05:00.000Z",
    },
    {
      id: "o-1004",
      customerId: "c-1",
      summary: "Damaged in transit (refunded)",
      status: "cancelled",
      amountCents: 8900,
      placedAt: "2026-06-03T09:20:00.000Z",
    },
    {
      id: "o-2001",
      customerId: "c-2",
      summary: "Fleet GPS trackers ×20",
      status: "paid",
      amountCents: 259000,
      placedAt: "2026-05-29T16:00:00.000Z",
    },
  ]
}

/**
 * Builds a fresh order store. `createPlugin()` calls this once so every plugin
 * instance (host + smoke test) owns an isolated dataset, and the two pipeline
 * steps plus the dashboard tool all close over the *same* instance.
 */
export function createOrderStore(options: CreateOrderStoreOptions = {}): OrderStore {
  // Copy the seeds so two stores never alias the same arrays.
  const customers = (options.customers ?? defaultCustomers()).map((c) => ({ ...c }))
  const orders = (options.orders ?? defaultOrders()).map((o) => ({ ...o }))

  function requireCustomer(id: string): Customer {
    const customer = customers.find((c) => c.id === id)
    if (!customer) throw new Error(`Unknown customer id: "${id}".`)
    return customer
  }

  return {
    getCustomer(id) {
      return requireCustomer(id)
    },
    listOrders(customerId) {
      return filterByCustomer(orders, customerId)
    },
    customers() {
      return customers.map((c) => ({ ...c }))
    },
    kpi(customerId) {
      const customer = requireCustomer(customerId)
      return summariseOrders(customer, filterByCustomer(orders, customerId))
    },
    table(customerId) {
      const customer = requireCustomer(customerId)
      return { customer, orders: filterByCustomer(orders, customerId) }
    },
    dashboard(customerId) {
      // One pass over the customer's orders feeds both slices.
      const customer = requireCustomer(customerId)
      const ownOrders = filterByCustomer(orders, customerId)
      return {
        kpi: summariseOrders(customer, ownOrders),
        table: { customer, orders: ownOrders },
      }
    },
  }
}
