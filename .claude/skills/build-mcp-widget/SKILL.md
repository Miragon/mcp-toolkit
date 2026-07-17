---
name: build-mcp-widget
description: >-
  Build an MCP widget against @miragon/mcp-toolkit-ui. Use when asked to build a
  widget, render a tool result as UI, add a card/panel/dashboard for an MCP tool,
  write a *_show_* widget, or turn structuredContent into a React component in
  this repo. Encodes the data contract (tool result -> ViewStructuredContent ->
  data prop), the component catalog, host-portable authoring (useHostBridge), and
  the widget-playground iterate loop.
---

# Build an MCP widget against `@miragon/mcp-toolkit-ui`

In this repo, widgets are **hand-built and prompted on top of** the
`@miragon/mcp-toolkit-ui` base — they are **not** auto-generated and not a
generic data renderer. Design quality is the point. Your job is to write a clean,
host-portable React component against the toolkit's primitives, with a clear
data contract, and to iterate on it in isolation.

**Ground truth before you write a line:**

- **Component catalog** — [`docs/reference/components.md`](../../../docs/reference/components.md)
  (human) and [`packages/ui/ui-catalog.json`](../../../packages/ui/ui-catalog.json)
  (machine). Every prompt-relevant component/hook, its import path, props, and
  "when to use". Reach for these instead of re-deriving a component from `<div>`s.
- **Reference widgets** —
  [`OrderStatusCard`](../../../examples/host-portability/OrderStatusCard.tsx)
  (host-portable, full bridge surface),
  [`CustomerCard`](../../../examples/widget-playground/CustomerCard.tsx)
  (a plain-props `({ keys })` playground fixture), and
  [`TasksBoard`](../../../examples/modules/tasks/widgets/TasksBoard.tsx)
  (a `({ data })` widget pushed by a `show_*` tool, registered with
  `adaptDataWidget`, with self-fetch refresh + agentic hand-offs).
- **End-to-end module** — when you also own the server, the
  [`tasks` module](../../../examples/modules/tasks/README.md) is the full worked
  example: domain tools via `createToolRegistrar`, a `show_tasks_board` widget
  tool (`buildSingleWidgetView` + `uiMeta`), an app-only `tasks_board_data` feed,
  and the `TasksBoard` widget — wired into the host and the app bundle.

Do **not** duplicate the catalog here. Open it, pick components, follow the steps.

**Related skills:** [`build-mcp-server`](../build-mcp-server/SKILL.md) when you also
own the server (tools + the `show_*` tool that pushes this widget),
[`add-mcp-tool`](../add-mcp-tool/SKILL.md) for the tool a widget calls, and
[`white-label-client`](../white-label-client/SKILL.md) for the theming tokens this
widget must use.

## Step 0 — Decide which widget shape you're writing

Two shapes cover almost everything:

- **Single-data widget** — `function W({ data }: { data: T | null })`. The most
  reusable shape. Register it with `adaptDataWidget` for `render-view` / `*_show_*`
  tools; it can also self-fetch via `useViewData` when embedded in a cockpit.
- **Keys widget** — `function W({ keys }: { keys: Keys })`. Reads a value from the
  pipeline `keys` map (e.g. `keys["customers:customer"]`). Pure props, often no
  tool call. See `CustomerCard`.

Write the rendering logic as a plain `({ data })` / `({ keys })` component. Keep
host concerns (tool calls, navigation) behind the bridge (Step 3) so the same
code is testable and portable.

## Step 1 — Understand the data contract

A tool's result reaches your widget as **`structuredContent`**, not text. The
text channel carries only a short model-facing summary. Three paths put data in
front of a widget:

1. **Host-pushed (a `*_show_*` widget tool).** The view builders
   (`buildSingleWidgetView` / `buildComposedView`) and `render-view` wrap the
   data in a `ViewStructuredContent` envelope
   ([`packages/core/src/types/view-data.ts`](../../../packages/core/src/types/view-data.ts)):

   ```ts
   interface ViewStructuredContent {
     context: {
       keys: Record<string, unknown>
       stepIds: string[]
       stepData: Record<string, { data: unknown; keys; _app?; _dataType? }>
       errors: { stepId: string; reason: string }[]
     }
     layout: LayoutConfig
     // …
   }
   ```

   `adaptDataWidget(Widget, dataType)` finds the step in `context.steps` whose
   `_dataType` matches and forwards its `.data` to your widget as the `data`
   prop — so your `({ data })` component never sees the envelope. From source
   ([`adapt-data-widget.tsx`](../../../packages/ui/src/app/adapt-data-widget.tsx)):

   ```tsx
   const stepResult = Object.values(context.steps).find((s) => s._dataType === dataType)
   const data = (stepResult?.data ?? null) as T | null
   ```

