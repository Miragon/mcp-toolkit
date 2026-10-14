# Widgets

Widgets are React components that render data resolved by the pipeline.
The server ships their definitions; the app bundle (`mcp-app.js` /
`mcp-app.css`) ships the components themselves. The two are matched by
widget id at render time.

## Definition

```ts
interface WidgetDefinition {
  id: string // "<app>:<slug>", e.g. "lexoffice:invoice-header"
  description?: string // one-line; surfaced in get-framework-manifest for LLM picking
  requires: string[] // keys that must be in context for rendering
  consumes?: string[] // step `dataType`s this widget renders (LLM hint)
  size: WidgetSize // "quarter" | "third" | "half" | "full" | "header"
  propsSchema?: Record<string, unknown> // JSON Schema for per-instance `props`
  // How the view builder names it for people (all optional, see below):
  title?: LocalizedText // "Orders", or { en: "Orders", de: "Bestellungen" }
  titleKey?: string // i18n key, resolved by the bundle's LocaleProvider
  summary?: LocalizedText // one line under the title in the builder palette
  summaryKey?: string
}

interface WidgetProps {
  keys: Record<string, unknown>
  context: PipelineContext
  widgetProps?: Record<string, unknown> // per-instance props from `row[].props`
}
```

A widget runs only if all `requires` keys exist in `context.keys`: the
`WidgetRenderer` in `@miragon/mcp-toolkit-ui` filters missing ones out.

## Naming a widget for people

`description` is the LLM's text. The people using the in-iframe view builder
read `title` and `summary` instead: the palette lists each widget by its title
with the summary under it and the id as a quiet mono line, the canvas cells
and the props sheet use the title too. Without a title the builder falls back
to the id. Give the text inline, one string or one per locale, or as an i18n
key that the widget bundle's `LocaleProvider` translator resolves (a known key
wins over the inline text):

```ts
{
  id: "orders:table",
  title: { en: "Orders", de: "Bestellungen" },
  summary: { en: "Every order of one customer.", de: "Alle Bestellungen eines Kunden." },
  description: "Table of a customer's orders with status and amounts.", // for the LLM
  requires: ["orders:customer"],
  size: "half",
}
```

Pipeline steps take the same fields; the builder's data sources show them.
An app definition takes `title` or `titleKey` too: it heads the app's group of
widgets in the palette (`{ name: "orders", title: { en: "Orders", de: "Bestellungen" }, … }`).
Without one the group has no heading; the app's name shows only in advanced mode.
A `propsSchema` property is labelled in the props sheet by its `x-display`
title (`PROPS_SCHEMA_DISPLAY_KEYWORD`, same shape), else by its JSON Schema
`title`, else by its name; the help line is the `x-display` summary, else the
`description`:

```jsonc
// propsSchema.properties
{
  "dataKey": {
    "type": "string",
    "description": "Context key holding the KPI cells.",
    "x-display": { "title": { "en": "Data", "de": "Daten" } },
  },
}
```

None of these texts reach the LLM: `get-framework-manifest` sends the
`description`s and leaves `title`, `summary` and every `x-display` out of the
`propsSchema` it lists.

## `requires` vs `consumes`: two distinct contracts

These two fields look similar but answer different questions; keep them
separate:

- **`requires`**: _Builder reachability only._ The keys that must be in
  `context.keys` before the widget will render. The in-iframe builder uses
  it to split the palette into reachable vs unreachable widgets, and
  `WidgetRenderer` filters a widget out when a required key is missing. It is
  **not** the data binding.
- **`consumes`** (the step `dataType`, also written `_dataType` on a step
  result): _the actual data binding._ It names the step `dataType`s the
  widget reads through `adaptDataWidget(Widget, dataType)`. This is how the
  rendered data slice reaches the component.

A **self-fetching widget** (one that drives its own `useToolQuery` and owns
its data) declares `requires: []` and reads from an app-only `*_data` feed;
it has no pipeline data binding at all, so it leaves `consumes` empty. Setting
`requires` on such a widget would only hide it from the builder until some
unrelated key happens to be present.

## Per-instance props

A layout cell can pass per-instance props via the `props` field: the
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
framework passes. That is useful when it reads pipeline keys directly and drives
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
}
```

The widget bundle feeds `context.keys` into each widget's `WidgetProps.keys`.

## Bundling

Every widget ships in the server's own bundle: one Vite-built ES module
plus stylesheet (`app.bundle` in `createFrameworkApp`) that statically
imports every widget. mcp-use's native view registry serves it: each
view-bound tool gets a `ui://views/<tool>.html` resource whose document
embeds the same bundle. The consumer passes the `{ id: Component }` map
to `mountMcpToolkitApp({ widgets })` and the toolkit handles the host
iframe plumbing (`mcp-use`'s `bootstrapView` + `McpToolkitApp` together).
See [layout-and-rendering](../guides/layout-and-rendering.md).

## Reference

- `WidgetDefinition`, `WidgetProps`, `WidgetSize` → `packages/core/src/types/widget.ts`
- Render payload → `packages/core/src/framework/render-view.ts`
