# View builder & persisted dashboards

`render-view` is the LLM's only view-related tool. It takes
`{ keys, steps, layout, title }`, runs the pipeline, and returns the
rendered payload. The user — inside the iframe — can flip the same view
into **build mode** with one click; the catalogue (palette, key
contracts, available steps) is fetched on demand from an app-only tool
and never lands in the LLM's context.

## The loop

```
LLM:                                 UI / iframe:
─────                                ─────────────
render-view { keys, steps, layout }
   ↓
structuredContent { context, layout, … }
   ↓
                                     <WidgetRenderer>      ← user sees rendered view
                                     · click "Build" ↓
                                     <LayoutBuilder>
                                     · calls get-builder-catalogue
                                       (app-only, not visible to LLM)
                                     · drag widgets, edit keys/steps,
                                       toggle Layout/Pipeline/Preview
                                     · click "Done" ↑
                                     <WidgetRenderer>      ← back to render with new layout

                                     · click "Save dashboard"
                                       → save-dashboard { name, … }
```

The LLM only ever needs `render-view`. Build mode and the catalogue are
the iframe's concern.

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

## Layout model (v1)

The schema is unchanged from `render-view`: 12-column grid rows,
optionally nested inside tabs. Widget height is content-driven. The
builder lets you:

- Add / remove / reorder **rows**.
- Add widgets to the focused row; set **span** per widget (1–12).
- Switch between flat-rows and **tabs** mode.

Future extensions — optional `rowHeight`, 2D placement, shared live-state
— are tracked in `docs/plans/`.

## Tools

| Tool                     | Visibility | Purpose                                                                      |
| ------------------------ | ---------- | ---------------------------------------------------------------------------- |
| `render-view`            | LLM        | Run the pipeline, return rendered payload. The LLM's primary view tool.      |
| `refresh-view`           | app        | Re-run the pipeline with the stored params (refresh button).                 |
| `read-widget-bundle`     | app        | Stream upstream-hosted widget JS to the iframe.                              |
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

Persistence is pluggable via the `DashboardStore` interface. Default is
in-memory (test-friendly); for real deployments pass
`createFileSystemDashboardStore({ dir })` or a custom implementation into
`createFrameworkApp({ app: { dashboardStore } })`. Records are scoped by
`ctx.auth.user.userId` when the host is OAuth-enabled.

## Reference

- `packages/core/src/framework/catalogue.ts` — `getBuilderCatalogue` + payload types.
- `packages/core/src/framework/dashboard-store.ts` — interface + impls.
- `packages/core/src/tools/register-catalogue-tool.ts` — `get-builder-catalogue`.
- `packages/core/src/tools/register-dashboard-tools.ts` — CRUD tools.
- `packages/ui/src/app/mcp-app-view.tsx` — Build toggle in the toolbar.
- `packages/ui/src/app/layout-builder.tsx` — interactive composer.
- [Guide: building dashboards](../guides/building-dashboards.md)
