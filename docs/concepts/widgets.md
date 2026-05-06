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
  moduleId?: string // upstream-hosted widgets only (originating module)
}

interface WidgetProps {
  keys: Record<string, unknown>
  context: PipelineContext
  widgetProps?: Record<string, unknown> // per-instance props from `row[].props`
}
```

A widget runs only if all `requires` keys exist in `context.keys` — the
`WidgetRenderer` in `@miragon/mcp-toolkit-ui` filters missing ones out.

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

`adaptDataWidget` (see `packages/ui/src/components/`) forwards these
into named props on the wrapped single-data widget.

## Component

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
}
```

The widget bundle feeds `context.keys` into each widget's `WidgetProps.keys`.

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
   widget JS (e.g. `ui://customers/customer-card.js`, with `react` +
   `react/jsx-runtime` externalised to the host's import map), and a
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

The widget bundle must assert against the host's React (same major), and
the manifest declares `runtime.react` so the host can reject
incompatible bundles at boot. See
[`examples/customers-upstream/`](../../examples/customers-upstream/) for
a runnable example and
[`packages/ui/src/app/remote-widget-loader.ts`](../../packages/ui/src/app/remote-widget-loader.ts)
for the loader internals.

## Reference

- `WidgetDefinition`, `WidgetProps`, `WidgetSize` → `packages/core/src/types/widget.ts`
- Render payload → `packages/core/src/framework/render-view.ts`
- Remote loader → `packages/ui/src/app/remote-widget-loader.ts`
- Manifest contract → `packages/proxy-contract/src/module-manifest.ts`
