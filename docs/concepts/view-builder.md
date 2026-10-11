# View builder & persisted dashboards

`render-view` is the LLM's only view-related tool. It takes
`{ keys, steps, layout, title }`, runs the pipeline, and returns the
rendered payload. The user — inside the iframe — can flip the same view
into **build mode** with one click; the catalogue (palette, key
contracts, available steps) is fetched on demand from an app-only tool
and never lands in the LLM's context.

> **The visual builder is opt-in.** Widget rendering
> (`get-framework-manifest`, `render-view`, `refresh-view`) is always on —
> that core surface is what every server gets. The in-iframe builder
> platform (`get-builder-catalogue` + the dashboard CRUD tools) is **off by
> default**; pass `app: { builder: true }` to `createFrameworkApp` to enable
> it. Lean servers leave it off: `render-view` reports
> `structuredContent.builderAvailable` (derived from `app.builder`), and the
> `McpAppView` shell shows its edit button ("Edit view") only when that flag is set, so the
> affordance never appears against a server whose catalogue tool isn't
> registered.

## The loop

```
LLM:                                 UI / iframe:
─────                                ─────────────
render-view { keys, steps, layout }
   ↓
structuredContent { context, layout, … }
   ↓
                                     <WidgetRenderer>      ← user sees rendered view
                                     · click "Edit view" ↓
                                     <LayoutBuilder>
                                     · calls get-builder-catalogue
                                       (app-only, not visible to LLM)
                                     · drag widgets, set spans and props;
                                       Layout/Preview, plus the data
                                       sources (keys/steps) behind "Advanced"
                                     · click "Apply" ↑
                                     <WidgetRenderer>      ← back to render with new layout
                                     · or "Discard" ↑      ← the view as it was before editing

                                     · click "Save as dashboard"
                                       → save-dashboard { name, … }
```

The LLM only ever needs `render-view`. Build mode and the catalogue are
the iframe's concern.

## Two ways to compose a multi-widget view

A dashboard is several widgets in one layout. There are **two** ways to
produce one, and most modules should reach for the first:

1. **Eager — `buildComposedView`.** From a `*_show_*` tool, compute the
   whole view-model up front and lay the widgets out. No step registry,
   no validation pass — you already have the data. This is the
   **recommended default** and the path the real CIB Seven cockpit uses
   for every dashboard.

   ```ts
   import { buildComposedView } from "@miragon/mcp-toolkit-core"

   const dashboard = store.dashboard(customerId) // { kpi, table }
   const view = buildComposedView({
     app: "orders",
     summary: "Orders dashboard for …", // 1-line; full data in structuredContent
     layout: {
       rows: [
         {
           row: [
             { widget: "orders:kpi", span: 5 },
             { widget: "orders:table", span: 7 },
           ],
         },
       ],
     },
     entries: [
       { id: "kpi", dataType: "orders:dashboard", data: dashboard }, // widgets that share
       { id: "table", dataType: "orders:dashboard", data: dashboard }, // a dataType get the same object
     ],
   })
   ```

   Each `entry` carries a data slice tagged with the `dataType` its widget
   reads via `adaptDataWidget`. Widgets sharing a `dataType` all receive
   the same object and render their own slice.

2. **Pipeline — `render-view` + steps.** The **advanced** path: a chain
   where one step **consumes a previous step's output key** (resolve an id
   → fetch its detail → derive the view). Use it only when you must thread
   tool outputs, or when you want the view re-composable in the builder.

| Question                                         | Eager `buildComposedView` | Pipeline `render-view` |
| ------------------------------------------------ | ------------------------- | ---------------------- |
| Already have all the data when the tool runs?    | ✅ use this               | —                      |
| Step N's input depends on step N-1's **output**? | —                         | ✅ use this            |
| Re-composable in the in-iframe builder?          | works                     | ✅ the builder's model |
| Simplest possible thing?                         | ✅                        | more moving parts      |

Both builders (`buildSingleWidgetView` / `buildComposedView`) and
`render-view` return the **same** `ViewStructuredContent` envelope, so a
widget set written once serves all three. See the
[`orders` example](../../examples/modules/orders/README.md) (both paths,
one domain) and the
[`compose-a-view` skill](../../.claude/skills/compose-a-view/SKILL.md).

## Reachable widgets

Given the initial `keys` plus the keys a step set would `produces`,
`getBuilderCatalogue` (server helper, app-only) computes the key set
the pipeline _could_ expose and returns every widget whose `requires`
is a subset. Two helpers already shipped by the toolkit do the work:

- `validatePipeline(config, stepRegistry, initialKeys)` — statically returns
  `availableKeys` after the steps would execute.
- `widgetRegistry.findByRequiredKeys(availableKeys)` — filter by contract.

`getBuilderCatalogue` unions the statically-predicted keys with the
runtime-resolved keys from `executePipeline`, so the palette reflects
the maximal set even when a single step errors during a session. The
returned payload also includes the **unreachable** widgets (with the
keys they're missing) and the **key catalogue** (every key the system
references, with producer/consumer attribution and an `inContext`
flag).

