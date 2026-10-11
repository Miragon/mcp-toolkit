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

Props: `variant?: "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "outline" | "ghost" | "link"`, `className?`. The status variants follow the tone model: tint, foreground text, a border in the tone.

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
the status roles in `theme.css`, so they re-skin with the theme. Status shows
as a dot, icon or border next to readable text, never as coloured text; see
[the tone tokens](#tone-tokens).

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
locale/currency. A cell `tone` shows as a status dot next to its label (figures stay in the foreground colour); set `onClick` to make a metric a
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
(all required), `loadingMore?`, `noun?` (default: the locale's word for rows).
Renders nothing when `total` is 0. Text and number format follow the active
locale ("Zeigt 8 von 42 …" under `de`).

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

## Feedback and states

One pattern each, so every widget reports outcomes the same way. All import
from `@miragon/mcp-toolkit-ui`; their text defaults come from the active locale.

### ToastProvider / useToast

```tsx
import { useToast } from "@miragon/mcp-toolkit-ui"
const toast = useToast()
toast.show({ tone: "success", title: "Job retried." })
toast.show({ tone: "danger", title: "Retry failed.", description: error.message })
```

**When to use:** confirm a write or report a failure instead of a silent
`console` line. The stack sits bottom centre: status colour as left edge and
icon next to plain text, one persistent `role="status"` `aria-live="polite"`
region, 2.8 s (errors 5 s), held while hovered or focused. `McpAppView` mounts
the provider; outside one, `useToast()` is a no-op.

### EmptyState

Props: `title` (required), `description?` (one help line), `icon?` (Lucide icon or
a brand mark, decorative), `tone?: "neutral" | "success"`, `action?`,
`secondaryAction?`, `titleAs?` (default `"h3"`).

```tsx
import { EmptyState } from "@miragon/mcp-toolkit-ui"
import { CircleCheck } from "lucide-react"
;<EmptyState icon={<CircleCheck />} tone="success" title="No open incidents" />
```

**When to use:** a list, table or view with nothing to show. At most two actions.

### ErrorState

Props: `title` (required), `description?`, `details?` (raw reason, collapsed under
"Details"), `onRetry?`, `actions?`, `tone?: "danger" | "warning" | "info"`,
`variant?: "block" | "inline"`, `role?: "alert" | "status" | "none"`, `icon?`,
`titleAs?`.

```tsx
import { ErrorState } from "@miragon/mcp-toolkit-ui"
;<ErrorState
  title="Incidents couldn't be loaded"
  description="Check that the engine runs, then try again."
  details={error.message}
  onRetry={refetch}
/>
```

**When to use:** a failed fetch or render. Say what happened and what you can
do; keep the raw exception under Details. `inline` is the alert above content
that still renders.

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

`Record<ToneVariant, string>` maps from a tone (`"neutral" | "info" | "success" |
"warning" | "danger"`) to Tailwind class strings. Every status tone has three
roles (Miragon CI), each with light and dark values:

| Role                    | Token           | Maps                                   |
| ----------------------- | --------------- | -------------------------------------- |
| fill, dot, border, icon | `--<tone>`      | `TONE_DOT`, `TONE_BORDER`, `TONE_ICON` |
| tint                    | `--<tone>-soft` | `TONE_SOFT` (tint + foreground text)   |
| text on a plain surface | `--<tone>-ink`  | `TONE_TEXT`                            |

Status is never text in its own colour: success and warning reach only
1.67:1 / 1.83:1 on white, so their ink is the foreground. Text on a tint is
always the foreground (pair `TONE_SOFT` with `TONE_BORDER`), and figures (KPI
values, trends, counts) never take a tone colour: the tone shows as a dot next
to them. In dark mode the colours are the `-hell` values and the tints are
transparent.

```tsx
import { TONE_DOT, TONE_TEXT, type ToneVariant } from "@miragon/mcp-toolkit-ui"
;<span className="inline-flex items-center gap-1.5">
  <span aria-hidden="true" className={`size-2 rounded-full ${TONE_DOT[tone]}`} />
  <span className={TONE_TEXT[tone]}>{label}</span>
</span>
```

**When to use:** colour a custom element by status without hand-rolling a
`tone === "x" ? …` ternary. `TONE_ICON` is for SVG icons only. The tone-aware
components (`KpiGrid`, `LivePill`, `CountPill`, `Badge`, `WidgetHeader`)
consume these internally.

### FOCUS_RING

`FOCUS_RING` / `FOCUS_RING_INSET`: the kit's opaque focus ring (2px in
`--focus`, 3:1 or more in both modes) as a class string; the inset variant
draws inside the element, for cells flush with a container edge.

```tsx
import { FOCUS_RING, cn } from "@miragon/mcp-toolkit-ui"
;<button className={cn("rounded-md border px-3 py-1.5", FOCUS_RING)}>Open</button>
```

**When to use:** any custom interactive element. (Elements without a ring of
their own still get an opaque `:focus-visible` outline from `theme.css`.)

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
one widget. With `describeForModel` it wraps the widget in `<HostModelContext>`
so the model knows what the user is looking at.

### HostModelContext

`<HostModelContext content={string}>{widget}</HostModelContext>` — host-portable
model-context reporting.

```tsx
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"

return <HostModelContext content={describeBoard(board)}>{board}</HostModelContext>
```

**When to use:** a widget that self-fetches (cockpit views) and reports its own
context instead of going through `adaptDataWidget`'s `describeForModel`. Inside
an mcp-use view it renders the native aggregating `ModelContext`; in every other
mount (widget playground, ChatGPT, standalone) it routes through the
`HostBridge`'s `setModelContext`. Never import `ModelContext` from
`mcp-use/react` in a widget — it throws outside a `bootstrapView` mount.

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

The toolkit renders in the **Miragon theme** by default. The role variables in
[`theme.css`](../../packages/ui/src/theme.css) (`--primary`, `--link`, `--focus`,
`--<tone>-ink`, `--radius-md`, …, listed in `ROLE_TOKENS`) are the public theming
surface; a customer brand overrides those, never the `--cd-*` tokens below them.
These helpers set them per scope. All import from the **root**
`@miragon/mcp-toolkit-ui` (React + DOM only, no `mcp-use/react`). Full
walkthrough: the [white-labeling guide](../guides/white-labeling.md).

### createTheme

`createTheme(tokens, opts?)`: map brand tokens onto the real CSS variables and
return a serializable `ThemeDefinition` (`{ vars, darkVars?, toStyle() }`). One
optional field per role (`primary`, `primaryHover`, `link`, `focus`,
`background`, `card`, `muted`, `mutedForeground`, `input`, `successInk`,
`radiusMd`, `fontMono`, …) plus the legacy `accent*`, `cardForeground`,
`radius`, `fontHeading`. Colours are any CSS colour string.

```tsx
import { createTheme } from "@miragon/mcp-toolkit-ui"
const acme = createTheme(
  { primary: "#0f766e", link: "#0f766e", focus: "#0f766e", radiusMd: "6px" },
  { dark: { link: "#5eead4", focus: "#5eead4" } },
)
```

**When to use:** define a client's brand once. Apply it with `ThemeProvider`
(or spread `resolveThemeVars(theme, mode)` / `theme.toStyle()` onto a wrapper).
A theme written against the old knobs keeps one brand: `primary` also gives
the hover fill (90 %) and links, `ring` the focus ring, and `radius` the
sm/md/lg steps, unless the theme sets those roles itself (in either mode).

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
theme's CSS variables inline and sets the `.dark` class and `data-theme-mode` on
that scope per `mode`, so it tracks `HostBridge.theme` or the OS preference. In
dark mode the scope gets the toolkit's dark roles plus the theme's dark and
mode-invariant tokens, never its light surfaces. A nested provider without
`theme` re-applies the enclosing one's theme in its own mode. Dialogs, sheets
and select menus opened inside portal into the scope (`usePortalContainer`):
the portal node is the wrapper's first child, an empty `display: contents`
element, so `space-*`, `divide-*` and `last:` see only your children. Two
differently themed subtrees can coexist on one page.

### useTheme

`useTheme()`: read the active `{ theme, mode, resolvedMode }` from the nearest
`ThemeProvider` (`resolvedMode` is `"system"` resolved to `"light"` | `"dark"`).
Throws outside a provider.

### usePortalContainer

`usePortalContainer()`: the nearest `ThemeProvider`'s portal node, or `null`.
Pass it as `container` to a portal of your own so it keeps the scope's theme
and mode; the toolkit's `Dialog`, `Sheet` and `Select` already do.

### themePresets

`themePresets.emerald`: a ready-made `ThemeDefinition` (its own `primary`,
hover, link, focus and `radius`, light and dark, contrast-tested like the
default). A demonstration of `createTheme` and a fork-able starting point;
pass it to `ThemeProvider`'s `theme` prop.
`themePresets.miragon` and `.violet` are **deprecated**: the Miragon theme is
the toolkit's default (render without a theme), and violet is the look the
Miragon design system rules out. Both go in the next major.

### CD_TOKENS

`CD_TOKENS`: the Miragon corporate-design tokens as plain TypeScript, keys
without the `--cd-` prefix (`CD_TOKENS.blau`, `CD_TOKENS["danger-soft"]`), and
`CD_TOKENS_VERSION` (the miragon-brand release). Drift-tested against the
vendored `cd-tokens.generated.css`.

**When to use:** code that cannot read CSS variables: an SVG or canvas
renderer, chart marks, a server-side image. UI components style through the
role tokens instead.

### fontFaces

`fontFaces({ baseUrl, files?, display? })`: the `@font-face` rules for Geist
and Geist Mono (latin, variable weight 100 to 900) served from `baseUrl`;
`GEIST_FONT_FILES` names the woff2 files `@fontsource-variable` ships.

```tsx
import { fontFaces } from "@miragon/mcp-toolkit-ui"
;<style>{fontFaces({ baseUrl: "https://mcp.example.com/fonts" })}</style>
```

**When to use:** load Geist without inlining it into every view (allow the
origin in the view CSP). The bundled alternative is
`@import "@miragon/mcp-toolkit-ui/fonts.css"`. Without either, the host's
font or the system stack renders.

### adoptHostFontVariables

`adoptHostFontVariables(style, hostVariables)`: SEP-1865 hosts send their font
as `--font-sans`/`--font-mono`, the same names as the font roles, and would
replace the Geist-first stacks whole. This moves them to
`--host-font-sans`/`--host-font-mono` (`HOST_FONT_VARIABLES`), the fallback
slot right after Geist.

```tsx
import { adoptHostFontVariables } from "@miragon/mcp-toolkit-ui"
adoptHostFontVariables(document.documentElement.style, hostContext.styles?.variables)
```

**When to use:** only in an app with its own host-document layer, right after
it applied the host's style variables. `McpToolkitApp` already does it.

## Localization

### LocaleProvider / useToolkitMessages

`LocaleProvider` props: `locale` (required), `translator?` (from
`createTranslator`), `toolkitMessages?` (per-section overrides of the toolkit's
own strings), `children`. `useToolkitMessages()` returns the toolkit strings for
the active locale: the shipped `en`/`de` catalog (`TOOLKIT_MESSAGES`), English for
any other locale.

```tsx
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
;<LocaleProvider locale={host.locale} toolkitMessages={{ listFooter: { loadMore: "Show more" } }}>
  <YourWidget />
</LocaleProvider>
```

**When to use:** pass the app's locale once; every toolkit component below
(list footer, dialogs, toasts, the view chrome and the builder) follows it.
`formatCount(value, locale)` formats counts with the same locale.

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
