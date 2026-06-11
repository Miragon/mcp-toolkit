import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Customer, OrdersDashboardData } from "../store.js"
import type { OrdersAppConfig } from "./resolve-customer.js"

/**
 * STEP B of the two-step `orders` pipeline — it CONSUMES STEP A's output.
 *
 *   resolve-customer  →  list-customer-orders   ← you are here
 *   ───────────────      ────────────────────
 *   produces:            requires:  orders:customer  ← produced by STEP A
 *     orders:customer    produces:  orders:orderList
 *
 * The chaining contract in one place:
 *
 *   1. STEP A produced `orders:customer` and the executor merged it into
 *      `context.keys`. That satisfied THIS step's `requires: ["orders:customer"]`
 *      gate, so the executor runs B. (Had A errored or produced `undefined`, the
 *      key would be absent and B would be skipped — never run on missing data.)
 *   2. B reads A's output straight off `ctx.keys["orders:customer"]` — no need to
 *      re-resolve the customer. This is the "consume the previous step's output"
 *      pattern: A's `produces` key is B's input.
 *   3. B `produces: ["orders:orderList"]`, the key a *third* step (if any) could
 *      chain on. We don't need a third step here; the key is produced to show the
 *      mechanism (and so the order count surfaces in the view's `keys` map).
 *
 * B's `dataType` is `orders:dashboard` and its `data` is the combined
 * `{ kpi, table }` object both dashboard widgets render. In `render-view`,
 * `adaptDataWidget(Widget, "orders:dashboard")` resolves this step's `data` for
 * both `OrdersKpi` and `OrdersTable` — the same widgets the eager
 * `show_orders_dashboard` path composes, now driven by the pipeline.
 */
export const listCustomerOrdersStep: PipelineStepDefinition<OrdersAppConfig> = {
  id: "orders:list-customer-orders",
  description: "List a resolved customer's orders and build the dashboard view-model.",
  dataType: "orders:dashboard",
  requires: ["orders:customer"],
  produces: ["orders:orderList"],
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(ctx, { store }) {
    // STEP A's output, read back from the context. Typed as `Customer` because
    // STEP A wrote the resolved object under this key.
    const customer = ctx.keys["orders:customer"] as Customer
    const dashboard: OrdersDashboardData = store.dashboard(customer.id)
    return {
      _app: "orders",
      _step: "list-customer-orders",
      // The widget-facing payload (matched by `dataType: "orders:dashboard"`).
      data: dashboard,
      // The produced key. `orders:orderList` is the order array — the chain
      // output a downstream step could consume. The executor merges it into
      // `context.keys`, so the rendered view's `keys` map advertises it too.
      keys: { "orders:orderList": dashboard.table.orders },
    }
  },
}
