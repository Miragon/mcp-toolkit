import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Customer, OrderStore } from "../store.js"

/**
 * The `appConfig` shape the `orders` steps receive.
 *
 * For a self-owned module (no upstream proxy) the framework passes
 * `plugin.appConfig` through to the executor **untouched** — see
 * `buildProxyAppConfigs`: only plugins with a `proxyBinding` get a `callTool`
 * injected. So `createPlugin()` sets `appConfig: { store }` and the steps read
 * the in-memory store straight off it. (A federated module would instead receive
 * `{ callTool }` and dispatch tool calls against its upstream — see
 * `examples/modules/articles/steps/resolve-article.ts`.)
 */
export interface OrdersAppConfig {
  store: OrderStore
}

/**
 * STEP A of the two-step `orders` pipeline.
 *
 *   resolve-customer  →  list-customer-orders
 *   ───────────────      ────────────────────
 *   requires: orders:customerId      requires: orders:customer   ← produced by A
 *   produces: orders:customer        produces: orders:orderList
 *
 * This step turns the initial `orders:customerId` key (supplied by the caller in
 * `render-view`'s `keys`) into a resolved `orders:customer` object. The executor
 * merges that produced key into `context.keys`, which is exactly what unblocks
 * STEP B's `requires: ["orders:customer"]` gate — that is the chaining contract:
 *
 *   - A's `produces` names the key A writes into the context.
 *   - B's `requires` names the key B needs before it may run.
 *   - The executor only runs B once every key in B's `requires` is present, so
 *     B will not run until A has produced `orders:customer`.
 *
 * The step is also the error boundary for a bad id: `store.getCustomer` throws on
 * an unknown customer, the executor records the error (it does not crash the
 * request), and STEP B is then skipped because `orders:customer` never appears.
 */
export const resolveCustomerStep: PipelineStepDefinition<OrdersAppConfig> = {
  id: "orders:resolve-customer",
  description: "Resolve a customer by id so downstream steps can scope to it.",
  dataType: "orders:customer",
  requires: ["orders:customerId"],
  produces: ["orders:customer"],
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(ctx, { store }) {
    const customerId = String(ctx.keys["orders:customerId"])
    // Throws on an unknown id → the executor records a step error and STEP B,
    // gated on `orders:customer`, is skipped (it never becomes available).
    const customer: Customer = store.getCustomer(customerId)
    return {
      _app: "orders",
      _step: "resolve-customer",
      data: customer,
      // The produced key. The executor copies this into `context.keys` under
      // `orders:customer`; STEP B reads it back via `ctx.keys["orders:customer"]`.
      keys: { "orders:customer": customer },
    }
  },
}
