---
name: compose-a-view
description: >-
  Compose a multi-widget view or build a pipeline with @miragon/mcp-toolkit. Use
  when asked to build a dashboard, compose/lay out several widgets in one view,
  write a multi-widget *_show_* tool, chain tool outputs through a multi-step
  pipeline, drive render-view, define a layout (rows/cells/span) or per-cell props,
  or decide between an eager view and a pipeline. The worked example is the
  `orders` module. Encodes the eager buildComposedView default, the advanced
  render-view pipeline, the requires/_dataType double contract, and the layout
  format.
---

# Compose a multi-widget view / build a pipeline

There are **two** ways to put data in front of widgets. Pick the right one first —
reaching for a pipeline when you don't need one is the most common over-engineering
trap here.

- **Eager multi-widget dashboard** (`buildComposedView`) — you already have the
  data; lay several widgets out in one view. **This is the default.** Most
  dashboards in consumer projects use this.
- **Declarative pipeline** (`render-view` + steps) — the **advanced** path. Use it
  **only** when one step's input depends on a previous step's **output** (resolve an
  id → fetch its detail → derive a view), or when you want the view to be
  re-composable in the in-iframe builder. (The visual builder + dashboard saving
  are opt-in — the host enables them with `app: { builder: true }` on
  `createFrameworkApp`; rendering works without it.)

**Worked example:** the [`orders` module](../../../examples/modules/orders/README.md)
ships **both paths against one domain** — copy from it. The snippets below are
lifted from it verbatim.

**Related skills:** [`build-mcp-widget`](../build-mcp-widget/SKILL.md) for the widget
components a view composes; [`build-mcp-server`](../build-mcp-server/SKILL.md) for
the host + the `*_show_*` tool that returns the view.

---

## (a) The eager multi-widget dashboard — the recommended default

From a `*_show_*` tool, compute the whole view-model up front, then compose widgets
into a layout with `buildComposedView` (from `@miragon/mcp-toolkit-core`). No step
registry, no validation pass — you have the data, so you just hand it to the layout.

```ts
import { buildComposedView, uiMeta } from "@miragon/mcp-toolkit-core"
import { withToolErrors } from "@miragon/mcp-toolkit-core/tools"

server.tool(
  {
    name: "show_orders_dashboard",
    title: "Orders Dashboard",
    description: "Show a customer's orders: a KPI strip next to an orders table.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    schema: z.object({ customerId: z.string().optional() }),
    _meta: uiMeta({ resourceUri }), // tells the host to render the result as UI
  },
  withToolErrors((args: { customerId?: string }) => {
    const dashboard = store.dashboard(args.customerId ?? "c-1") // ONE pass → { kpi, table }
    const view = buildComposedView({
      app: "orders",
      title: `Orders — ${dashboard.kpi.customer.name}`,
      summary: dashboardSummary(dashboard), // 1-line, model-facing — NOT the full data
      layout: {
        rows: [
          {
            row: [
              { widget: "orders:kpi", span: 5 }, // ┐ one row,
              { widget: "orders:table", span: 7 }, // ┘ two cells (12-col grid)
            ],
          },
        ],
      },
      entries: [
        { id: "kpi", dataType: "orders:dashboard", data: dashboard }, // both carry the
        { id: "table", dataType: "orders:dashboard", data: dashboard }, // SAME object
      ],
    })
    // Return a fresh object literal so it satisfies the MCP tool-callback shape.
    return Promise.resolve({ content: view.content, structuredContent: view.structuredContent })
  }),
)
```

Key points:

- **One `entry` per data slice**, each tagged with the `dataType` its widget reads.
  Widgets that share a `dataType` all receive the same object and render their own
  slice (`OrdersKpi` reads `.kpi`, `OrdersTable` reads `.table`).
- The **text channel carries only `summary`** (a one-liner). The data lives in
  `structuredContent.context.stepData`. In-widget refresh callers must therefore
  parse results **structuredContent-first** (the text-first `useToolQuery` would
  only see the summary).
- Register each widget once with `adaptDataWidget(Widget, dataType)` in the app
  bundle — the same registration works in both paths (see the pipeline below).

That is the whole dashboard. If this covers your case, **stop here** — you don't
need a pipeline.

## (b) The declarative pipeline — chain tool outputs (advanced)

Reach for this **only** when step N's input depends on step N-1's output. A step
declares `requires` (keys it needs) and `produces` (keys it writes); the executor
runs a step only once every `requires` key is present, and merges each `produces`
key into the shared context. That gate is the chaining mechanism.

```ts
// STEP A — turns an initial id key into a resolved object.
export const resolveCustomerStep: PipelineStepDefinition<OrdersAppConfig> = {
  id: "orders:resolve-customer",
  dataType: "orders:customer",
  requires: ["orders:customerId"], // input key (supplied in render-view's `keys`)
  produces: ["orders:customer"], // output key the executor merges into context.keys
  async execute(ctx, { store }) {
    const customer = store.getCustomer(String(ctx.keys["orders:customerId"]))
    return {
      _app: "orders",
      _step: "resolve-customer",
      data: customer,
      keys: { "orders:customer": customer },
    }
  },
}

// STEP B — CONSUMES step A's output key.
export const listCustomerOrdersStep: PipelineStepDefinition<OrdersAppConfig> = {
  id: "orders:list-customer-orders",
  dataType: "orders:dashboard", // the widget-facing payload
  requires: ["orders:customer"], // satisfied ONLY because STEP A produced it
  produces: ["orders:orderList"],
  async execute(ctx, { store }) {
    const customer = ctx.keys["orders:customer"] as Customer // ← read A's output
    const dashboard = store.dashboard(customer.id)
    return {
      _app: "orders",
      _step: "list-customer-orders",
      data: dashboard, // matched by dataType "orders:dashboard"
      keys: { "orders:orderList": dashboard.table.orders },
    }
  },
}
```

