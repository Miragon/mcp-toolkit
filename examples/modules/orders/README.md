# `orders` — two ways to compose a view: eager dashboard vs declarative pipeline

The toolkit offers **two** ways to put data in front of widgets. Most modules only
ever need one of them, so the other is easy to misuse or reach for too early. The
`orders` module shows **both, side by side, against one in-memory domain**, so you
can see exactly when each pays off:

1. **Eager multi-widget dashboard** (`buildComposedView`) — compute the whole
   view-model up front, then lay several widgets out in one view. **This is the
   recommended default** for a dashboard, and the path the real consumer (the CIB
   Seven cockpit) uses for every dashboard.
2. **Declarative two-step pipeline** (`render-view` + a layout) — a real chain where
   the **second step consumes the first step's output key**. The **advanced** path:
   reach for it only when you must thread one tool's output into the next.

Both paths render the **same two widgets** (`OrdersKpi` + `OrdersTable`). There is
no backend and no network — the domain lives in [`store.ts`](./store.ts) — so you
can run, read, and copy this module as-is.

```
modules/orders/
├── definition.ts                 AppDefinition: module name + 2 steps + 2 widgets
├── tool-names.ts                 tool-name constants shared by server + smoke test
├── store.ts                      in-memory domain + pure helpers (summariseOrders, filterByCustomer)
├── store.test.ts                 Vitest for the pure logic (repo test policy)
├── plugin.ts                     createPlugin(): list_customers + show_orders_dashboard + feed
├── steps/
│   ├── resolve-customer.ts       STEP A: orders:customerId → orders:customer
│   └── list-customer-orders.ts   STEP B: orders:customer → orders:dashboard (consumes A)
└── widgets/
    ├── OrdersKpi.tsx             KpiGrid strip — reads the `.kpi` slice
    └── OrdersTable.tsx          Table — reads the `.table` slice
```

## The shared data type that makes one widget set serve both paths

Both widgets resolve their data from a single step `dataType`, **`orders:dashboard`**
— the combined `{ kpi, table }` object defined in [`store.ts`](./store.ts) as
`OrdersDashboardData`. Each widget is registered once with
`adaptDataWidget(Widget, "orders:dashboard")` and renders only its slice (KPI reads
`.kpi`, table reads `.table`).

That one decision is what lets the **same** widget registrations work in **both**
paths:

| Path                      | Where `orders:dashboard` comes from                                  |
| ------------------------- | -------------------------------------------------------------------- |
| eager `buildComposedView` | each layout cell's data is tagged `_dataType: "orders:dashboard"`    |
| pipeline `render-view`    | the `list-customer-orders` step emits `dataType: "orders:dashboard"` |

`adaptDataWidget` finds the step whose `_dataType` matches and forwards its `data`
— it doesn't care whether a view builder or the pipeline executor put it there.

---

## Path 1 — the eager multi-widget dashboard (the default)

`show_orders_dashboard` ([`plugin.ts`](./plugin.ts)) computes the whole view-model
in one store pass, then composes two widgets into one layout with
`buildComposedView`. No pipeline, no key threading — just "here are N widgets and
their data, lay them out":

```ts
const dashboard = store.dashboard(customerId) // ONE pass → { kpi, table }
const view = buildComposedView({
  app: "orders",
  title: `Orders — ${dashboard.kpi.customer.name}`,
  summary: dashboardSummary(dashboard), // 1-line, model-facing
  layout: {
    rows: [
      {
        row: [
          { widget: "orders:kpi", span: 5 }, // ┐ one row,
          { widget: "orders:table", span: 7 }, // ┘ two cells
        ],
      },
    ],
  },
  entries: [
    { id: "kpi", dataType: "orders:dashboard", data: dashboard }, // both carry the
    { id: "table", dataType: "orders:dashboard", data: dashboard }, // SAME object
  ],
})
return { content: view.content, structuredContent: view.structuredContent }
```

