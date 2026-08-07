# Component reference

The LLM-readable catalog of every prompt-relevant building block in
`@miragon/mcp-toolkit-ui`. When you (or a coding agent) build a widget _on top
of_ this base, this page is the ground truth: import path, props, one example,
and "when to use" per symbol — so you reach for the right component instead of
re-deriving one from `<div>`s.

> **Machine-readable twin.** [`packages/ui/ui-catalog.json`](../../packages/ui/ui-catalog.json)
> carries the same data as structured JSON for agent tooling. A Vitest
> drift-guard (`packages/ui/src/ui-catalog.test.ts`) asserts every entry's
> export actually resolves from its import path, so both stay honest against the
> code.

## Import paths

UIs are hand-built and prompted on top of this base — they are not
auto-generated. Three import paths, picked by what the symbol depends on:

| Path                            | Contains                                                                                    | Pulls `mcp-use/react`? |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| `@miragon/mcp-toolkit-ui`       | Primitives, composed components, `useToolQuery`/`useToolMutation`/`useIsMobile`, utilities. | No                     |
| `@miragon/mcp-toolkit-ui/app`   | MCP app shell, host bridge, `adaptDataWidget`, host actions, the dev fixture host.          | Yes                    |
| `@miragon/mcp-toolkit-ui/hooks` | View-tool hooks: `useViewToolQuery`, `useViewData`.                                         | No (re-uses root)      |

Rule of thumb: import from the **root** unless you need the host seam
(`useHostBridge`), the data adapter (`adaptDataWidget`), or the app shell
(`McpToolkitApp`) — those live under `/app`.

## Primitives

shadcn/ui re-exports, pre-wired to the toolkit's Tailwind preset and tokens.
Compose these instead of styling raw elements — they carry the design system
(spacing, focus rings, dark mode, `bg-card`/`text-muted-foreground` tokens).
All import from `@miragon/mcp-toolkit-ui`.

### Card

Parts: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`,
`CardContent`, `CardFooter`. Props on `Card`: `size?: "default" | "sm"`,
`className?`.

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@miragon/mcp-toolkit-ui"
;<Card>
  <CardHeader>
    <CardTitle>Invoice INV-2048</CardTitle>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```

**When to use:** the default container for any widget. Compose the parts instead
of building a bordered `<div>` by hand.

### Badge

Props: `variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"`, `className?`.

```tsx
import { Badge } from "@miragon/mcp-toolkit-ui"
;<Badge variant="destructive">Overdue</Badge>
```

