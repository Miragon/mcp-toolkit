import type { MCPServer } from "mcp-use"
import { z } from "zod"
import type { AppPlugin, ComposedViewInput, LayoutConfig } from "@miragon/mcp-toolkit-core"
import { appsSdkMeta, buildComposedView, viewResourceUri } from "@miragon/mcp-toolkit-core"
import { createToolRegistrar, withToolErrors } from "@miragon/mcp-toolkit-core/tools"
import { definition } from "./definition.js"
import { LIST_CUSTOMERS, ORDERS_DASHBOARD_DATA, SHOW_ORDERS_DASHBOARD } from "./tool-names.js"
import { createOrderStore, type OrderStore, type OrdersDashboardData } from "./store.js"
import type { OrdersAppConfig } from "./steps/resolve-customer.js"

/**
 * The `orders` module — the example for the toolkit's **two composition paths**,
 * side by side, against one in-memory domain:
 *
 *   1. EAGER multi-widget dashboard (this file) — `show_orders_dashboard` computes
 *      the whole view-model up front and composes TWO widgets (a KPI strip and an
 *      orders table) into one layout with `buildComposedView`. This is the path the
 *      real consumer (the CIB Seven cockpit) uses for every dashboard, and the one
 *      you should reach for first.
 *   2. DECLARATIVE pipeline (`steps/` + `render-view` + a layout YAML) — a real
 *      two-step chain (`resolve-customer` → `list-customer-orders`) where step B
 *      consumes step A's produced key. The ADVANCED path: only needed when you must
 *      thread one tool's output into the next.
 *
 * Both paths render the *same* two widgets. They can because both widgets resolve
 * their data from the SHARED step `dataType` `"orders:dashboard"` (see `store.ts`
 * `OrdersDashboardData`): `buildComposedView` tags each cell's data with that
 * `_dataType`, and the pipeline step emits it as its `dataType` — so one
 * `adaptDataWidget(Widget, "orders:dashboard")` registration serves both.
 *
 * Like `tasks`, `orders` is *self-owned*: it registers its OWN tools and its
 * `appConfig: { store }` is passed straight through to the pipeline steps
 * untouched (the executor only rewraps an `appConfig.callTool` closure, which
 * this module doesn't use).
 *
 * It contributes:
 *   - `list_customers` — a domain read tool (via `createToolRegistrar`) so a caller
 *     (or the smoke test) can pick a valid customer id to scope the dashboard to.
 *   - `show_orders_dashboard` — the eager multi-widget widget tool (this file's
 *     headline): `buildComposedView` over a 2-cell layout.
 *   - `orders_dashboard_data` — an app-only JSON feed (no UI) the widgets self-fetch
 *     on an in-place refresh.
 *   - the two pipeline steps + two widgets (from `definition.ts`), which the host
 *     registers so the DECLARATIVE path (`render-view`) works against the same module.
 */

/** The default customer the eager dashboard scopes to when the caller omits one. */
const DEFAULT_CUSTOMER_ID = "c-1"

/** Mirrors {@link Customer}; advertised as `list_customers`' `outputSchema`. */
const customerSchema = z.object({
  id: z.string().describe("Stable customer id (e.g. 'c-1'); use it to scope the dashboard."),
  name: z.string().describe("Customer display name."),
  tier: z.enum(["standard", "premium"]).describe("Service tier, surfaced as a KPI badge."),
})

/**
 * The eager dashboard layout: ONE row with TWO cells — the KPI strip on the left,
 * the orders table on the right. This is the same `LayoutConfig` shape `render-view`
 * takes, so the eager path and the pipeline path share an identical layout model
 * (compare `examples/layouts/orders-dashboard.yaml`).
 *
 * Each cell names a widget id (registered in the app bundle) and a 12-column `span`.
 * Both cells reference widgets that read the `orders:dashboard` `_dataType`, so a
 * single `buildComposedView` entry could feed both — but we emit one entry per cell
 * (each tagged `orders:dashboard`) to mirror the general case where cells carry
 * different data types.
 */
const DASHBOARD_LAYOUT: LayoutConfig = {
  rows: [
    {
      row: [
        { widget: "orders:kpi", span: 5 },
        { widget: "orders:table", span: 7 },
      ],
    },
  ],
}

/** One-line, model-facing summary of the dashboard (never the full order list). */
function dashboardSummary(dashboard: OrdersDashboardData): string {
  const { customer, counts, revenueCents } = dashboard.kpi
  const euros = (revenueCents / 100).toFixed(2)
  return (
    `Orders dashboard for ${customer.name}: ${counts.total} order(s) — ${counts.open} open, ` +
    `${counts.paid} paid, ${counts.shipped} shipped, ${counts.cancelled} cancelled; ` +
    `€${euros} revenue. Full breakdown is shown in the dashboard.`
  )
}

/**
 * Plain (no-UI) tool result carrying the dashboard JSON. The `orders_dashboard_data`
 * feed uses this so the widgets' in-widget `callTool` gets the data back — a
 * widget-tool result (with `_meta.ui.resourceUri`) would be *rendered* by the host
 * instead of returned. Mirrors the data into both channels so text-first and
 * structured-first decoders agree.
 */
function rawData(data: OrdersDashboardData) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as unknown as Record<string, unknown>,
  }
}