2. **Self-fetch from a `*_show_*` tool.** Use `useViewToolQuery` (from
   `@miragon/mcp-toolkit-ui/hooks`) — it decodes the same envelope with
   `parseViewToolResult` (single-step → flat data, multi-step → keyed by step id).

3. **Self-fetch arbitrary data.** Use `useToolQuery` (root import) against a
   `*_data` feed; it decodes with `parseToolResult` (structured-first).

**Dual-mode (recommended for cockpit widgets):** write one component that takes
host-pushed `data` when handed it and self-fetches otherwise, via `useViewData`:

```tsx
import { useViewData } from "@miragon/mcp-toolkit-ui/hooks"

function IncidentPanel({
  data: pushed,
  processKey,
}: {
  data: Incident | null
  processKey?: string
}) {
  const { data, loading, error } = useViewData(
    pushed, // host-pushed data (verbatim if present)
    ["incident", processKey], // cache key (siblings dedupe)
    "camunda7_incident_data", // tool to fetch when no pushed data
    { processKey }, // args
    Boolean(processKey), // ready: only fetch when the key is present
  )
  if (loading) return <Skeleton className="h-24 w-full" />
  // … render from data
}
```

If you decode a raw result yourself, always go through `parseToolResult` — never
read `content[0].text` by hand.

## Step 2 — Build the widget with the primitives

Open the [component catalog](../../../docs/reference/components.md) and compose.
Quality rules:

- **No `<div>` wüste.** Compose from the slim composed layer: `Card` /
  `CardHeader` / `CardContent`, `GridLayout` + `GridItem`, `KpiGrid` / `KpiCell`,
  `Table`, `WidgetHeader`, `SectionHeading`, `GroupCard`, `FilterBar` /
  `FilterChip`, `DrillButton`, `ListFooter`, the pills (`LivePill` / `CountPill`),
  and the tone utilities (`ToneVariant` / `TONE_*`) — they carry the design tokens
  (spacing, focus rings, dark mode). `TasksBoard` is built entirely from these.
- **Use theme tokens, never hard-coded colors.** Class names like `text-primary`,
  `text-muted-foreground`, `bg-card`, `bg-destructive/10`, and `rounded-lg` (which
  reads `--radius`) resolve to the active theme's CSS variables — so the widget
  inherits the client's white-label theme and light/dark automatically. A
  hard-coded `#hex`, `bg-blue-600`, or `rounded-[10px]` breaks white-labeling: it
  ignores the brand a `ThemeProvider` sets. Merge conditional classes with
  `cn(...)`. See the [white-labeling guide](../../../docs/guides/white-labeling.md)
  and the playground's brand switcher.
- **Metrics → `KpiGrid`** (a row of headline cells; set a cell `tone`/`onClick`).
  **Tabular data → `Table`** (+ `ListFooter` for pagination). **Filtering →
  `FilterBar` + `useDebouncedValue`.** **Loading → `Skeleton`.** **Status colour →
  the tone system** (`ToneVariant` + `LivePill`/`CountPill`/`TONE_*`).
- **Pre-format** numbers/currency for the locale before passing them in.

Sketch (mirrors `OrderStatusCard`'s structure):

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  KpiGrid,
  Skeleton,
} from "@miragon/mcp-toolkit-ui"

function OrderCard({ data }: { data: Order | null }) {
  if (!data) return <Skeleton className="h-40 w-full" />
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {data.id}
          <Badge variant={data.status === "cancelled" ? "destructive" : "default"}>
            {data.status}
          </Badge>
        </CardTitle>
        <CardDescription>{data.customer}</CardDescription>
      </CardHeader>
      <CardContent>
        <KpiGrid
          cells={[
            { label: "Total", value: `${data.total} ${data.currency}` },
            { label: "Items", value: data.items },
            { label: "ETA", value: data.eta },
          ]}
        />
      </CardContent>
    </Card>
  )
}
```

## Step 3 — Write it host-portable

Touch the host **only** through `useHostBridge()` — never `mcp-use/react`,
`window.openai`, or raw `window.open` directly. That single seam lets the same
widget run in the mcp-use host, ChatGPT (Apps SDK), and standalone against any
MCP server. From `OrderStatusCard`:

```tsx
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import { parseToolResult } from "@miragon/mcp-toolkit-ui"