The `_meta` from `uiMeta({ resourceUri })` tells the host to render the result as
UI. The layout is a **12-column grid**: `span: 5` + `span: 7` puts the KPI strip
and the table side by side in one row.

The data flow is direct — no executor in the loop:

```
show_orders_dashboard(customerId)            (plugin.ts)
  → store.dashboard(customerId)              : { kpi, table }   ← ONE pass
  → buildComposedView({ layout, entries: [{ dataType: "orders:dashboard", data }, …] })
  → structuredContent: ViewStructuredContent
        .layout = { rows: [{ row: [kpi(5), table(7)] }] }
        .context.stepData.kpi   = { _dataType: "orders:dashboard", data }
        .context.stepData.table = { _dataType: "orders:dashboard", data }
  → host renders the app bundle (uiMeta.resourceUri)
  → adaptDataWidget(OrdersKpi,  "orders:dashboard") → renders data.kpi
  → adaptDataWidget(OrdersTable,"orders:dashboard") → renders data.table
```

**Why this is the default:** it is the simplest thing that works. There is no step
registry, no `requires`/`produces` contract, no validation pass — you already have
the data, so you just hand it to the layout. The real cockpit composes a dashboard
this way for every view.

---

## Path 2 — the declarative two-step pipeline (the advanced path)

When the data for the next step **depends on the output of a previous step**, you
need a pipeline. `orders` ships a real two-step chain (the rest of the toolkit only
exercises step-to-step chaining in a single unit test):

```
keys.orders:customerId = "c-1"
     │
     ▼  STEP A  orders:resolve-customer          (steps/resolve-customer.ts)
     │   requires: [orders:customerId]   produces: [orders:customer]
     │   → store.getCustomer("c-1")
     │   → returns keys: { "orders:customer": <customer> }
     │   → executor MERGES that key into context.keys
     ▼
keys.orders:customer = { id: "c-1", name: "…", tier: "premium" }
     │
     ▼  STEP B  orders:list-customer-orders       (steps/list-customer-orders.ts)
     │   requires: [orders:customer]    ← satisfied ONLY because A produced it
     │   produces: [orders:orderList]
     │   → reads ctx.keys["orders:customer"]      ← CONSUMES STEP A's output
     │   → store.dashboard(customer.id)
     │   → dataType "orders:dashboard" = { kpi, table }
     ▼
the two widgets each read the "orders:dashboard" step data:
  · orders:kpi   → data.kpi
  · orders:table → data.table
```

### The chaining contract, in three rules

1. **STEP A's `produces` names the key it writes.** Its `execute` returns
   `keys: { "orders:customer": customer }`; the executor copies that into
   `context.keys`.
2. **STEP B's `requires` names the key it needs.** The executor runs B **only**
   once every key in `requires` is present — so B cannot run until A has produced
   `orders:customer`. (A writes
   the key under the exact name B requires — no mapping layer involved.)
3. **STEP B reads A's output straight off the context** —
   `ctx.keys["orders:customer"]` — instead of re-resolving the customer. That is
   the whole point of a pipeline: B consumes A's output.

### The error boundary is free

If `orders:customerId` is an unknown id, `store.getCustomer` **throws**. The
executor records that as a step error (it does **not** crash the request), and
because A never produced `orders:customer`, **STEP B is skipped** — it never runs
on missing data. The `orders.smoke.test.ts` asserts exactly this.

### Drive it

