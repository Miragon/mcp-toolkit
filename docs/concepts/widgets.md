# Widgets

Widgets are React components that render data resolved by the pipeline.
The server ships their definitions; the `mcp-app.html` bundle ships the
components themselves. The two are matched by widget id at render time.

## Definition

```ts
interface WidgetDefinition {
  id: string // "<app>:<slug>", e.g. "lexoffice:invoice-header"
  description?: string // one-line; surfaced in get-framework-manifest for LLM picking
  requires: string[] // keys that must be in context for rendering
  consumes?: string[] // step `dataType`s this widget renders (LLM hint)
  size: WidgetSize // "quarter" | "third" | "half" | "full" | "header"
  propsSchema?: Record<string, unknown> // JSON Schema for per-instance `props`
  bundle?: string // upstream-hosted widgets only (resource URI)
  moduleId?: string // upstream-contributed widgets only (originating module)
  hostWidget?: string // host-alias widgets only (target host widget id)
  presetProps?: Record<string, unknown> // host-alias widgets only (merged under cell props)
}

interface WidgetProps {
  keys: Record<string, unknown>
  context: PipelineContext
  widgetProps?: Record<string, unknown> // per-instance props from `row[].props`
}
```

A widget runs only if all `requires` keys exist in `context.keys` — the
`WidgetRenderer` in `@miragon/mcp-toolkit-ui` filters missing ones out.