Drive it with `render-view` and a layout — note B references A's produced key by
**requiring the exact name A produces**, so no explicit mapping is needed:

```jsonc
// tools/call render-view
{
  "keys": { "orders:customerId": "c-1" },
  "steps": [
    { "id": "customer", "step": "orders:resolve-customer" }, // STEP A
    { "id": "orders", "step": "orders:list-customer-orders" }, // STEP B (consumes A)
  ],
  "layout": {
    "rows": [
      {
        "row": [
          { "widget": "orders:kpi", "span": 5 },
          { "widget": "orders:table", "span": 7 },
        ],
      },
    ],
  },
}
```

Notes:

- **The error boundary is free.** If STEP A throws (e.g. unknown id), the executor
  records the error fail-soft (the request does **not** crash) and STEP B is
  **skipped** because its required key was never produced — it never runs on
  missing data.
- **Steps that call the module's own tools** inject a typed `callTool` (generated
  by tool-codegen) via the plugin's `appConfig` instead of reaching into a store —
  see `examples/modules/articles` for that pattern.
- **The same widget registrations serve both paths.** Because STEP B emits
  `dataType: "orders:dashboard"` — the same dataType the eager entries used —
  `adaptDataWidget(OrdersKpi, "orders:dashboard")` resolves the data either way.

## (c) The `requires` / `_dataType` double contract

A widget definition carries two fields that look alike but answer different
questions — keep them separate (full treatment in
[`docs/concepts/widgets.md`](../../../docs/concepts/widgets.md)):

```ts
{
  id: "orders:kpi",
  requires: ["orders:customer"], // ① builder REACHABILITY only — not the data binding
  consumes: ["orders:dashboard"], // ② the ACTUAL data binding (the step dataType)
  size: "half",
}
```

- **`requires`** — _builder reachability only._ The in-iframe builder uses it to
  show a widget as reachable once the pipeline can produce those keys, and
  `WidgetRenderer` hides a widget whose required key is missing. It is **not** how
  data reaches the component.
- **`consumes`** (the step `dataType`, written `_dataType` on a step result) — _the
  actual data binding._ It names the dataType the widget reads through
  `adaptDataWidget(Widget, dataType)`. This is the slice that reaches the component.

A self-fetching widget (drives its own `useToolQuery` against a `*_data` feed)
declares `requires: []` and leaves `consumes` empty — it has no pipeline binding.

## (d) Layout format — rows, cells, span, and per-cell props

The layout is a **12-column grid** of rows, optionally nested in tabs
([`LayoutConfig`](../../../packages/core/src/framework/layout-types.ts)):

```jsonc
{
  "rows": [
    {
      "row": [
        { "widget": "orders:kpi", "span": 5 },
        { "widget": "orders:table", "span": 7 },
      ],
    },
  ],
}
// flat-array form (legacy) and { "tabs": [{ "label", "rows" }] } are also accepted.
```

- **`span`** is the cell width in grid columns (1–12). Cells in a row should sum to
  ~12. Height is content-driven.
- **`props`** scopes one widget instance: the **same widget can appear multiple
  times** in one view with different per-cell `props`. This is exactly what the real
  cockpit does — e.g. one KPI grid per process definition:

  ```jsonc
  {
    "rows": [
      {
        "row": [
          {
            "widget": "analytics:kpi-grid",
            "span": 6,
            "props": { "processDefinitionKey": "orderFulfillment" },
          },
          {
            "widget": "analytics:kpi-grid",
            "span": 6,
            "props": { "processDefinitionKey": "customerOnboarding" },
          },
        ],
      },
    ],
  }
  ```

  `adaptDataWidget` spreads each cell's `props` onto the wrapped widget as named
  props, so one registration renders many scoped instances. Declare the accepted
  shape via the widget's `propsSchema` (a JSON Schema — generate with
  `z.toJSONSchema(...)`) so the host advertises it in `get-framework-manifest`.

## Be honest about which path to use

For the vast majority of dashboards, the **eager `buildComposedView` path is the
right answer** — fetch your data, lay your widgets out, done. Use a **multi-step
pipeline only when you genuinely need to chain tool outputs**, or when the view must
be re-composable in the builder. Don't introduce steps, a step registry, and a
`requires`/`produces` contract for a view whose data you already hold.

## Verify

```sh
# from the repo root
pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r lint

# the orders module proves both paths end-to-end in one in-process smoke test:
pnpm --filter @miragon/mcp-toolkit-examples test orders.smoke
```

## Checklist

- [ ] Picked the path: eager `buildComposedView` (default) vs pipeline (only to
      chain outputs).
- [ ] Eager: one `entry` per data slice, each tagged with its widget's `dataType`;
      `summary` is a one-liner, full data in `structuredContent`.
- [ ] Pipeline: step B `requires` the exact key step A `produces`; B reads it off
      `ctx.keys`; the unknown-id path is handled fail-soft.
- [ ] Widgets registered once with `adaptDataWidget(Widget, dataType)` — serves both
      paths.
- [ ] Layout cells sum to ~12 columns; per-cell `props` declared via `propsSchema`.
- [ ] Repo gates green; the relevant smoke test green.
