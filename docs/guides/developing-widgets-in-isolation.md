# Developing widgets in isolation

::: tip The standard loop is the mcp-use CLI
Day-to-day widget development runs through `mcp-use dev` and its built-in
inspector — real server, HMR on the widget sources; see
[getting started](../getting-started.md). This guide covers the **optional
fixture harness** for the cases the real server won't easily produce: edge
states (empty lists, errors, huge data), the theme/brand matrix, and work
without any server at all.
:::

Hand-built widgets are where the design quality lives, so they deserve a tight
feedback loop. `WidgetFixtureHost` is a "Storybook for MCP widgets": it renders a
single widget with fixture data and a mocked host, so you can build and polish it
without booting a real MCP host or backend.

The runnable version is
[`examples/widget-playground/`](../../examples/widget-playground/):

```sh
pnpm --filter @miragon/mcp-toolkit-examples run dev:widget-playground
```

## What the harness mocks

`WidgetFixtureHost` (from `@miragon/mcp-toolkit-ui/app`) stands in for the host so
a widget renders exactly as it would in production, minus the infrastructure:

- **`callTool`** is served from an in-memory `FixtureCallToolRegistry`, wired
  into the simulated `HostBridge` and the toolkit's `useToolQuery` — so a
  widget that self-fetches resolves against your fixtures.
- **Host actions** (`openExternal`, `sendFollowUpMessage`, …) are logged to
  `onHostAction` instead of dispatched.
- **The `<ModelContext>` string** the widget reports is captured and surfaced
  through `onModelContext`, so you can _see_ what the model would see.
- **A `HostBridge`** (a `createStandaloneHostBridge` over the same registry) is
  provided, so widgets written against `useHostBridge` are simulated from the same
  single source — see [host portability](../concepts/host-portability.md).

It is intentionally minimal — a harness, not a host. The Apps-SDK `postMessage`
bridge and host features beyond the bridge verbs are out of scope.

## Mounting a widget

```tsx
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { OrderCard } from "./OrderCard.js"
;<WidgetFixtureHost
  widget={OrderCard}
  // Shaped however the widget reads it. Widgets reading keys["ns:thing"]
  // pass the keys map; raw ({ data }) widgets get the same object as `data`.
  data={{ "orders:order": { id: "ORD-4471", status: "shipped" } }}
  // For widgets that self-fetch via useToolQuery, register the tool fixtures:
  tools={{ "orders_get-order": (args) => ({ id: args.id, status: "shipped" }) }}
  // For adaptDataWidget components, also pass the step dataType:
  // dataType="orders:order"
  onHostAction={(a) => console.log(a)}
  onModelContext={(text) => console.log(text)}
/>
```

A `tools` entry is either a **static value** returned as the tool result, or a
**handler** `(args) => result` that reacts to the widget's input. An unknown tool
rejects with a descriptive error that flows into the widget's own error state
(TanStack Query `error`, `mcp-use` `isError`) rather than crashing the harness —
so you exercise the failure path too.

## The playground workflow

[`examples/widget-playground/`](../../examples/widget-playground/) wraps the
harness in a small Vite app:

- **Sidebar** — pick a widget from [`stories.ts`](../../examples/widget-playground/stories.ts).
- **Fixture data** — a live JSON editor for the `data` / `keys`. Typing
  re-renders the preview; invalid JSON is reported and the last valid data stays
  on screen.
- **Live preview** — the widget rendered through `WidgetFixtureHost`.
- **Model context** — the serialized `<ModelContext>` the widget reports.
- **Host activity** — the tool calls and host actions it triggered.

Add a widget by appending a `Story` to `stories.ts`:

```ts
{
  id: "order-card",
  label: "OrderCard",
  description: "An order's status and line items.",
  widget: OrderCard,
  data: { "orders:order": { /* … */ } },
  tools: { "orders_get-order": (args) => ({ id: args.id }) },
}
```

## Keep widgets fixture-friendly

The harness is most useful when widgets are pure functions of their input. A
widget that reads `keys["ns:thing"]` or takes a single `data` prop (via
[`adaptDataWidget`](../concepts/widgets.md#per-instance-props)) is trivial to fix
in fixtures; one that reaches into ambient host state is not. This is the same
property that makes the [data-widget layer](../concepts/layered-adoption.md#b-data-widgets-adaptdatawidget-in-a-host)
testable, so the fixture workflow and the layered-adoption story reinforce each
other.

## See also

- [Host portability](../concepts/host-portability.md) — the bridge the harness
  simulates.
- [Widgets](../concepts/widgets.md) — the `WidgetProps` shape the harness builds.
- Source: [`packages/ui/src/app/widget-fixture.tsx`](../../packages/ui/src/app/widget-fixture.tsx).
