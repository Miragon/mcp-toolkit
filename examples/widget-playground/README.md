# Widget Playground

A "Storybook for MCP widgets" — develop hand-built widgets in isolation with
fixture data, without booting a real MCP host or backend.

Each widget renders inside `WidgetFixtureHost` (from
`@miragon/mcp-toolkit-ui/app`), which mocks the host bridge: `callTool` is
served from in-memory fixtures, host actions (`openExternal`,
`sendFollowUpMessage`, `requestDisplayMode`, `setWidgetState`, …) are logged
instead of dispatched, and the
`<ModelContext>` string the widget reports is surfaced verbatim — so you can
_see_ what the model would see.

## Run

```bash
pnpm --filter @miragon/mcp-toolkit-examples run dev:widget-playground
# build a static bundle:
pnpm --filter @miragon/mcp-toolkit-examples run build:widget-playground
```

## Layout

- **Sidebar** — pick a widget.
- **Fixture data** — a JSON editor for the `data` / `keys` the widget receives.
  Typing re-renders the preview live; invalid JSON is reported and the last
  valid data stays on screen.
- **Live preview** — the widget rendered through `WidgetFixtureHost`.
- **Model context** — the serialized `<ModelContext>` the widget reports.
- **Host activity** — tool calls and host actions the widget triggered.

## Add a widget

Append a `Story` to [`stories.ts`](./stories.ts):

```ts
{
  id: "my-widget",
  label: "MyWidget",
  description: "What it shows.",
  widget: MyWidget,
  data: { "ns:thing": { /* … */ } },
  // For widgets that self-fetch via useToolQuery, register the tool fixtures:
  tools: {
    "ns_get-thing": (args) => ({ id: args.id, name: "…" }),
  },
  // For adaptDataWidget components, also pass the step dataType:
  // dataType: "ns:thing",
}
```

A fixture entry is either a **static value** (returned as the tool result) or a
**handler** `(args) => result` that reacts to the widget's input. Unknown tools
reject with a descriptive error that flows into the widget's own error state.

## How it works

`WidgetFixtureHost` installs a `window.openai` shim for the lifetime of the
mount (the Apps-SDK bridge the `mcp-use/react` hooks read from) and wraps the
widget in the toolkit's `AppQueryProvider`, so both `mcp-use`'s `useCallTool`
and the toolkit's `useToolQuery` resolve against the same fixture registry. It
is intentionally minimal — a harness, not a host.
