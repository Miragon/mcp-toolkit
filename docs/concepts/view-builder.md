# View builder & persisted dashboards

`render-view` is the one-shot path — the LLM picks keys, steps, and a layout
up-front and the UI is materialised. The **view builder** adds an
interactive path: the user (or the LLM) seeds keys + steps, the server
returns the catalogue of widgets whose `requires` are satisfiable against
that key set, and the user assembles a layout by dropping widgets onto
rows and tabs. The finished layout feeds back into `render-view` or gets
persisted as a **dashboard** for later recall.

## The loop

```
open-view-builder { keys, steps }                  ← LLM seeds context
   ↓
structuredContent.mode = "builder"
structuredContent.reachableWidgets = [ … ]          ← palette source
   ↓
McpAppView branches → <LayoutBuilder>               ← user composes
   ↓
Render view  ─► render-view { keys, steps, layout }  ← returns rendered payload
Save          ─► save-dashboard { name, keys, steps, layout, title }
                         ↓
                 list-dashboards / load-dashboard  ← later recall
                         ↓
                 load-dashboard { id } ─► render-view { … }
```

Only `render-view` is part of the LLM's main prompting surface in the
one-shot flow; `open-view-builder` is the entry point for the interactive
flow. Both produce compatible layouts.

## Reachable widgets

Given the initial `keys` plus the keys a step set would `produces`,
`buildView` computes the key set the pipeline _could_ expose and returns
every widget whose `requires` is a subset. Two helpers already shipped by
the toolkit do the work:

- `validatePipeline(config, stepRegistry, initialKeys)` — statically returns
  `availableKeys` after the steps would execute.
- `widgetRegistry.findByRequiredKeys(availableKeys)` — filter by contract.

`buildView` unions the statically-predicted keys with the runtime-resolved
keys from `executePipeline`, so the palette reflects the maximal set even
when a single step errors during a session.

## Layout model (v1)

The schema is unchanged from `render-view`: 12-column grid rows,
optionally nested inside tabs. Widget height is content-driven. The
builder lets you:

- Add / remove / reorder **rows**.
- Add widgets to the focused row; set **span** per widget (1–12).
- Switch between flat-rows and **tabs** mode (tabs start with the existing
  rows as tab 1; collapsing back to one tab flips back to flat-rows).

Future extensions — optional `rowHeight`, 2D placement, shared live-state
— are tracked in `docs/plans/`.

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

- `packages/core/src/framework/builder.ts` — `buildView` + payload types.
- `packages/core/src/framework/dashboard-store.ts` — interface + impls.
- `packages/core/src/tools/register-builder-tool.ts` — `open-view-builder`.
- `packages/core/src/tools/register-dashboard-tools.ts` — CRUD tools.
- `packages/ui/src/app/layout-builder.tsx` — interactive composer.
- [Guide: building dashboards](../guides/building-dashboards.md)