// ── Domain tools (the module's own tools, no upstream) ───────────────────────
function registerOrderTools(server: MCPServer, store: OrderStore) {
  const register = createToolRegistrar<OrderStore>(server, store)

  register({
    name: LIST_CUSTOMERS,
    category: "orders",
    description:
      "List the customers the orders dashboard / pipeline can be scoped to. Returns id, name, and tier. Use a returned id as customerId for show_orders_dashboard or as the orders:customerId key for render-view.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: {},
    // A bare array output is auto-wrapped to `{ data: [...] }` for structuredContent.
    outputSchema: z.array(customerSchema),
    handler: (client) => Promise.resolve(client.customers()),
  })
}

// ── Widget tool + app-only data feed ─────────────────────────────────────────
function registerOrderWidgetTools(server: MCPServer, store: OrderStore) {
  // THE HEADLINE: the eager multi-widget dashboard. Compute the whole view-model
  // now (one store pass), then compose two widgets into one layout with
  // `buildComposedView`. No pipeline, no key threading — just "here are N widgets
  // and their data, lay them out". This is the recommended default for dashboards.
  server.tool(
    {
      name: SHOW_ORDERS_DASHBOARD,
      title: "Orders Dashboard",
      description:
        "Show the orders dashboard for a customer: a KPI strip (per-status counts + revenue) next to a table of the customer's orders. The orders view; use it whenever the user wants to see a customer's orders at a glance.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({
        customerId: z
          .string()
          .optional()
          .describe(
            `Customer to scope the dashboard to (as returned by ${LIST_CUSTOMERS}). Defaults to "${DEFAULT_CUSTOMER_ID}".`,
          ),
      }),
      view: { name: SHOW_ORDERS_DASHBOARD },
      outputSchema: z.object({}).passthrough(),
      _meta: appsSdkMeta({
        resourceUri: viewResourceUri(SHOW_ORDERS_DASHBOARD),
        title: "Orders Dashboard",
      }),
    },
    withToolErrors((args: { customerId?: string }) => {
      const customerId = args.customerId ?? DEFAULT_CUSTOMER_ID
      // ONE store pass builds both slices the two widgets render.
      const dashboard = store.dashboard(customerId)

      // `buildComposedView` builds the `McpAppView` envelope from a layout plus one
      // `entry` per data slice. Both entries carry the SAME combined object under the
      // SAME `dataType: "orders:dashboard"`; each widget renders its own slice (KPI
      // reads `.kpi`, table reads `.table`) — exactly what `buildComposedView`'s
      // contract describes ("widgets that share a dataType all receive the same data
      // object and render their own slice"). Stable `id`s keep the step keys distinct.
      const input: ComposedViewInput = {
        app: "orders",
        title: `Orders — ${dashboard.kpi.customer.name}`,
        summary: dashboardSummary(dashboard),
        layout: DASHBOARD_LAYOUT,
        entries: [
          { id: "kpi", dataType: "orders:dashboard", data: dashboard },
          { id: "table", dataType: "orders:dashboard", data: dashboard },
        ],
      }
      const view = buildComposedView(input)
      // Return a fresh object literal (not the named `ViewToolResult`) so it
      // satisfies the MCP tool-callback result shape.
      return Promise.resolve({ content: view.content, structuredContent: view.structuredContent })
    }),
  )

  // App-only JSON feed (no UI) the widgets self-fetch on refresh. The native
  // `visibility: "app"` hides it from the LLM tool surface on conforming hosts
  // while keeping it callable from inside the widget iframe via `callTool`.
  server.tool(
    {
      name: ORDERS_DASHBOARD_DATA,
      title: "Orders dashboard data (internal)",
      description:
        "Internal JSON feed (no UI) backing the orders dashboard widgets' in-place refresh. Prefer show_orders_dashboard.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({
        customerId: z.string().optional().describe("Customer to fetch the dashboard for."),
      }),
      visibility: "app",
    },
    withToolErrors((args: { customerId?: string }) =>
      Promise.resolve(rawData(store.dashboard(args.customerId ?? DEFAULT_CUSTOMER_ID))),
    ),
  )
}

export function createPlugin(): AppPlugin {
  // One store per plugin instance: the host and the in-process smoke test each
  // get an isolated dataset, and the two pipeline steps plus the dashboard tool
  // here all close over this one instance.
  const store: OrderStore = createOrderStore()

  // The pipeline steps read the store off `appConfig`. The framework passes it
  // through untouched (see `OrdersAppConfig`); the executor only rewraps an
  // `appConfig.callTool` closure, which this module doesn't use.
  const appConfig: OrdersAppConfig = { store }

  return {
    definition,
    appConfig: appConfig as unknown as Record<string, unknown>,
    // The framework types `server` as `unknown` (the core root barrel stays
    // mcp-use-free); at runtime it is always the host's `MCPServer`, so we narrow
    // it here — the single, documented cast in this module.
    registerTools: (server) => registerOrderTools(server as MCPServer, store),
    registerWidgetTools: (server) => registerOrderWidgetTools(server as MCPServer, store),
  }
}

// Re-export the view-model types so consumers (and the widgets) import the `data`
// shape from the module's public surface.
export type { Customer, Order, OrdersDashboardData } from "./store.js"