**When to use:** inline status/label pill. For a tone-driven status dot or a
count indicator, see [`LivePill` / `CountPill`](#livepill--countpill).

### Button

Props: `variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"`,
`size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"`,
`asChild?: boolean`, plus all `<button>` props (`onClick`, `disabled`, `aria-*`).

```tsx
import { Button } from "@miragon/mcp-toolkit-ui"
;<Button size="sm" variant="outline" onClick={onRefresh}>
  Refresh
</Button>
```

**When to use:** any clickable action. Wire `onClick` to a host action
([`useHostBridge`](#usehostbridge) / [`useHostActions`](#usehostactions)) or a
mutation.

### Input / Select / Switch

Form controls for interactive widgets. `Input` takes native `<input>` props.
`Select` composes `SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`
and takes `value` / `onValueChange`. `Switch` takes `checked` /
`onCheckedChange`.

```tsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@miragon/mcp-toolkit-ui"
;<Select value={period} onValueChange={setPeriod}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="7d">Last 7 days</SelectItem>
    <SelectItem value="30d">Last 30 days</SelectItem>
  </SelectContent>
</Select>
```

**When to use:** a filter/control that drives a self-fetch (e.g. a period or
scope selector feeding [`useToolQuery`](#usetoolquery)).

### Table

Parts: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`,
`TableHead`, `TableCell`, `TableCaption`.

**When to use:** tabular markup. Compose the parts for a list/array tool result;
add a [`ListFooter`](#listfooter) for pagination.

### Tabs

Parts: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Props on `Tabs`:
`defaultValue?`, `value?`, `onValueChange?`.

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@miragon/mcp-toolkit-ui"
;<Tabs defaultValue="incidents">
  <TabsList>
    <TabsTrigger value="incidents">Incidents</TabsTrigger>
    <TabsTrigger value="jobs">Jobs</TabsTrigger>
  </TabsList>
  <TabsContent value="incidents">…</TabsContent>
  <TabsContent value="jobs">…</TabsContent>
</Tabs>
```

**When to use:** split a busy widget into sections (e.g. one tab per process
key). `WidgetRenderer` also uses `Tabs` for tabbed layouts.

### Dialog / Sheet

Modal (`Dialog`) and slide-in panel (`Sheet`). Both: `open?` / `onOpenChange?`,
and `*Trigger` / `*Content` / `*Header` / `*Title` / `*Description` / `*Footer`
/ `*Close` parts.

**When to use:** `Dialog` to confirm a destructive action or show detail in a
modal; `Sheet` for a side panel to view/edit without leaving the widget.

### Alert

Parts: `Alert`, `AlertTitle`, `AlertDescription`. Prop: `variant?: "default" | "destructive"`.

**When to use:** an inline notice or error message inside a widget body.

### ScrollArea / Separator / Skeleton

- `ScrollArea` (+ `ScrollBar`) — constrain a long list to a fixed height with a
  styled scrollbar.
- `Separator` (`orientation?: "horizontal" | "vertical"`) — divider between
  card sections.
- `Skeleton` (`className?` to size it) — loading placeholder while a self-fetch
  is in flight; avoids layout shift on first paint.

```tsx
import { Skeleton } from "@miragon/mcp-toolkit-ui"
;<Skeleton className="h-20 w-full" />
```

## Composed components

Focused widget building blocks assembled from the primitives — the patterns
real widgets keep needing. Reach for these before re-implementing the same thing
from `<div>`s. All import from `@miragon/mcp-toolkit-ui` (pure: React +
primitives + `cn`, no host dependency). Many are **tone-aware**: a
`ToneVariant` (`"neutral" | "info" | "success" | "warning" | "danger"`) maps to
the semantic status tokens in `globals.css`, so they re-skin with the theme — see
[`TONE_SOFT`/`TONE_DOT`/`TONE_TEXT`](#tone-tokens).

### KpiGrid

A bordered strip of KPI cells — the canonical way to show a row of headline
metrics (replaces the old single-metric `KPICard`).

| Prop     | Type            | Required | Notes                                                                                                   |
| -------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `cells`  | `KpiCell[]`     | yes      | `{ label, value, fraction?, trend?, trendDirection?, tone?, onClick?, ariaLabel? }`. Flows 1–6 columns. |
| `boxed`  | `boolean`       | no       | Wrap in a bordered card with an optional `header`. Default `false` (lighter `border-y` strip).          |
| `header` | `KpiGridHeader` | no       | `{ label, badge? }` group header shown when `boxed`.                                                    |

```tsx
import { KpiGrid } from "@miragon/mcp-toolkit-ui"
;<KpiGrid
  cells={[
    { label: "Open", value: 12, tone: "danger" },
    { label: "In progress", value: 5 },
    { label: "Done", value: 130, trend: "+8 today", trendDirection: "down" },
  ]}
/>
```

**When to use:** a row of metrics at the top of a widget. Pre-format values for
locale/currency. Set a cell `tone` for emphasis and `onClick` to make a metric a
drill target.

### LivePill / CountPill

Tone-driven pills. `LivePill` (`tone?`, default `"info"`; `children?`, default
`"Live"`) shows a pulsing dot for real-time data; `CountPill` (`tone?`, default
`"neutral"`; `children` required) is a compact tabular-number count badge.

```tsx
import { LivePill, CountPill } from "@miragon/mcp-toolkit-ui"
;<LivePill tone="success">Streaming</LivePill>
;<CountPill tone="danger">{incidents.length}</CountPill>
```

**When to use:** `LivePill` in a header to signal live data; `CountPill` as the
right-aligned count on a list/group row.

### SectionHeading

Props: `title: ReactNode` (required), `hint?: ReactNode`, `trailing?: ReactNode`
(`trailing` overrides `hint`).

```tsx
import { SectionHeading } from "@miragon/mcp-toolkit-ui"
;<SectionHeading title="Recent incidents" hint="last 24h" />
```

**When to use:** label a block inside a widget body (a list or sub-table)
without the weight of a full card header.

### WidgetHeader

Props: `title: ReactNode` (required), `icon?`, `iconTone?: ToneVariant` (default
`"neutral"`), `sub?`, `actions?`.

```tsx
import { WidgetHeader, LivePill } from "@miragon/mcp-toolkit-ui"
;<WidgetHeader
  icon="⚠"
  iconTone="danger"
  title="Incidents"
  sub={<LivePill>Live</LivePill>}
  actions={<button>Refresh</button>}
/>
```

**When to use:** anchor the top of a dashboard widget surface (icon tile, large
title, meta row, actions). Use once per widget.

### GroupCard

Props: `expanded: boolean` (required), `onToggle: () => void` (required),
`summary: ReactNode` (required), `children?`. The summary uses `role="button"`,
so it can contain its own controls (drill buttons, links) — clicks on those
don't toggle.

```tsx
import { GroupCard } from "@miragon/mcp-toolkit-ui"
;<GroupCard expanded={open} onToggle={() => setOpen(!open)} summary={<Row />}>
  <Details />
</GroupCard>
```

**When to use:** group related rows behind an expandable header (e.g. items
grouped by a key).

### FilterBar

Props: `search: string` (required), `onSearchChange: (next) => void` (required),
`chips: FilterChip[]` (required), `onChipToggle: (id) => void` (required),
`searchPlaceholder?` (default `"Filter…"`). `FilterChip` is
`{ id, label, count?, active? }`.

```tsx
import { FilterBar, useDebouncedValue } from "@miragon/mcp-toolkit-ui"

const debounced = useDebouncedValue(search)
;<FilterBar
  search={search}
  onSearchChange={setSearch}
  chips={[{ id: "open", label: "Open", count: 12, active: true }]}
  onChipToggle={toggle}
/>
```

**When to use:** filter a list/table of widget items. Pair with `useDebouncedValue`
so a server-side filter only re-queries once typing pauses.

### DrillButton

Props: `children: ReactNode` (required), `onDrill: () => void` (required),
`icon?`, `size?: "sm" | "md"` (default `"sm"`), `ariaLabel?`. A neutral outline
button with a trailing →.

```tsx
import { DrillButton } from "@miragon/mcp-toolkit-ui"
;<DrillButton onDrill={() => host.showWidget(intent)}>Open</DrillButton>
```

**When to use:** the single in-widget navigation control (drill into a
detail/sub-view). Use it for every drill so they read identically and stay
visually quieter than primary/agentic actions.

### ListFooter

Props: `shown: number`, `total: number`, `hasMore: boolean`, `onLoadMore: () => void`
(all required), `loadingMore?`, `noun?` (default `"rows"`). Renders nothing when
`total` is 0.

```tsx
import { ListFooter } from "@miragon/mcp-toolkit-ui"
;<ListFooter
  shown={rows.length}
  total={total}
  hasMore={hasMore}
  onLoadMore={fetchNext}
  noun="incidents"
/>
```

**When to use:** footer for a paginated list — an honest "Showing X of Y" total
plus an explicit "Load more" (not infinite scroll).

### GridLayout / GridItem

`GridLayout` is a 12-column responsive grid; `GridItem` is a cell with
`span?: number` (1–12, default 12; out-of-range → full width).

```tsx
import { GridLayout, GridItem, KpiGrid } from "@miragon/mcp-toolkit-ui"
;<GridLayout>
  <GridItem span={6}>
    <KpiGrid
      cells={[
        { label: "Open", value: 12 },
        { label: "Done", value: 130 },
      ]}
    />
  </GridItem>
  <GridItem span={6}>
    <Card>…</Card>
  </GridItem>
</GridLayout>
```

**When to use:** lay out KPI strips / sub-cards. Same grid `WidgetRenderer` uses
internally.

### Tone tokens

`TONE_SOFT` / `TONE_DOT` / `TONE_TEXT` — `Record<ToneVariant, string>` maps from a
tone (`"neutral" | "info" | "success" | "warning" | "danger"`) to Tailwind class
strings backed by the semantic status tokens in `globals.css`. They re-skin with
the theme (light/dark).

```tsx
import { TONE_TEXT, type ToneVariant } from "@miragon/mcp-toolkit-ui"
;<span className={TONE_TEXT[tone]}>{value}</span>
```

**When to use:** colour a custom element by status without hand-rolling a
`tone === "x" ? …` ternary. The tone-aware components (`KpiGrid`, `LivePill`,
`CountPill`, `WidgetHeader`) consume these internally.

## Data hooks

How a widget gets its data. All return TanStack Query results unless noted.

### useToolQuery

`useToolQuery(queryKey, toolName, args, opts?)` — root import.

- `queryKey: unknown[]` — `args` is appended automatically so callers with
  different `args` get separate cache entries.
- `opts?: { enabled?: boolean; select?: (data) => selected }`.

```tsx
import { useToolQuery } from "@miragon/mcp-toolkit-ui"

const { data, isFetching, refetch } = useToolQuery<Incident[]>(
  ["incidents"],
  "camunda7_incidents_data",
  { processKey },
)
```

**When to use:** self-fetch arbitrary data from a tool inside a
cockpit-embedded widget. Decoded with `parseToolResult` (structured-first).

### useToolMutation

`useToolMutation(toolName, opts?)` — root import. `opts?: { invalidateKeys?: unknown[][] }`.

```tsx
import { useToolMutation } from "@miragon/mcp-toolkit-ui"

const retry = useToolMutation("camunda7_retry_incident", {
  invalidateKeys: [["incidents"]],
})
// retry.mutate({ incidentId })
```

**When to use:** run a write/action tool and refetch dependent queries.

### useViewToolQuery

`useViewToolQuery(queryKey, toolName, args, opts?)` — **`/hooks` import**.
`opts?: { enabled?: boolean }`.

```tsx
import { useViewToolQuery } from "@miragon/mcp-toolkit-ui/hooks"

const { data } = useViewToolQuery<OrderData>(["order"], "orders_show_order", { id })
```

**When to use:** self-fetch from a `*_show_*` widget tool. Unwraps the
`McpAppView` view envelope via `parseViewToolResult` (single-step → flat data,
multi-step → keyed by step id) — the envelope-aware sibling of `useToolQuery`.

### useViewData

`useViewData(initialData, key, tool, args, ready)` — **`/hooks` import**.
Returns `{ data, loading, error }`.

```tsx
import { useViewData } from "@miragon/mcp-toolkit-ui/hooks"

function IncidentPanel({
  data: pushed,
  processKey,
}: {
  data: Incident | null
  processKey?: string
}) {
  const { data, loading } = useViewData(
    pushed,
    ["incident", processKey],
    "camunda7_incident_data",
    { processKey },
    Boolean(processKey),
  )
  // …
}
```

**When to use:** the dual-mode seam — write **one** widget that renders
host-pushed data when handed it (a standalone `*_show_*` widget) **and**
self-fetches when embedded in a cockpit. Returns host data verbatim when
present; otherwise fetches `tool` under `key`, gated on `ready` and the absence
of `initialData`. Sibling widgets sharing `key` dedupe to a single call.

### useIsMobile

`useIsMobile(): boolean` — root import. True below the 768px breakpoint.

**When to use:** switch a widget between a compact and a wide layout.

### useDebouncedValue

`useDebouncedValue<T>(value, delayMs = 300): T` — root import. Returns `value`
delayed by `delayMs`, resetting the timer on every change.

```tsx
import { useDebouncedValue } from "@miragon/mcp-toolkit-ui"

const debounced = useDebouncedValue(search, 300)
// feed `debounced` into a self-fetch so it only re-queries once typing pauses
```

**When to use:** debounce a search box (e.g. [`FilterBar`](#filterbar)'s search)
so a server-side filter doesn't re-query on every keystroke.

## Host hooks

The seam to the host (call tools, navigate, open links). All `/app` imports.

### useHostBridge

`useHostBridge(): HostBridge` — never returns `null`. The bridge:

| Method                          | Purpose                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `callTool(name, args)`          | Invoke an MCP tool; resolves with the raw result (decode with `parseToolResult`).      |
| `sendFollowup(prompt)`          | Hand a natural-language prompt back to the conversation (drive a new model turn).      |
| `openExternal(url)`             | Open a URL outside the (sandboxed) widget frame.                                       |
| `getWidgetData<T>(): T \| null` | Read host-pushed structured data (the tool result's `structuredContent`/`toolOutput`). |
| `setModelContext?(text)`        | Persist a short string the model should see next turn (optional).                      |
| `theme?: "light" \| "dark"`     | The host's colour-scheme preference, when reported.                                    |

```tsx
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"

function OrderCard({ orderId }: { orderId: string }) {
  const bridge = useHostBridge()
  const order = bridge.getWidgetData<Order>()
  // bridge.callTool("get_order", { id: orderId }) …
}
```

**When to use:** THE host seam for portable widgets. Use this instead of
`mcp-use/react` or `window.openai` directly so the same widget runs in the
mcp-use host, ChatGPT, or standalone. See
[`OrderStatusCard`](../../examples/host-portability/OrderStatusCard.tsx) for the
full surface.

### useHostActions

`useHostActions(): { openLink, showWidget, askAi }` — a named-affordance facade
over `useHostBridge`. Pair with `buildShowWidgetIntent(toolName, description)` to
phrase the navigation prompt with a `(use <toolName>)` hint.

```tsx
import { useHostActions, buildShowWidgetIntent } from "@miragon/mcp-toolkit-ui/app"

const host = useHostActions()
host.showWidget(buildShowWidgetIntent("orders_show_order", `Show order ${id}`))
```

**When to use:** in-widget navigation (`showWidget`) and handing open-ended
tasks to the agent (`askAi`). New portable widgets can also use `useHostBridge`
directly.

### Bridge factories

For non-default hosts, wrap the widget in
`<HostBridgeProvider bridge={…}>`:

- `createStandaloneHostBridge({ callTool, getData?, onFollowup?, onOpenExternal?, onModelContext?, theme? })`
  — any MCP server in a standalone web app. `callTool` is the only required option.
- `createChatGptHostBridge(sdk?)` — the OpenAI Apps SDK (ChatGPT). Defensive;
  missing host methods degrade to logged no-ops.
- `McpUseHostBridgeProvider` — the toolkit's own host: composes the mcp-use 2.x
  view hooks into the bridge. Already included in `McpToolkitApp`, so widgets
  rendered by the toolkit shell need no wrapping.

## Widget authoring

Glue between a tool result and a widget. `adaptDataWidget` and `DescribeForModel`
are `/app` imports; `parseToolResult` / `parseViewToolResult` / `cn` are root.

### adaptDataWidget

`adaptDataWidget(Widget, dataType, describeForModel?)` → `WidgetComponent`.

```tsx
import { adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"

function IncidentPanel({ data }: { data: Incident | null }) {
  /* render from data */
}

export const IncidentPanelWidget = adaptDataWidget(
  IncidentPanel,
  "camunda7:incident",
  (data, props) => `Viewing ${data.count} incidents for ${props.processKey}`,
)
```

**When to use:** register a hand-built `({ data })` widget as a framework
`WidgetComponent`. The adapter finds the matching step in
`context.steps[_dataType].data`, forwards `result.data` as the `data` prop, and
spreads per-cell layout `props`. Lets `render-view` and `*_show_*` tools share
one widget. With `describeForModel` it wraps the widget in `<ModelContext>` so
the model knows what the user is looking at.

### DescribeForModel

Type: `(data: NonNullable<T>, props: Readonly<Record<string, unknown>>) => string`.
The callback shape for `adaptDataWidget`'s third argument — report view identity,
active filters, and headline numbers.

### parseToolResult / parseViewToolResult

- `parseToolResult(result, opts?)` — decode a raw `callTool` result to its data
  payload. Structured-first: `isError` → throw, then `structuredContent`, then
  JSON-decoded text, then raw. `opts.prefer: "text"` flips the order.
  `useToolQuery` decodes through this for you.
- `parseViewToolResult(result)` — unwrap a `*_show_*` view envelope
  (`context.stepData`) to flat widget data: single-step → that step's data;
  multi-step → keyed by step id. Non-envelope results pass through
  `parseToolResult`.

### cn

`cn(...classes)` — `clsx` + `tailwind-merge`. Merge Tailwind class strings;
later conflicting utilities win.

## Theming

White-label the toolkit from a single switch. The CSS variables in
[`globals.css`](../../packages/ui/src/globals.css) (`--primary`, `--background`,
`--radius`, …) are the public theming surface; these helpers set a curated subset
of them per scope. All import from the **root** `@miragon/mcp-toolkit-ui` (React +
DOM only, no `mcp-use/react`). Full walkthrough: the
[white-labeling guide](../guides/white-labeling.md).

### createTheme

`createTheme(tokens, opts?)` — map curated brand tokens onto the real CSS
variables and return a serializable `ThemeDefinition` (`{ vars, darkVars?,
toStyle() }`). All token fields are optional and inherit the toolkit default when
omitted: `primary`, `primaryForeground`, `accent`, `accentForeground`,
`background`, `foreground`, `card`, `cardForeground`, `border`, `ring`, `radius`,
`fontSans`, `fontHeading`. Colours are any CSS colour string (`oklch`/`hex`/`hsl`).

```tsx
import { createTheme } from "@miragon/mcp-toolkit-ui"
const acme = createTheme(
  { primary: "oklch(0.55 0.2 264)", radius: "0.5rem" },
  { dark: { primary: "oklch(0.7 0.16 264)" } },
)
```

**When to use:** define a client's brand once. Apply it with `ThemeProvider`.

### ThemeProvider

Props: `theme?: ThemeDefinition`, `mode?: "light" | "dark" | "system"` (default
`"light"`), `as?`, `className?`, `children`.

```tsx
import { ThemeProvider } from "@miragon/mcp-toolkit-ui"
;<ThemeProvider theme={acme} mode={host.theme ?? "system"}>
  <YourWidget />
</ThemeProvider>
```

**When to use:** wrap a widget or app to apply a theme. Renders a wrapper with the
theme's CSS variables inline (overriding `:root`) and toggles the `.dark` class on
that scope per `mode` — so it tracks `HostBridge.theme` or the OS preference. Two
differently themed subtrees can coexist on one page.

### useTheme

`useTheme()` — read the active `{ theme, mode, resolvedMode }` from the nearest
`ThemeProvider` (`resolvedMode` is `"system"` resolved to `"light"` | `"dark"`).
Throws outside a provider.

### themePresets

`themePresets.miragon` / `.violet` / `.emerald` — ready-made `ThemeDefinition`s
(distinct `primary`/`radius` + dark overrides). A demonstration of `createTheme`
and a fork-able starting point; pass one to `ThemeProvider`'s `theme` prop.

## App shell

You rarely write these when authoring a single widget — you write the widget and
register it here.

### McpToolkitApp / mountMcpToolkitApp

`/app` imports. Props: `widgets` (required, `Record<string, WidgetComponent>`),
`refreshToolName?` (default `"refresh-view"`), `labels?`.

```tsx
import { mountMcpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
import { OrderCardWidget } from "./widgets/OrderCard.js"

const widgets = { "orders:order-card": OrderCardWidget }
mountMcpToolkitApp({ widgets })
```

**When to use:** the entry point for the widget bundle.
`mountMcpToolkitApp` mounts via mcp-use's `bootstrapView` (ext-apps handshake,
error boundary, auto-resize); `McpToolkitApp` is the component it mounts —
mcp-use `ThemeProvider` + `McpUseHostBridgeProvider` around `McpAppView`. See
the [UI API reference](./api-ui.md) for `McpAppView`, `WidgetRenderer` and
`LayoutBuilder`.

## Dev

### WidgetFixtureHost

`/app` import — a Storybook-style harness that renders **one** widget with
fixture data and a mocked host (no backend, no real host).

| Prop             | Type                               | Notes                                                                      |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `widget`         | `FixtureWidget`                    | The widget under development.                                              |
| `data`           | `Record<string, unknown>`          | `keys` map for `({ keys })` widgets; forwarded as `data` for `({ data })`. |
| `dataType`       | `string`                           | For `adaptDataWidget` components — seeds a step whose `_dataType` matches. |
| `tools`          | `Record<string, FixtureToolEntry>` | Tool fixtures: a static value or a `(args) => result` handler.             |
| `globals`        | `Record<string, unknown>`          | Host-context overrides (`theme`, `displayMode`, `locale`, …).              |
| `onModelContext` | `(text: string) => void`           | Receives the serialized `<ModelContext>` the widget reports.               |
| `onHostAction`   | `(action: HostActionLog) => void`  | Receives every host action (tool call, link, follow-up).                   |

```tsx
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { OrderCard } from "./OrderCard.js"
;<WidgetFixtureHost
  widget={OrderCard}
  data={{ "orders:order": { id: "ORD-1", status: "shipped" } }}
  tools={{ get_order: (args) => ({ id: args.id, status: "shipped" }) }}
  onHostAction={(a) => console.log(a)}
/>
```

**When to use:** the prompt → see → iterate loop. Add a `Story` to
[`examples/widget-playground/stories.ts`](../../examples/widget-playground/stories.ts)
and run the playground. `buildFixtureWidgetProps(data, dataType?)` is exported
for unit-testing the props envelope without rendering.

## See also

- [`@miragon/mcp-toolkit-ui` API reference](./api-ui.md) — the full export
  surface (incl. app-shell internals and `LayoutBuilder`).
- [Developing widgets in isolation](../guides/developing-widgets-in-isolation.md)
- [Host portability concept](../concepts/host-portability.md)
- [Widgets concept](../concepts/widgets.md)