const bridge = useHostBridge()
const seeded = bridge.getWidgetData<Order>() // host-pushed data, no flash
const res = await bridge.callTool("get_order", { id }) // call a tool
const order = parseToolResult<Order>(res)
bridge.openExternal(order.trackingUrl) // open a link out of the frame
bridge.sendFollowup(`Is order ${order.id} late? (use get_order)`) // hand a prompt to the agent
bridge.setModelContext?.(`Viewing order ${order.id}`) // optional: what the model sees next turn
```

For named affordances (navigate to another widget, ask the agent), use
`useHostActions()` + `buildShowWidgetIntent(toolName, description)`. To run a
widget under a non-default host, wrap it in `<HostBridgeProvider bridge={…}>`
with `createChatGptHostBridge` / `createStandaloneHostBridge`.

If your tool calls are read/write data fetches rather than imperative bridge
calls, prefer the hooks from Step 1 (`useToolQuery` / `useToolMutation` /
`useViewData`) — they wrap the bridge and give you caching + loading/error state.

## Step 4 — Iterate in isolation (the prompt → see → loop)

Develop the widget in the **widget-playground** with fixture data and a mocked
host — no backend, no real host. This is where you actually see your prompt take
shape.

1. Add a `Story` to
   [`examples/widget-playground/stories.ts`](../../../examples/widget-playground/stories.ts):

   ```ts
   {
     id: "order-card",
     label: "OrderCard",
     description: "Order summary card; self-fetches get_order.",
     widget: OrderCard,
     data: { "orders:order": { id: "ORD-1", status: "shipped" } },
     // adaptDataWidget components: pass the step dataType so the adapter resolves data
     // dataType: "orders:order",
     tools: {
       // static value or (args) => result handler; unknown tools reject into the widget's error state
       get_order: (args) => ({ id: args.id, status: "shipped" }),
     },
   }
   ```

2. Run it and iterate live:

   ```bash
   pnpm --filter @miragon/mcp-toolkit-examples run dev:widget-playground
   ```

   The JSON editor re-renders on change; the **Model context** panel shows the
   `<ModelContext>` string the widget reports; the **Host activity** panel logs
   every `callTool` / `openExternal` / `sendFollowup`.

Under the hood, each story renders inside `WidgetFixtureHost` (from
`@miragon/mcp-toolkit-ui/app`), which installs a `window.openai` shim and an
`AppQueryProvider` so both the mcp-use bridge and `useToolQuery` resolve against
the same in-memory fixture registry. See
[`examples/widget-playground/README.md`](../../../examples/widget-playground/README.md).

For a unit test, render through `WidgetFixtureHost` directly, or build the props
envelope with `buildFixtureWidgetProps(data, dataType?)`.

## Step 5 — Verify

```bash
cd /tmp/mcp-toolkit   # or the repo root
pnpm --filter @miragon/mcp-toolkit-ui run typecheck   # widget + toolkit types
pnpm --filter @miragon/mcp-toolkit-examples run dev:widget-playground  # see it render
```

Before committing, the repo's full gates must be green:

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r lint
```

House rules that apply to widget code (see `CONTRIBUTING.md` / `CLAUDE.md`):

- **ESM with `.js` import extensions**, even for `.ts`/`.tsx` sources.
- The toolkit **root barrel stays `mcp-use/react`-free** — import host/app
  symbols (`useHostBridge`, `adaptDataWidget`, `McpToolkitApp`, `WidgetFixtureHost`)
  from `@miragon/mcp-toolkit-ui/app`, view hooks from `@miragon/mcp-toolkit-ui/hooks`.
- React rendering/widget glue is **not** required to have unit tests, but pure
  data helpers you add (formatters, mappers) **are** — colocate `foo.ts` →
  `foo.test.ts` with Vitest.

## Checklist

- [ ] Picked the widget shape (`{ data }` vs `{ keys }`) and the data path (Step 0/1).
- [ ] Composed from the catalog's primitives/composed components — no `<div>` wüste, tokens not raw colors.
- [ ] Host access only via `useHostBridge` / the data hooks — no direct `mcp-use/react` or `window.openai`.
- [ ] Loading (`Skeleton`), empty, and error states handled.
- [ ] A `Story` added to the playground and the widget seen rendering.
- [ ] `typecheck` green; repo gates green before commit.
