import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { resolveCustomerStep } from "./steps/resolve-customer.js"
import { listCustomerOrdersStep } from "./steps/list-customer-orders.js"

/**
 * The `orders` module's static contract: its name, the two pipeline steps that
 * chain (A → B), and the two dashboard widgets.
 *
 * Both widgets:
 *   - `requires: ["orders:customer"]` — *builder reachability* only. The in-iframe
 *     builder uses it to show the widget as reachable once the pipeline produces
 *     `orders:customer` (STEP A's output). It is NOT the data binding.
 *   - `consumes: ["orders:dashboard"]` — the *actual* data binding: the step
 *     `dataType` each widget reads through `adaptDataWidget(Widget, "orders:dashboard")`.
 *
 * (The `requires` vs `consumes`/`_dataType` distinction — the "double contract" —
 * is documented in `docs/concepts/widgets.md`.)
 *
 * `steps` lists BOTH steps so the host registers them; `render-view` then drives
 * the A → B chain. The eager `show_orders_dashboard` tool (see `plugin.ts`) does
 * NOT use these steps — it composes the same two widgets with `buildComposedView`.
 */
export const definition: AppDefinition = {
  name: "orders",
  steps: [resolveCustomerStep, listCustomerOrdersStep],
  widgets: [
    {
      id: "orders:kpi",
      description: "KPI strip: per-status order counts and revenue for one customer.",
      requires: ["orders:customer"],
      consumes: ["orders:dashboard"],
      size: "half",
    },
    {
      id: "orders:table",
      description: "Table of a customer's orders with status and amounts.",
      requires: ["orders:customer"],
      consumes: ["orders:dashboard"],
      size: "half",
    },
  ],
}