The union has three variants (narrow with `isRemoteWidget` /
`isHostAliasWidget`): **local** (code in the host's app-bundle), **remote**
(`bundle` + `moduleId` — fetched from the upstream at render time), and
**host-alias** (`hostWidget` + `moduleId` — an upstream module reusing a
host-bundled widget under its own id, see
[upstream-hosted widgets](#upstream-hosted-widgets)).

## `requires` vs `consumes` — two distinct contracts

These two fields look similar but answer different questions; keep them
separate:

- **`requires`** — _Builder reachability only._ The keys that must be in
  `context.keys` before the widget will render. The in-iframe builder uses
  it to split the palette into reachable vs unreachable widgets, and
  `WidgetRenderer` filters a widget out when a required key is missing. It is
  **not** the data binding.
- **`consumes`** (the step `dataType`, also written `_dataType` on a step
  result) — _the actual data binding._ It names the step `dataType`s the
  widget reads through `adaptDataWidget(Widget, dataType)`. This is how the
  rendered data slice reaches the component.

A **self-fetching widget** (one that drives its own `useToolQuery` and owns
its data) declares `requires: []` and reads from an app-only `*_data` feed —
it has no pipeline data binding at all, so it leaves `consumes` empty. Setting
`requires` on such a widget would only hide it from the builder until some
unrelated key happens to be present.

## Per-instance props

A layout cell can pass per-instance props via the `props` field — the
same widget can appear multiple times in one view with different scoping
(e.g. one tab per `processDefinitionKey`). Declare the accepted shape on
the widget via `propsSchema` (a JSON Schema; generate with
`z.toJSONSchema(...)` from a Zod object so the contract lives next to
the code) and the host surfaces it verbatim in `get-framework-manifest`,
so the LLM knows which props to set without guessing.

```jsonc
// layout cell
{
  "widget": "analytics:kpi-grid",
  "span": 6,
  "props": { "processDefinitionKey": "miraveloLeasing" },
}
```

`adaptDataWidget` (see `packages/ui/src/app/adapt-data-widget.tsx`) forwards
these into named props on the wrapped single-data widget.

## Component

The common shape is a **single-data widget**: a plain React component with a
typed `data` prop, registered in the bundle via
`adaptDataWidget(Widget, dataType)` (`packages/ui/src/app/adapt-data-widget.tsx`).
The adapter finds the step whose `_dataType` matches and forwards its `data`,
so the component never sees the render envelope:

```tsx
export function TasksBoard({ data }: { data: TasksBoardData | null }) {
  /* … */
}

// app-bundle widget map
const widgets = {
  "tasks:board": adaptDataWidget<TasksBoardData>(TasksBoard, "tasks:board"),
}
```

A widget can instead take the raw `WidgetProps` (keys + context) the
framework passes — useful when it reads pipeline keys directly and drives
its own fetches:

```tsx
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { Card, CardContent, Skeleton } from "@miragon/mcp-toolkit-ui"
import { useLexofficeRetrieveInvoice } from "../generated/hooks.js"

export function InvoiceHeader({ keys }: WidgetProps) {
  const invoiceNumber = String(keys["lexoffice:invoiceNumber"] ?? "")
  const { data, isLoading } = useLexofficeRetrieveInvoice(
    { invoiceNumber },
    { enabled: !!invoiceNumber },
  )
  if (isLoading) return <Skeleton className="h-24 w-full" />
  return (
    <Card>
      <CardContent>{/* … */}</CardContent>
    </Card>
  )
}
```

Widgets typically re-fetch via `useToolQuery` (the base hook that generated
hooks wrap). Server-stored `stepData` under `context` is available too via
`WidgetProps.context.stepData[stepId]`.

## The render payload

`render-view` returns `structuredContent` shaped like:

```ts
{
  _refreshParams: { keys, steps, layout, title }, // for refresh-view
  title,
  context: {
    keys: Record<string, unknown>,
    stepIds: string[],
    stepData: Record<stepId, { data, keys, _app, _dataType }>,
    errors: { stepId, reason }[],
  },
  layout: LayoutConfig,
  // layout-referenced upstream widgets, keyed by widget id:
  remoteWidgets: Record<id, { bundle, moduleId }>, // fetched via read-widget-bundle
  aliasWidgets: Record<id, { hostWidget, presetProps? }>, // resolved in the host bundle
}
```

The widget bundle feeds `context.keys` into each widget's `WidgetProps.keys`.
`remoteWidgets` and `aliasWidgets` are filtered to the widgets the layout
actually references: the shell's loader fetches each `remoteWidgets` bundle on
demand, and resolves each `aliasWidgets` entry against its own `widgets` map
(merging `presetProps` under the cell's `props` — the cell wins).

## Bundling

### Host-bundled widgets

Typical setup: a single HTML file (Vite-built) mounted as an MCP
resource (`ui://<app>/mcp-app.html`) that statically imports every
widget. The consumer passes the `{ id: Component }` map to
`<McpToolkitApp widgets={...} />` and the toolkit handles the host
iframe plumbing (`mcp-use`'s `McpUseProvider` + `McpAppView` together).
See [layout-and-rendering](../guides/layout-and-rendering.md).

### Upstream-hosted widgets

A widget can alternatively ship with the upstream MCP server that owns
its data — the host doesn't need to know about it at build time.

1. The upstream exposes two things: an MCP resource serving the built
   widget JS (e.g. `ui://customers/customer-card.js`, with its shared
   runtimes externalised to the host's import map), and a
   `get-module-manifest` tool advertising both the widget id → bundle
   URI mapping and the declarative step that produces the widget's
   required keys.
2. The host discovers the manifest at boot (when the proxy is flagged
   `upstreamModules: true`) and registers a synthetic `AppPlugin` from
   it — step and widget definitions land in the normal registries, but
   no widget component is bundled into the host.
3. At render time, `McpAppView`'s default `widgetLoader` sees the widget
   id advertised under `viewData.remoteWidgets`, calls the framework's
   `read-widget-bundle` tool through the host bridge, wraps the returned
   JS in a Blob URL, and dynamically imports it. The `default` export is
   memoised next to the host-bundled widgets for the lifetime of the
   view.

See [`examples/customers-upstream/`](../../examples/customers-upstream/)
for a runnable example and
[`packages/ui/src/app/remote-widget-loader.ts`](../../packages/ui/src/app/remote-widget-loader.ts)
for the loader internals.

#### Shared runtimes and interactive remote widgets

A remote bundle never ships its own React — `react` / `react/jsx-runtime`
resolve through the host page's `<script type="importmap">` to the host's
instance. The same mechanism extends to `mcp-use/react`, the three
`@miragon/mcp-toolkit-ui` barrels, and `@tanstack/react-query`, which is what
makes remote widgets _interactive_: `useCallTool` / `useHostBridge` /
`useToolQuery` read React contexts, and context lookups only resolve against
the **same module instance** the host rendered the providers with. The wiring
has three host-side parts (all from `@miragon/mcp-toolkit-ui`):

1. The app-bundle entry calls `exposeSharedRuntime({ React, ReactDOM, ... })`
   to put the module namespaces on `globalThis`.
2. The host page's import map gains entries from
   `buildSharedRuntimeImportMap(...)` — data:-URI shims re-exporting exactly
   those globals (drift-tested export lists, so the shims can't lag the
   barrels).
3. The server declares what the bundle exposes via `createFrameworkApp`'s
   `hostRuntime` option.

On the module side, the widget build externalises the libraries it imports and
the manifest declares them in `runtime` (`mcpUseReact` / `toolkitUi` /
`reactQuery`, requiring `schemaVersion: 2`). At discovery the host checks every
declared range against what it exposes and skips the module fail-soft on any
mismatch — majors >= 1 compare majors (same rule as `runtime.react` always
had), 0.x ranges also compare minors because the minor is the 0.x breaking
axis. A runtime the module needs but never declares fails later and uglier: the
bundle's import dies in the browser (the loader wraps that error with a hint
pointing here).

CSS caveat: toolkit-ui primitives rely on the host page's compiled Tailwind.
Classes the host's own widgets never emit are not in the host's CSS, so styling
of a remote widget degrades to whatever classes the host happens to ship —
inline styles or host-guaranteed primitives are the safe choices.

#### Host-widget references (aliases)

A manifest widget entry can, instead of a `bundle`, carry
`hostWidget: "<host-widget-id>"` (schemaVersion 2): the module contributes an
_alias_ onto a widget the host already bundles — no second bundle, no fetch.
Layout cells referencing the module-namespaced alias id render the host
component with the entry's `props` merged **under** the cell's own `props`
(the cell wins key-by-key). The target must be a host-bundled (local) widget;
an unregistered, remote, or alias target makes the host skip the whole module
at boot (fail-soft). `render-view` advertises layout-referenced aliases under
`structuredContent.aliasWidgets`, and the shell resolves them against its own
`widgets` map (`resolveAliasComponents`).

## Reference

- `WidgetDefinition`, `WidgetProps`, `WidgetSize` → `packages/core/src/types/widget.ts`
- Render payload → `packages/core/src/framework/render-view.ts`
- Remote loader → `packages/ui/src/app/remote-widget-loader.ts`
- Shared-runtime contract → `packages/ui/src/runtime/shared-runtime.ts`
- Alias resolution → `packages/ui/src/app/widget-renderer.tsx` (`resolveAliasComponents`)
- Manifest contract → `packages/proxy-contract/src/module-manifest.ts`
