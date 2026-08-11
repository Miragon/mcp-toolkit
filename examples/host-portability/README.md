# Host portability

One hand-built widget, three hosts. The **same** `OrderStatusCard` renders
unchanged under:

1. the toolkit's own **mcp-use host**,
2. **ChatGPT** (the OpenAI Apps SDK, `window.openai`), and
3. a **standalone web app** driven against an existing MCP server.

The widget only ever talks to `useHostBridge()` — never `mcp-use/react` or
`window.openai` directly — so swapping the host is a one-line change at the app
root, not a rewrite of the widget.

## Run

```bash
pnpm --filter @miragon/mcp-toolkit-examples run dev:host-portability
# build a static bundle:
pnpm --filter @miragon/mcp-toolkit-examples run build:host-portability
```

Switch the host with the tabs, switch the order with the buttons, and watch the
**Bridge activity** log record every `callTool` / `sendFollowup` /
`openExternal` the widget routed through the active bridge.

## The `HostBridge` abstraction

`HostBridge` (from `@miragon/mcp-toolkit-ui/app`) is the minimum host surface a
deterministic UI needs:

```ts
interface HostBridge {
  callTool(name, args): Promise<unknown>
  sendFollowup(prompt: string): void
  openExternal(url: string): void
  getWidgetData<T>(): T | null
  setModelContext?(text: string): void
  theme?: "light" | "dark"
}
```

Three adapters map it onto a host:

| Adapter                                       | Host                   | What it wraps                                                                                                    |
| --------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `McpUseHostBridgeProvider`                    | toolkit's mcp-use host | the mcp-use 2.x view hooks via `toHostBridge` (already included in `McpToolkitApp`; this demo stubs the surface) |
| `createChatGptHostBridge(sdk?)`               | ChatGPT / Apps SDK     | `window.openai`, probed **defensively** — a missing method degrades to a logged no-op, never a crash             |
| `createStandaloneHostBridge({ callTool, … })` | your own web app       | an **injected** `callTool` (e.g. a `@modelcontextprotocol/client` client)                                        |

## How to write a host-portable widget

Write against `useHostBridge()` and nothing host-specific:

```tsx
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import { parseToolResult } from "@miragon/mcp-toolkit-ui"

function MyWidget() {
  const bridge = useHostBridge()
  // Seed from host-pushed data when present (no spinner flash):
  const [data, setData] = useState(() => bridge.getWidgetData<MyData>())

  const refresh = async () => {
    const res = await bridge.callTool("get_thing", { id })
    setData(parseToolResult<MyData>(res))
  }

  return (
    <button onClick={() => bridge.openExternal(data.url)}>Open</button>
    // bridge.sendFollowup("…")  → hand a prompt back to the conversation
    // bridge.setModelContext?("…") → persist what the model should see next
  )
}
```

`useHostBridge()` resolves the nearest `HostBridgeProvider`, or falls back to
the mcp-use bridge — so the widget needs **no** provider in the toolkit's host.
`useHostActions()` (the named `openLink` / `showWidget` / `askAi` affordances)
is a thin facade over the same bridge and honours an explicit provider too, so
existing widgets keep working unchanged.

See [`OrderStatusCard.tsx`](./OrderStatusCard.tsx).

## How to build a standalone UI for an existing server

This is the decoupling layer: hand-built widgets become a reusable UI kit for
**any** MCP server, no `createFrameworkApp` and no toolkit host required.

```tsx
import { Client } from "@modelcontextprotocol/client"
import { HostBridgeProvider, createStandaloneHostBridge } from "@miragon/mcp-toolkit-ui/app"

const client = new Client(/* … */)
const bridge = createStandaloneHostBridge({
  callTool: (name, args) => client.callTool({ name, arguments: args }),
  onOpenExternal: (url) => window.open(url, "_blank"),
  // sendFollowup / setModelContext are no-ops unless you wire them to a chat UI
})

function App() {
  return (
    <HostBridgeProvider bridge={bridge}>
      <MyWidget />
    </HostBridgeProvider>
  )
}
```

Provide the bridge once at the app root and every portable widget below works.
In this example the "server" is an in-memory [`fake-server.ts`](./fake-server.ts);
replace `callTool` with a real client and the same widget renders against a real
server.

## Files

- [`OrderStatusCard.tsx`](./OrderStatusCard.tsx) — the host-portable widget.
- [`bridges.tsx`](./bridges.tsx) — the three adapters and the per-host stage.
- [`fake-server.ts`](./fake-server.ts) — the in-memory MCP server stand-in.
- [`App.tsx`](./App.tsx) — the tab switcher and activity log.