The layout for this path lives in
[`examples/layouts/orders-dashboard.yaml`](../../layouts/orders-dashboard.yaml) —
**identical in shape** to the eager path's layout (one row, two cells, same spans),
so both paths visibly converge on one rendered view:

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq '.result.structuredContent.context | { keys: (.keys | keys), steps: .stepIds, errors }'
{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": {
    "name": "render-view",
    "arguments": {
      "keys":  { "orders:customerId": "c-1" },
      "steps": [
        { "id": "customer", "step": "orders:resolve-customer" },
        { "id": "orders",   "step": "orders:list-customer-orders" }
      ],
      "layout": {
        "rows": [
          { "row": [ { "widget": "orders:kpi", "span": 5 }, { "widget": "orders:table", "span": 7 } ] }
        ]
      }
    }
  }
}
JSON
```

You should see both keys present (`orders:customer`, `orders:orderList`), both
steps run (`customer`, `orders`), and no errors.

---

## Eager vs pipeline — when to use which

| Question                                                       | Eager (`buildComposedView`) | Pipeline (`render-view`) |
| -------------------------------------------------------------- | --------------------------- | ------------------------ |
| Do you already have all the data when the tool is called?      | ✅ yes — use this           | —                        |
| Does step N's input depend on step N-1's **output**?           | —                           | ✅ yes — use this        |
| Want the user to re-compose the view in the in-iframe builder? | works                       | ✅ the builder's model   |
| Simplest possible thing?                                       | ✅                          | more moving parts        |

**Rule of thumb:** for the vast majority of dashboards, the eager
`buildComposedView` path is the right answer — you fetch your data and lay your
widgets out. Reach for a multi-step pipeline **only** when you genuinely need to
chain tool outputs (resolve an id → fetch its detail → derive a view), or when you
want the view to be re-composable in the builder. `orders` ships both only because
its job is to **teach** the difference.

For the broader composition guide (layout format, per-cell props scoping, the
`requires`/`_dataType` double contract) see the
[`compose-a-view` skill](../../../.claude/skills/compose-a-view/SKILL.md) and
[`docs/concepts/view-builder.md`](../../../docs/concepts/view-builder.md).

## The widgets

Both are curated `({ data }: { data: OrdersDashboardData | null })` components built
from the slim composed UI layer — theme tokens only, so they white-label for free:

- [`OrdersKpi.tsx`](./widgets/OrdersKpi.tsx) — a `KpiGrid` strip (revenue + per-status
  counts) with a `WidgetHeader`, `LivePill`, and tier `Badge`. Reads `data.kpi`.
- [`OrdersTable.tsx`](./widgets/OrdersTable.tsx) — a `Table` of the customer's orders
  with `SectionHeading` and tone-tinted status pills (`TONE_SOFT` + `ToneVariant`).
  Reads `data.table`.

They are registered in the host bundle ([`../../app-bundle/main.tsx`](../../app-bundle/main.tsx))
with `adaptDataWidget(…, "orders:dashboard", describeForModel)` — the third argument
wraps the widget in a `<ModelContext>` so the model knows what the user is looking at.

## Run it

```sh
# 1. Build the host's widget bundle (includes orders:kpi + orders:table)
pnpm --filter @miragon/mcp-toolkit-examples build:bundle

# 2. Boot the host (serves articles + tasks + orders)
pnpm --filter @miragon/mcp-toolkit-examples dev:host

# 3a. The eager dashboard (the default path) — a two-cell layout:
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"show_orders_dashboard","arguments":{"customerId":"c-1"}}}' \
  | jq '.result.structuredContent.layout.rows[0].row'

# 3b. The pipeline (the advanced path) — see the render-view curl above.
```

## Iterate on the widgets in isolation

`OrdersKpi` and `OrdersTable` each have a story in
[`../../widget-playground/stories.ts`](../../widget-playground/stories.ts):

```sh
pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
```

## Verify

```sh
# pure-logic unit tests (summariseOrders / filterByCustomer / store isolation)
pnpm --filter @miragon/mcp-toolkit-examples test store

# the in-process smoke test boots createOrdersPlugin() and proves BOTH paths:
# STEP B consumes STEP A's output, and show_orders_dashboard returns a 2-cell view.
# See ../../test/orders.smoke.test.ts
pnpm --filter @miragon/mcp-toolkit-examples test orders.smoke
```