## The builder for people

The builder is written for the people who use the view, not for the
developers who registered its widgets.

The palette, the canvas cells, the props sheet and the data sources show
each widget, step and props field by its title (see
[Naming a widget for people](./widgets.md#naming-a-widget-for-people)),
else by its id. The id stays a quiet secondary line. The palette groups the
widgets by app, under the app's title; an app without a title gets no
group heading, because its name is a technical namespace.

Three actions leave or keep the draft. Apply shows the draft in the view and
saves nothing. Discard leaves the builder and keeps the view as it was before
editing; when the draft changed the view it asks first, and says so when a
saved dashboard keeps the changes. Save as dashboard stores the draft (keys,
steps, layout, title) under a name. A marker next to the title says when the
draft has changes that would be lost: neither the view before editing nor a
saved dashboard holds them. An embedded builder without `onExit` has no Apply;
its Discard resets the draft in place, and neither its tooltip nor the save
dialog points to Apply.

Until the catalogue answers, the palette shows a loading state instead of
"no elements". An empty palette offers the data sources.

The data sources (keys and steps), the catalogue, the live-key stats and the
technical ids sit behind the "Advanced" toggle.

Every control works by keyboard and touch. Row, tab and cell actions show on
hover, on focus inside their group and on touch screens. A tab is renamed
with F2 (or Enter on the active tab), a double-click or its pencil button;
Enter and Escape in the name field return the focus to the tab, also under its
new name. Focus moves to the builder's title when it opens and back to the edit
button when it closes. An embedded builder without `onExit` puts the focus on
its title after Discard resets it. The save and discard dialogs, the catalogue
and a cell's props sheet hand the focus back to the button that opened them
(every `DialogContent` and `SheetContent` of the kit does, also without a
`Trigger`).

## Layout model (v1)

The schema is unchanged from `render-view`: 12-column grid rows,
optionally nested inside tabs. Widget height is content-driven. The
builder lets you:

- Add / remove / reorder **rows**.
- Add widgets to the focused row; set **span** per widget (1–12).
- Switch between flat-rows and **tabs** mode.

Future extensions — optional `rowHeight`, 2D placement, shared live-state
— are deliberately out of scope for now.

## Tools

| Tool                     | Visibility | Purpose                                                                      |
| ------------------------ | ---------- | ---------------------------------------------------------------------------- |
| `render-view`            | LLM        | Run the pipeline, return rendered payload. The LLM's primary view tool.      |
| `refresh-view`           | app        | Re-run the pipeline with the stored params (refresh button).                 |
| `get-builder-catalogue`  | app        | Reachable + unreachable widgets, key catalogue, available steps. Build-mode. |
| `get-framework-manifest` | LLM        | Discover what widgets / steps are registered (registry dump, no live keys).  |

`get-builder-catalogue` is **app-only** (`visibility: ["app"]`) — it
never appears in `tools/list` from the LLM's perspective. Token-free.

## Dashboards

A dashboard is the full `render-view` input (`keys`, `steps`, `layout`,
`title`) persisted under a name. The toolkit registers four CRUD tools:

| Tool               | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `save-dashboard`   | Persist. Pass `id` to update, omit to create.          |
| `list-dashboards`  | Summaries only (no layout body).                       |
| `load-dashboard`   | Full record; can be piped straight into `render-view`. |
| `delete-dashboard` | Hard delete by id.                                     |

These four tools (and `get-builder-catalogue`) are registered **only when
`app.builder` is `true`** — they are the persistence half of the opt-in
builder platform. With the builder off, none of them exist.

Persistence is pluggable via the `DashboardStore` interface. Default is
in-memory (test-friendly); for real deployments pass
`createFileSystemDashboardStore({ dir })` or a custom implementation into
`createFrameworkApp({ app: { builder: true, dashboardStore } })`. The
`dashboardStore` option has no effect unless `builder` is `true`. When the
host is OAuth-enabled, records are scoped to the caller id `resolveCallerId`
resolves (`ctx.auth.user.id`, else `userId`, else the token's `sub`); a call
without one is refused, and a record that exists but cannot be read is
reported instead of treated as absent — see
[Middleware and auth](../guides/middleware-and-auth.md#dashboards-under-oauth).

## Reference

- `packages/core/src/framework/catalogue.ts` — `getBuilderCatalogue` + payload types.
- `packages/core/src/framework/dashboard-store.ts` — interface + impls.
- `packages/core/src/tools/register-catalogue-tool.ts` — `get-builder-catalogue`.
- `packages/core/src/tools/register-dashboard-tools.ts` — CRUD tools.
- `packages/ui/src/app/mcp-app-view.tsx` — edit toggle in the toolbar.
- `packages/ui/src/app/layout-builder.tsx` — interactive composer.
- [Guide: building dashboards](../guides/building-dashboards.md)
