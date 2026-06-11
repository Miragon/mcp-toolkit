# Host portability

A hand-built widget should not care which host it runs in. The same
`OrderStatusCard` can render inside the toolkit's own `mcp-use` host, inside
ChatGPT (the OpenAI Apps SDK), or inside a standalone web app driven against an
existing MCP server. The seam that makes this possible is the **`HostBridge`** —
the single, minimal host surface a deterministic UI talks to.

Write the widget against `useHostBridge()` and nothing host-specific (never
`mcp-use/react`, never `window.openai`), and swapping the host becomes a one-line
change at the app root instead of a rewrite.

## The bridge

`HostBridge` (from `@miragon/mcp-toolkit-ui/app`) is deliberately the _minimum_ a
UI needs — not a mirror of any one host's full surface:

```ts
interface HostBridge {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>
  sendFollowup(prompt: string): void
  openExternal(url: string): void
  getWidgetData<T>(): T | null
  setModelContext?(text: string): void
  theme?: "light" | "dark"
}
```

- `callTool` invokes an MCP tool and resolves with its raw response; decode it
  with `parseToolResult`. It rejects on failure so the widget's own error state
  (TanStack Query, try/catch) can surface it.
- `getWidgetData` returns host-pushed structured data (the tool result's
  `structuredContent` / `toolOutput`) so a widget can render without a spinner
  flash, or `null` when the host has none.
- `sendFollowup` and `setModelContext` cross the UI→chat boundary; they are
  optional / fail-soft because a standalone app has no conversation or model.

## The three adapters

Each adapter maps the bridge verbs onto one host and fails soft where the host
cannot honour them:

| Factory                                       | Host                   | Wraps                                                                                           |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `createMcpUseHostBridge()`                    | toolkit's mcp-use host | `mcp-use/react`'s `useWidget`. The **default** — `useHostBridge()` falls back to it.            |
| `createChatGptHostBridge(sdk?)`               | ChatGPT / Apps SDK     | `window.openai`, probed **defensively** — a missing method becomes a logged no-op, not a crash. |
| `createStandaloneHostBridge({ callTool, … })` | your own web app       | an **injected** `callTool` (e.g. a `@modelcontextprotocol/sdk` client).                         |

The mcp-use adapter is hook-driven (it reads live host context), so its
"factory" is really `useMcpUseHostBridge`, aliased as `createMcpUseHostBridge`
for symmetry. The ChatGPT adapter probes every `window.openai` method before use
because the Apps SDK surface drifts across versions — the goal is that the _same_
widget keeps working even as that surface changes.

## Writing a host-portable widget

Depend on `useHostBridge()` and the [primitives](./widgets.md), nothing else:

```tsx
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import { parseToolResult } from "@miragon/mcp-toolkit-ui"

function OrderStatusCard() {
  const bridge = useHostBridge()
  // Seed from host-pushed data when present — no spinner flash:
  const [order, setOrder] = useState(() => bridge.getWidgetData<Order>())

  const refresh = async () => {
    const res = await bridge.callTool("get_order", { id })
    setOrder(parseToolResult<Order>(res))
  }
  // bridge.openExternal(url)        → open a link outside the sandbox
  // bridge.sendFollowup("…")        → hand a prompt back to the conversation
  // bridge.setModelContext?.("…")   → persist what the model should see next
}
```

`useHostBridge()` resolves the nearest `HostBridgeProvider`, or falls back to the
mcp-use bridge — so the widget needs **no** provider in the toolkit's host.
`useHostActions()` (the named `openLink` / `showWidget` / `askAi` affordances) is
a thin facade over the same bridge and honours an explicit provider too, so
existing widgets keep working unchanged.

## Building a UI for an existing server (standalone)

This is the decoupling layer: the hand-built widgets become a reusable UI kit for
**any** MCP server — no `createFrameworkApp`, no toolkit host. Inject a
`callTool` and provide the bridge once at the root:

```tsx
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { HostBridgeProvider, createStandaloneHostBridge } from "@miragon/mcp-toolkit-ui/app"

const client = new Client(/* … */)
const bridge = createStandaloneHostBridge({
  callTool: (name, args) => client.callTool({ name, arguments: args }),
  onOpenExternal: (url) => window.open(url, "_blank"),
  // sendFollowup / setModelContext are no-ops unless you wire them to a chat UI.
})

function App() {
  return (
    <HostBridgeProvider bridge={bridge}>
      <OrderStatusCard />
    </HostBridgeProvider>
  )
}
```

The [widget fixture harness](../guides/developing-widgets-in-isolation.md) builds
on the standalone bridge too, so host simulation has a single source of truth.

## See also

- [`examples/host-portability/`](../../examples/host-portability/) — one widget,
  three hosts, with a shared bridge-activity log.
- [Layered adoption](./layered-adoption.md) — where the standalone path sits in
  the bigger picture.
- Source: [`packages/ui/src/app/host-bridge.tsx`](../../packages/ui/src/app/host-bridge.tsx).
