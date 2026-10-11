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

Props: `variant?: "default" | "secondary" | "danger" | "success" | "warning" | "info" | "outline" | "ghost" | "link"`, `className?`. The status variants follow the tone model: tint, foreground text, a border in the tone; `destructive` is the deprecated name of `danger`.

```tsx
import { Badge } from "@miragon/mcp-toolkit-ui"
;<Badge variant="danger">Overdue</Badge>
```

**When to use:** inline status/label pill. For a tone-driven status dot or a
state in words or a count, see [`LivePill` / `StatusBadge` / `CountPill`](#livepill--statusbadge--countpill).

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
/ `*Close` parts. Opened from state without a `*Trigger`, both still hand the
focus back to the element that had it when they opened; let them focus their
first field themselves (no `autoFocus` inside), and pass `onCloseAutoFocus`
with `preventDefault()` to take the focus elsewhere.

**When to use:** `Dialog` to confirm a destructive action or show detail in a
modal; `Sheet` for a side panel to view/edit without leaving the widget.

### Alert

Parts: `Alert`, `AlertTitle`, `AlertDescription`. Prop: `variant?: "default" | "danger"` (`destructive` is the deprecated name of `danger`).

**When to use:** an inline notice inside a widget body. For a failed fetch use
[`ErrorState`](#errorstate) (title, next step, raw reason under Details, retry).

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
primitives + `cn`, no host dependency). Many are **tone-aware**: they take a
tone from ONE vocabulary (`"success" | "warning" | "danger" | "info" | "neutral"`)
that maps to the status roles in `theme.css`, so they re-skin with the theme.
A retired name (`critical`, `error`, `destructive`, …) still resolves through
[`resolveTone`](#tone-vocabulary). Status shows as a dot, icon or border next
to readable text, never as coloured text; see [the tone tokens](#tone-tokens).
Text sits on the [type scale](#type-scale): nothing renders below 13 px.

### KpiGrid / KpiGridSkeleton

A row of headline metrics, the canonical way to show KPIs in a widget
(replaces the old single-metric `KPICard`). Cells flow as 1–6 columns; from 4
cells on they fall back to 2 columns in narrow frames (inline chat views are
often under 500 px).

| Prop        | Type                | Required | Notes                                                                                                                       |
| ----------- | ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `cells`     | `KpiCell[]`         | yes      | `{ label, value, fraction?, trend?, trendDirection?, trendTone?, tone?, onClick?, actionHint? }`.                           |
| `variant`   | `"strip" \| "soft"` | no       | `"strip"` (default): one bordered strip, the tone as a dot next to the label. `"soft"`: a card per cell in its tone's tint. |
| `boxed`     | `boolean`           | no       | Wrap the strip in a bordered card with an optional `header`. Default `false` (lighter `border-y` strip).                    |
| `header`    | `KpiGridHeader`     | no       | `{ label, badge? }` group header above the strip (13 px semibold, normal case).                                             |
| `ariaLabel` | `string`            | no       | Names the group (`role="group"`); omit when a heading right above names it.                                                 |

```tsx
import { KpiGrid } from "@miragon/mcp-toolkit-ui"
;<KpiGrid
  cells={[
    {
      label: "Open incidents",
      value: 18,
      tone: "danger",
      onClick: openIncidents,
      actionHint: "Opens the incidents dashboard",
    },
    { label: "In progress", value: 5 },
    { label: "Done", value: 130, trend: "+8 today", trendDirection: "up", trendTone: "success" },
  ]}
/>
```

**When to use:** a row of metrics at the top of a widget. Pre-format values for
locale/currency. Figures stay in the foreground at the page-title size: a cell
`tone` shows as a dot next to its label (or as a soft card's tint and edge), a
trend as a Lucide direction icon in the trend's tone (`up` reads as worse unless
`trendTone` says otherwise; a dot when there is no direction) next to neutral
words. A cell with `onClick` is a button whose accessible name is its visible
label and value (WCAG 2.5.3); `actionHint` says what the click does
(`aria-describedby`). `ariaLabel` on a cell is deprecated: it replaces the
visible label for voice control. `KpiGridSkeleton` (`cells`, `variant?`,
`boxed?`) keeps the loaded grid's geometry while the data loads (`aria-busy`).

### LivePill / StatusBadge / CountPill

Tone-driven pills, all with foreground text on the tone's tint and a rim in the
tone. `LivePill` (`tone?`, default `"info"`; `children?`, default the locale's
"Live") shows a dot that pulses unless reduced motion is on. `StatusBadge`
(`tone` and `children` both required) says a state in words with a static dot:
a badge without words would make colour the only signal. `CountPill` (`tone?`,
default `"neutral"`; `children` required) is a compact tabular-number count.
All take `className`.

```tsx
import { CountPill, LivePill, StatusBadge } from "@miragon/mcp-toolkit-ui"
;<LivePill tone="success">Streaming</LivePill>
;<StatusBadge tone="warning">Suspended</StatusBadge>
;<CountPill tone="danger">{incidents.length}</CountPill>
```

**When to use:** `LivePill` in a header to signal live data; `StatusBadge` for
a state on a detail-page header (`WidgetHeader`'s `badge`) or in a table cell;
`CountPill` as the right-aligned count on a list/group row. A count without a
state stays `neutral`.

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

Props: `title: ReactNode` (required), `as?: "h1" … "h6"` (heading element,
default `"h1"`), `size?: "default" | "detail"` (28 px / 700 or 21 px / 600; the
size follows `size`, not the level), `badge?` (above the title, a
`StatusBadge`), `titleSuffix?` (inside the heading, e.g. a version chip),
`sub?`, `actions?`, `className?`. `icon?` / `iconTone?` are deprecated: the icon
tile above every title is a pattern the CI rules out; say a state with `badge`.

```tsx
import { LivePill, StatusBadge, WidgetHeader } from "@miragon/mcp-toolkit-ui"
;<WidgetHeader
  as="h3"
  title="Incidents"
  badge={<StatusBadge tone="danger">18 open</StatusBadge>}
  sub={<LivePill>Live</LivePill>}
  actions={<button>Refresh</button>}
/>
```

**When to use:** anchor the top of a widget surface, once per widget. Pick the
level that keeps ONE outline per view: below `McpAppView`'s toolbar title (an
`h2`) use `as="h3"`, or hide the toolbar title (`titleMode="hide"`).

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
`searchPlaceholder?` (default: the locale's "Filter…"), `searchAriaLabel?`
(default: the locale's "Filter"; a placeholder is no label), `chipsAriaLabel?`
(names the chip group, default the locale's "Filters"), `className?`.
`FilterChip` is `{ id, label, count?, active? }`.

```tsx
import { FilterBar, useDebouncedValue } from "@miragon/mcp-toolkit-ui"

const debounced = useDebouncedValue(search)
;<FilterBar
  search={search}
  onSearchChange={setSearch}
  searchAriaLabel="Filter incidents"
  chips={[{ id: "open", label: "Open", count: 12, active: true }]}
  onChipToggle={toggle}
/>
```

**When to use:** filter a list/table of widget items. Every chip is a toggle
button with `aria-pressed`; an active chip is a selection (the info tint and
edge around foreground text). Pair with `useDebouncedValue` so a server-side
filter only re-queries once typing pauses.

### DrillButton

Props: `children: ReactNode` (required), `onDrill: () => void` (required),
`icon?` (a leading Lucide icon, decorative), `size?: "sm" | "md"` (default
`"sm"`), `ariaLabel?` (keep the visible text in it, WCAG 2.5.3). A neutral
outline button with a trailing Lucide `ArrowRight`.

```tsx
import { DrillButton } from "@miragon/mcp-toolkit-ui"
;<DrillButton onDrill={() => host.showWidget(intent)}>Open</DrillButton>
```

**When to use:** the single in-widget navigation control (drill into a
detail/sub-view). Use it for every drill so they read identically and stay
visually quieter than primary/agentic actions.

### ListFooter / PagedListFooter

`ListFooter` props: `shown: number`, `total: number`, `hasMore: boolean`,
`onLoadMore: () => void` (all required), `loadingMore?`, `noun?` (default: the
locale's word for rows), `refreshing?` (a first page is in flight over the rows
on screen: adds a visible "Updating…"), `stale?` (the rows are the previous
result: the count and "Load more" hide), `labels?` (overrides of the catalog's
`listFooter` strings), `announce?` (default `true`), `className?`. The count
line is a polite live region (`role="status"`), so the new total is announced
after "Load more" or a filter change; set `announce={false}` only where your own
live region already announces the count. With nothing to count and nothing in
flight it shows nothing, but the live region stays mounted (visually hidden)
and says "No entries" (`listFooter.noResults`), so a search that finds nothing
is announced too. Text and number format follow the active locale ("Zeigt 8
von 42 …" under `de`).

`PagedListFooter` (`paged`, `noun?`, `labels?`, `retryLabel?`) is the whole
tail of a paged list. `paged` is structural (`PagedListState`: `items`,
`total`, `hasMore`, `loadMore`, `loadingMore?`, `refreshing?`, `stale?`,
`firstPage?`, `error?`, `retry?`, `loadMoreError?`), so a paged-query hook's
result passes as is. It keeps two failures apart because their retries differ:
a failed first page over the previous rows (a warning alert whose retry re-runs
page 0) and a failed load-more (a danger alert whose retry fetches the next
offset). Each is an inline `ErrorState` with the raw reason under "Details". A
first-page failure with no rows on screen is left to your loading guard.

```tsx
import { ListFooter, PagedListFooter } from "@miragon/mcp-toolkit-ui"
;<ListFooter
  shown={rows.length}
  total={total}
  hasMore={hasMore}
  onLoadMore={fetchNext}
  noun="incidents"
/>
;<PagedListFooter paged={pagedQuery} noun="incidents" />
```

**When to use:** footer for a paginated list — an honest "Showing X of Y" total
plus an explicit "Load more" (not infinite scroll). Use `PagedListFooter` when
the list can fail or refetch while rows stay on screen.

### Replacing a forked kit

The composed components above absorbed the improvements of the kit fork in
miragon-ai's `packages/core/widget-shell/src/ui`, so a consumer imports them
from `@miragon/mcp-toolkit-ui` and deletes its copy. What changes on the way:

| Fork file               | Toolkit symbol                                          | Differences to handle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kpi-grid.tsx`          | `KpiGrid`, `KpiGridSkeleton`, `KpiCell`                 | A clickable cell is named by its visible label and value: move the fork's required `ariaLabel` into `actionHint` (WCAG 2.5.3; `ariaLabel` still works, deprecated). Figures at `text-title` (28 px), trend and header at 13 px in normal case, soft cards `rounded-lg`. The strip's dividers sit on the cells: the fork's `gap-px` on a `bg-border` grid painted the empty tracks of a short last row (5 cells in 2 columns) as a solid block of the divider colour.                                                                                                                                                                                                    |
| `pills.tsx`             | `LivePill`, `StatusBadge`, `CountPill`                  | `StatusBadge` requires `tone` (the fork defaulted to `danger`) and its text; all three at 13 px or more with `rounded-sm`; `LivePill`'s default label comes from the catalog.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `filter-bar.tsx`        | `FilterBar`, `FilterChip`                               | The search input's name defaults to the catalog's "Filter" (the fork reused the placeholder); the chips sit in a named `role="group"` (`chipsAriaLabel`) and carry `FOCUS_RING`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `widget-header.tsx`     | `WidgetHeader`                                          | `as` picks the heading level (the fork always rendered an `h1`); `size` maps to `text-title` / `text-section` (the fork used 30 / 24 px); the `sub` meta row is a 13 px caption row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `paged-list-footer.tsx` | `PagedListFooter`, `PagedListState`                     | `paged` is structural, so the fork's `PagedViewData` passes as is. The text props (`loadMoreErrorText`, `refreshErrorText`, `refreshingText`) become `labels` (`ListFooterMessages`); the raw reason moves under "Details" instead of into the sentence. The live region is `ListFooter`'s count line: while the fork still wraps `ListFooter` next to its own `role="status"`, it passes `announce={false}`, or the count is announced twice. Like the fork's persistent region, the count line stays mounted at zero rows (visually hidden) and says "No entries" (the fork: "0 / 0 {noun}"), so a search that finds nothing is announced. `PagedRows` is not lifted. |
| `tone-utils.ts`         | `TONE_*`, `TONE_VARIANTS`, `resolveTone`, `MICRO_LABEL` | Same maps. `TONE_INK.neutral` is the foreground (the fork: muted); `MICRO_LABEL` is 13 px semibold in normal case (the fork: 11 px uppercase). A leftover `critical` resolves to `danger`. Replace `cn.ts` (next row) first: `MICRO_LABEL` merged through the fork's `cn` loses a class.                                                                                                                                                                                                                                                                                                                                                                                |
| `cn.ts`                 | `cn`                                                    | The fork's `cn` is plain tailwind-merge, which reads a type-scale step (`text-title` … `text-small`) as a text COLOUR: `cn("text-muted-foreground", MICRO_LABEL)` drops the colour, and a colour after the step drops the 13 px. No error and no test flags it. Swap it for the kit's `cn` before it merges `MICRO_LABEL` or a `text-*` step, or extend it: `extendTailwindMerge({ extend: { theme: { text: [...TYPE_STEPS] } } })`.                                                                                                                                                                                                                                    |

## Feedback and states

One pattern each, so every widget reports outcomes the same way. All import
from `@miragon/mcp-toolkit-ui`; their text defaults come from the active locale.

### ToastProvider / useToast

```tsx
import { useToast } from "@miragon/mcp-toolkit-ui"
const toast = useToast()
toast.show({ tone: "success", title: "Job retried." })
toast.show({ tone: "danger", title: "Retry failed.", description: "Try again in a moment." })
```

**When to use:** confirm a write or report a failure instead of a silent
`console` line. The stack sits bottom centre: status colour as left edge and
icon next to plain text, in ONE persistent `aria-live="polite"` region that
is mounted before the first toast and never changes its attributes (a role or
name switched on with the first toast would rebuild the region with the toast
already in it, and that toast would go unannounced). It has no role, so an idle
stack is no second "status" next to a view's loading line; a test finds it by
`data-slot="toast-viewport"`. The text is running text (16 px).
A toast shows 2.8 s (errors 5 s); hover or keyboard focus holds it, and on
leave it resumes with the time that was LEFT, not a fresh duration. `McpAppView` mounts
the provider; outside one, `useToast()` is a no-op. The title says what
happened, the description what to do next, both from your catalog: keep the
raw error (`error.message`) out of the toast and log it, or show it under an
`ErrorState`'s Details. Toast icons follow the `LucideProvider` around the
outermost `ToastProvider` (stroke 2.5 inside `McpAppView`).

### EmptyState

Props: `title` (required), `description?` (one help line), `icon?` (Lucide icon or
a brand mark, decorative; an SVG renders at 24 px unless it carries its own
`size-*` class, so a mark can be larger), `tone?: "neutral" | "success"`, `action?`,
`secondaryAction?`, `titleAs?` (default `"h3"`).

```tsx
import { EmptyState } from "@miragon/mcp-toolkit-ui"
import { CircleCheck } from "lucide-react"
;<EmptyState icon={<CircleCheck />} tone="success" title="No open incidents" />
```

**When to use:** a list, table or view with nothing to show. At most two
actions. The help line is running text (16 px).

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
that still renders. The tone shows as rim, tint and icon (`TONE_BORDER`,
`TONE_SOFT`, `TONE_ICON`); every word, Details included, stays in the
foreground. The `block` description is running text (16 px); the `inline`
alert box stays at the dense 14 px.

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

| Role                    | Token           | Maps                                                           |
| ----------------------- | --------------- | -------------------------------------------------------------- |
| fill, dot, border, icon | `--<tone>`      | `TONE_DOT`, `TONE_BORDER`, `TONE_ICON`                         |
| tint                    | `--<tone>-soft` | `TONE_SOFT` (tint + foreground text), `TONE_TINT` (tint alone) |
| text on a plain surface | `--<tone>-ink`  | `TONE_INK` (`TONE_TEXT` is its deprecated name)                |

Status is never text in its own colour: success and warning reach only
1.67:1 / 1.83:1 on white, so their ink is the foreground. Text on a tint is
always the foreground (pair `TONE_SOFT` with `TONE_BORDER`), and figures (KPI
values, trends, counts) never take a tone colour: the tone shows as a dot next
to them. In dark mode the colours are the `-hell` values and the tints are
transparent.

```tsx
import { TONE_DOT, TONE_INK, type ToneVariant } from "@miragon/mcp-toolkit-ui"
;<span className="inline-flex items-center gap-1.5">
  <span aria-hidden="true" className={`size-2 rounded-full ${TONE_DOT[tone]}`} />
  <span className={TONE_INK[tone]}>{label}</span>
</span>
```

**When to use:** colour a custom element by status without hand-rolling a
`tone === "x" ? …` ternary. `TONE_ICON` is for SVG icons only. The tone-aware
components (`KpiGrid`, `LivePill`, `StatusBadge`, `CountPill`, `Badge`)
consume these internally.

### Tone vocabulary

ONE vocabulary: `TONE_VARIANTS` (`"danger" | "warning" | "success" | "info" |
"neutral"`, in severity order). One red and one amber: there is no severity
above `danger`. `resolveTone(name, fallback = "neutral")` maps any name onto
it: a tone as is, a retired name from `TONE_ALIASES` (case-insensitive) onto
its tone, anything else onto the fallback. `isToneVariant(value)` is the type
guard for data from the wire. The props typed `ToneName` (`ToneVariant` or
`ToneAlias`) resolve it this way: `KpiCell`'s `tone` and `trendTone`,
`LivePill`, `StatusBadge`, `CountPill` and `WidgetHeader`'s `iconTone`, so a
server-built cell with a retired name never renders without a colour. The
feedback components keep their own subset in the types: `Toast` (`success |
warning | danger | info`), `ErrorState` (`danger | warning | info`),
`EmptyState` (`neutral | success`). A name that still reaches them untyped
(plain JS, wire data) resolves through `resolveTone`; whatever falls outside
the subset gets the default (`info` for a toast, `danger` for an error state,
`neutral` for an empty state), so it never crashes a view. `Badge` and
`Alert` variants are their own keys (`destructive` the deprecated name of
`danger`); pass them a resolved tone.

| Retired name                                  | Tone      |
| --------------------------------------------- | --------- |
| `critical`, `error`, `destructive`, `failure` | `danger`  |
| `warn`                                        | `warning` |
| `ok`, `positive`                              | `success` |
| `notice`                                      | `info`    |
| `default`, `muted`, `secondary`               | `neutral` |

```tsx
import { resolveTone, StatusBadge } from "@miragon/mcp-toolkit-ui"
;<StatusBadge tone={resolveTone(row.severity)}>{row.label}</StatusBadge>
```

**When to use:** write the five tones in new code; reach for `resolveTone` when
a tone arrives as data. `Button`'s `destructive` variant is an ACTION (the
`--destructive` fill of an irreversible action), not a status tone, and stays.

### Type scale

The CI type scale (modeler-tool-design §4, adapted for embedded widgets) as
role tokens and Tailwind utilities of the same name; each sets size, line
height and (for the titles) weight. `TYPE_SCALE`, `TYPE_STEPS`,
`TYPE_FLOOR_PX` and `MICRO_LABEL` are the same scale in TS.

| Utility        | Size / weight / line height | Use                                                                                                                                |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `text-title`   | 28 px / 700 / 1.2           | page title (the CI h2), KPI figures                                                                                                |
| `text-section` | 21 px / 600 / 1.3           | section title (CI h3), dialog title, detail-page title                                                                             |
| `text-body`    | 16 px / 400 / 1.6           | running text: state titles and descriptions, toasts                                                                                |
| `text-dense`   | 14 px / 400 / 1.5           | dense tables and controls (inputs, chips, count pills, the inline alert box): the documented product exception, never running text |
| `text-small`   | 13 px / 400 / 1.5           | captions, labels, hints: the FLOOR                                                                                                 |

```tsx
import { cn, MICRO_LABEL } from "@miragon/mcp-toolkit-ui"
;<th className={cn(MICRO_LABEL, "text-muted-foreground")}>Activity</th>
```

**When to use:** every text size in kit and widget code. Nothing renders below
13 px — no `text-xs`, no `text-[10px]` micro-labels; a former 10–11 px
uppercase caption is `MICRO_LABEL` (13 px semibold, normal case). The design
gate (`examples/test/design-system.test.ts`) fails on `text-xs`, an arbitrary
`text-[…]` under 13 px / 0.8125 rem, a CSS `font-size` or a React `fontSize`
under 13 px. Combine the utilities through the kit's `cn` (plain
tailwind-merge drops `text-small` next to a text colour). A brand resizes the
steps through `--text-*` (`ThemeTokens` `textTitle` … `textSmall`).

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

- `queryKey: readonly unknown[]` — the cache-key prefix. The effective key is
  `[...queryKey, args]` (`toolQueryKey`): callers with different `args` get
  separate entries. Two tools must not share a key and args (their answers
  would overwrite each other); the hook warns in the console when they do.
  With `toolNameInQueryKey` on the `AppQueryProvider` (or `McpAppView`) the
  key is `[...queryKey, toolName, args]`, so two tools never share an entry
  whatever key their callers pass; the next major makes that the default.
  Build an exact key with `useToolQueryKey(queryKey, toolName, args)` (or
  the pure `toolQueryKey`), not by hand: it follows the setting in force.
- `opts?: UseToolQueryOptions` — TanStack's query options, passed through:
  `retry`, `retryDelay`, `staleTime`, `placeholderData` / `keepPreviousData`,
  `initialData` + `initialDataUpdatedAt`, `enabled`, `select`, `gcTime`, …
  (everything but `queryKey` / `queryFn`).
- Returns TanStack's `UseQueryResult`: `data`, `error`, `refetch`,
  `failureCount`, `failureReason`, `isFetching`, `isPlaceholderData`, ….

```tsx
import { keepPreviousData, useToolQuery } from "@miragon/mcp-toolkit-ui"

const { data, isFetching, isPlaceholderData, failureReason, refetch } = useToolQuery<Incident[]>(
  ["incidents"],
  "camunda7_incidents_data",
  { processKey, search },
  { placeholderData: keepPreviousData },
)
```

**Retries.** `retry` defaults to the client's (TanStack's three retries in the
browser), for a tool's `isError` answer too, because a tool may answer a
transient failure that way. Where `isError` means a deterministic answer (a
validation error, a 404), opt in to `shouldRetryToolCall`: no retry for a
tool's own `isError` answer, up to three for a failed transport. The error
then shows at once instead of after about 7 s. Per query
(`{ retry: shouldRetryToolCall }`) or for a whole client
(`queryClient.setDefaultOptions({ queries: { retry: shouldRetryToolCall } })`,
or an `AppQueryProvider` `client` of your own, which a nested provider such
as `McpAppView`'s keeps); `isToolError(error)` tells the two failures apart
in a policy of your own. A missing transport is never retried.

**Transport.** The tool goes through `AppQueryProvider`'s `callTool`, else the
nearest `HostBridgeProvider`'s bridge. With neither, the query fails with a
"no tool transport" error instead of idling, and fetches once a transport
arrives.

**When to use:** self-fetch arbitrary data from a tool inside a
cockpit-embedded widget. Decoded with `parseToolResult` (structured-first).

### useToolMutation

`useToolMutation(toolName, opts?)` — root import. `opts?: UseToolMutationOptions`:
TanStack's mutation options (`onSuccess`, `onError`, `onSettled`, `retry`,
`meta`, `mutationKey`, …) plus `invalidateKeys?: unknown[][]`.

```tsx
import { useToolMutation } from "@miragon/mcp-toolkit-ui"

const retry = useToolMutation("camunda7_retry_incident", {
  invalidateKeys: [["incidents"]],
})
// Each call gets its own confirmation, also when two run at once.
retry.mutate({ incidentId }, { onSuccess: () => markResolved(incidentId) })
```

After each successful call the `invalidateKeys` prefixes are invalidated
(`invalidateQueries`): active queries refetch, inactive ones turn stale and
refetch when they are next used. The per-call callbacks of
`mutate(args, { onSuccess, onError, onSettled })` fire for **every** call while
the widget is mounted; TanStack's own `mutate` keeps only the latest call's.

**When to use:** run a write/action tool and refresh dependent queries.

### useViewToolQuery

`useViewToolQuery(queryKey, toolName, args, opts?)` — **`/hooks` import**.
Same key and options contract as `useToolQuery`.

```tsx
import { useViewToolQuery } from "@miragon/mcp-toolkit-ui/hooks"

const { data } = useViewToolQuery<OrderData>(["order"], "orders_show_order", { id })
```

**When to use:** self-fetch from a `*_show_*` widget tool. Unwraps the
`McpAppView` view envelope via `parseViewToolResult` (single-step → flat data,
multi-step → keyed by step id) — the envelope-aware sibling of `useToolQuery`.

### useViewData

`useViewData(initialData, key, tool, args, ready, options?)` — **`/hooks` import**.
Returns `{ data, loading, error, refetch, failureCount, failureReason,
isFetching, isPlaceholderData }`; `refetch` is the retry of the error state and
reads anew at once, also while a failed fetch still waits on its backoff.

```tsx
import { ErrorState, useTranslate } from "@miragon/mcp-toolkit-ui"
import { useViewData } from "@miragon/mcp-toolkit-ui/hooks"

function IncidentPanel({
  data: pushed,
  processKey,
}: {
  data: Incident | null
  processKey?: string
}) {
  const t = useTranslate()
  const { data, loading, error, refetch } = useViewData(
    pushed,
    ["incident", processKey],
    "camunda7_incident_data",
    { processKey },
    Boolean(processKey),
  )
  if (error) {
    return <ErrorState title={t("incident.loadFailed")} details={error.message} onRetry={refetch} />
  }
  // …
}
```

`options?: UseViewDataOptions` passes TanStack's query options to the feed
(`enabled`, a boolean or a function of the query, is an extra gate next to
`ready`; a closed gate is not `loading`) and picks how host data is used:

- `initialDataMode: "static"` (default): host data is returned verbatim and
  the feed stays off while it is present.
- `initialDataMode: "seed"`: host data becomes the feed query's cached
  answer and the feed stays live: a write's invalidation, a `refetch` or a
  retry re-reads it. A fresh seed is not refetched on mount (it is younger
  than `staleTime`; set `initialDataUpdatedAt` for an older payload). A payload
  delivered anew replaces the cached answer; a re-rendered or remounted old
  one never rolls a refetched answer back. Hand in `initialData` only for the
  `args` it answers.

**When to use:** the dual-mode seam — write **one** widget that renders
host-pushed data when handed it (a standalone `*_show_*` widget) **and**
self-fetches when embedded in a cockpit. Sibling widgets sharing `key` and
`args` dedupe to a single call.

### Query options instead of hand-rolled query hooks

The options above replace the workarounds consumers built around the 2.7
hooks (miragon-ai's widget-shell is the reference). Mapping:

| Workaround                                                                 | With the options                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSeededToolQuery(key, tool, args, { seed, enabled })`                   | `useViewData(seed, key, tool, args, enabled, { initialDataMode: "seed" })`. `data`, `error`, `failureReason`, `isFetching` and the cancel-then-refetch `refetch` are on the result; no direct `queryClient` write.                                  |
| its `[...key, args]` cache key (`setQueryData`, exact `cancelQueries`)     | `useToolQueryKey(key, tool, args)` (or `toolQueryKey`): the same key by default; with `toolNameInQueryKey` (opt-in now, the default in the next major) it carries the tool name, and the helper follows. Prefix invalidation by `key` is unchanged. |
| a key root unique to each tool, so two tools never share an entry          | `toolNameInQueryKey` on `McpAppView` / `AppQueryProvider`: the tool name is in every key. Without it, the hooks warn when two tools share a key and args.                                                                                           |
| `refreshError` / `refreshing` of a seeded view                             | `data ? (error ?? failureReason) : null` / `Boolean(data) && isFetching` from the result.                                                                                                                                                           |
| `useKeptPage(fetched, scope)` (keep the last page 0 per list)              | `placeholderData: keepPreviousData` on the page-0 query (`isPlaceholderData` is the old `stale`). To keep rows only within one list, pass a function: `placeholderData: (prev, prevQuery) => (sameList(prevQuery?.queryKey) ? prev : undefined)`.   |
| `retry: false` on the client's defaults so a tool error shows at once      | `retry: shouldRetryToolCall` (per query or as the client's default): no retry for an `isError` answer, still three for a lost transport. Tune further with `retry` / `retryDelay`, or give `AppQueryProvider` a `client` of its own.                |
| `mutation.mutateAsync(args).then(…)` per call, to keep each call's outcome | `mutation.mutate(args, { onSuccess, onError })`: the per-call callbacks fire for every call.                                                                                                                                                        |
| an `AppQueryProvider callTool` that only forwards the bridge               | Nothing: the hooks fall back to the nearest `HostBridgeProvider`.                                                                                                                                                                                   |

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
  view hooks into the bridge; `getWidgetData()` returns the payload
  `McpAppView` shows, a re-loaded one included. Already included in
  `McpToolkitApp`, so widgets rendered by the toolkit shell need no wrapping.

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
Without `children` it reports one line where it renders.

### useHostModelContext

`useHostModelContext(content)` — **`/app` import**. Reports one line of model
context for as long as the component is mounted; a blank or `null` line reports
nothing.

```tsx
import { useHostModelContext } from "@miragon/mcp-toolkit-ui/app"

useHostModelContext(selected ? `The user selected incident ${selected.id}.` : null)
```

**When to use:** a component with nothing to wrap (a selection, a filter, an
error the user sees). Inside an mcp-use view the line joins the view's one
model-context tree, beside every `HostModelContext` and the view's own lines
(an error state, failed data steps), and leaves it on unmount; elsewhere it
goes through the `HostBridge`'s `setModelContext`.

### DescribeForModel

Type: `(data: NonNullable<T>, props: Readonly<Record<string, unknown>>) => string`.
The callback shape for `adaptDataWidget`'s third argument — report view identity,
active filters, and headline numbers.

### parseToolResult / parseViewToolResult

- `parseToolResult(result, opts?)` — decode a raw `callTool` result to its data
  payload. Structured-first: `isError` → throw a `ToolResultError`, then
  `structuredContent`, then JSON-decoded text, then raw. `opts.prefer: "text"`
  flips the order. `useToolQuery` decodes through this for you.
- `ToolResultError` / `isToolError(error)`: the tool's own `isError` answer
  (a validation error, an engine 404), as opposed to a transport failure.
  `isToolError` also matches mcp-use's `ToolError`, which a view's `callTool`
  rejects with. The query hooks retry it like any failure by default (the client's `retry`);
  pass `retry: shouldRetryToolCall` to stop that.
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
