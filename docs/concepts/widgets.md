# Widgets

Widgets are React components that render data resolved by the pipeline.
The server ships their definitions; the `mcp-app.html` bundle ships the
components themselves. The two are matched by widget id at render time.

## Definition

```ts
interface WidgetDefinition {
  id: string // "<app>:<slug>", e.g. "lexoffice:invoice-header"
  requires: string[] // keys that must be in context for rendering
  size: WidgetSize // "quarter" | "third" | "half" | "full" | "header"
}

interface WidgetProps {
  keys: Record<string, unknown>
  context: PipelineContext
}
```

A widget runs only if all `requires` keys exist in `context.keys` — the
`WidgetRenderer` in `@miragon/mcp-toolkit-ui` filters missing ones out.

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

The widget bundle is a single HTML file (typically Vite-built) mounted as
an MCP resource (`ui://<app>/mcp-app.html`). The `McpAppView` component
from `@miragon/mcp-toolkit-ui/app` handles the iframe plumbing — see
[layout-and-rendering](../guides/layout-and-rendering.md).

## Reference

- `WidgetDefinition`, `WidgetProps`, `WidgetSize` → `packages/core/src/types/widget.ts`
- Render payload → `packages/core/src/framework/render-view.ts`
