# Guided tour

Seven stops through the toolkit's feature surface. Run them in order in the
inspector's Tools tab — widgets render inline there; from Claude Code you get
the same data as `structuredContent`. First [connect](index.md#connect) to the
playground.

## 1. Discover the contract

Call `get-framework-manifest` with `{}`. The result lists every step, widget,
and key contract the host serves — which step produces which key, which widget
consumes which dataType. Everything else on this tour is spelled out in this
one payload.

Reading: [architecture](../concepts/architecture.md) ·
[pipelines & steps](../concepts/pipelines-and-steps.md)

## 2. Plain tools

Call `list_tasks` with `{}` — a domain tool built with `createToolRegistrar`:
Zod-described args, `outputSchema`, read-only annotations, structured JSON
out. Then mutate:

```json
{ "title": "Try the mcp-toolkit playground", "priority": "high" }
```

as `create_task`, and `list_tasks` again to see it.

Reading: [building a full module](../guides/building-a-full-module.md)

## 3. A tool that renders a widget

Call `show_tasks_board` with `{}`. Same store, but now the result carries
`_meta.ui` and a view envelope — the inspector renders the tasks board as a
live widget (your task from stop 2 is on it). In the JSON, note
`structuredContent.context.stepData.result._dataType` is `"tasks:board"`:
that tag is how the bundled widget finds its data.

Reading: [widgets](../concepts/widgets.md) — `buildSingleWidgetView` builds
this envelope.

## 4. A composed view

Call `list_customers` with `{}` and pick an id, then `show_orders_dashboard`:

```json
{ "customerId": "c-2" }
```

One tool call, one view, two widgets: a KPI strip (span 5) and an orders
table (span 7) on the 12-column grid. Both `stepData` entries carry
`_dataType: "orders:dashboard"` with the same object — each widget renders
its own slice. This is `buildComposedView`, the recommended default for
multi-widget views.

Reading: [layout & rendering](../guides/layout-and-rendering.md)

## 5. A real pipeline

The advanced path: `render-view` chains steps whose inputs depend on earlier
outputs. Call it with:

```json
{
  "keys": { "orders:customerId": "c-1" },
  "steps": [
    { "id": "customer", "step": "orders:resolve-customer" },
    { "id": "orders", "step": "orders:list-customer-orders" }
  ],
  "layout": {
    "rows": [
      {
        "row": [
          { "widget": "orders:kpi", "span": 5 },
          { "widget": "orders:table", "span": 7 }
        ]
      }
    ]
  },
  "title": "Orders pipeline view"
}
```

Same rendered view as stop 4 — but computed by a two-step pipeline. Proof in
`context.keys`: it now contains `orders:customer` (produced by step A,
consumed by step B) and `orders:orderList`. Step B never saw the customer id;
it ran once its required key appeared.

Reading: [pipelines & steps](../concepts/pipelines-and-steps.md)

## 6. Break it — fail-soft

Repeat stop 5 with `"orders:customerId": "does-not-exist"`. The call still
succeeds: `context.errors` records why step `customer` failed and why step
`orders` was skipped (its required key never appeared), and `stepData` is
empty. Pipelines degrade per-step instead of crashing the request.

Reading: [debugging pipeline steps](../recipes/debugging-pipeline-steps.md)

## 7. Builder & dashboards

The playground boots with `app.builder: true`, so the pipeline view from
stop 5 has a Build/edit affordance in a widget-capable host — the in-iframe
builder, fed by `get-builder-catalogue`. (The eager view from stop 4 doesn't:
only pipeline-rendered views carry the refresh params the builder re-runs.)
Saving persists through the dashboard CRUD tools, which you can also drive
directly: `save-dashboard` with the keys, steps, and layout from stop 5, then
`list-dashboards`, then `load-dashboard` — its result feeds straight back into
`render-view`. A saved dashboard is a callable view.

(Dashboards live in the in-memory store — gone on restart, like everything
here.)

Reading: [view builder](../concepts/view-builder.md) ·
[building dashboards](../guides/building-dashboards.md)

## Next

Run this host yourself → [Run it locally](running-locally.md), or see how it is
deployed → [Deploy your own](deployment.md).
