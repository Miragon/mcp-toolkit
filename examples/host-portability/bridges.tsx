import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  HostBridgeProvider,
  createChatGptHostBridge,
  createMcpUseHostBridge,
  createStandaloneHostBridge,
  type HostBridge,
  type OpenAiAppsSdk,
} from "@miragon/mcp-toolkit-ui/app"
import { AppQueryProvider } from "@miragon/mcp-toolkit-ui"
import { callFakeTool, seedOrder } from "./fake-server.js"
import { OrderStatusCard } from "./OrderStatusCard.js"

/** A single bridge call surfaced to the activity log. */
export type BridgeCall =
  | { kind: "callTool"; name: string; args: Record<string, unknown> }
  | { kind: "sendFollowup"; prompt: string }
  | { kind: "openExternal"; url: string }
  | { kind: "setModelContext"; text: string }

export type LogFn = (call: BridgeCall) => void

/** The three host runtimes the same widget is mounted under. */
export type BridgeId = "mcp-use" | "chatgpt" | "standalone"

export interface BridgeOption {
  id: BridgeId
  label: string
  blurb: string
}

export const BRIDGE_OPTIONS: BridgeOption[] = [
  {
    id: "mcp-use",
    label: "mcp-use host",
    blurb: "The toolkit's own host. createMcpUseHostBridge() reads a window.openai shim.",
  },
  {
    id: "chatgpt",
    label: "ChatGPT (Apps SDK)",
    blurb: "createChatGptHostBridge() over a stubbed window.openai (OpenAI Apps SDK).",
  },
  {
    id: "standalone",
    label: "Standalone web app",
    blurb: "createStandaloneHostBridge() with an injected callTool — no toolkit host.",
  },
]

const theme = "light" as const

/**
 * Build the OpenAI Apps SDK shim (`window.openai`) the ChatGPT and mcp-use
 * bridges read from. Routes `callTool` to the fake server and reports every
 * action to `log`. This is a *stub* of the real host object — exactly the
 * surface {@link createChatGptHostBridge} and `mcp-use`'s `useWidget` probe.
 */
function buildOpenAiStub(log: LogFn, orderId: string): OpenAiAppsSdk & Record<string, unknown> {
  return {
    theme,
    // mcp-use's useWidget reads these host-context globals; harmless defaults.
    displayMode: "inline",
    locale: "en-US",
    maxHeight: 4096,
    userAgent: { device: { type: "desktop" }, capabilities: { hover: true, touch: false } },
    safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    toolInput: { id: orderId },
    toolOutput: seedOrder(orderId),
    toolResponseMetadata: null,
    widgetState: null,
    callTool: async (name: string, args: Record<string, unknown>) => {
      log({ kind: "callTool", name, args })
      return callFakeTool(name, args)
    },
    sendFollowUpMessage: (arg: { prompt: string } | string) => {
      log({ kind: "sendFollowup", prompt: typeof arg === "string" ? arg : arg.prompt })
      return Promise.resolve()
    },
    openExternal: (payload: { href: string } | string) => {
      log({ kind: "openExternal", url: typeof payload === "string" ? payload : payload.href })
    },
    requestDisplayMode: (a: { mode: string }) => Promise.resolve({ mode: a.mode }),
    setWidgetState: (state: Record<string, unknown>) => {
      // mcp-use flushes an empty model context on mount; only surface the
      // meaningful (non-empty) writes the widget actually makes.
      const ctx = state["__model_context"]
      if (typeof ctx === "string" && ctx.length > 0) log({ kind: "setModelContext", text: ctx })
      return Promise.resolve()
    },
    notifyIntrinsicHeight: () => Promise.resolve(),
  }
}

/**
 * mcp-use host stage. Installs a `window.openai` shim so `mcp-use`'s `useWidget`
 * (inside {@link createMcpUseHostBridge}) selects the Apps-SDK provider, then
 * renders the *real* mcp-use adapter — the same path a widget takes in the
 * toolkit's production host. Inner component because `createMcpUseHostBridge`
 * is a hook and must run under the installed shim.
 */
function McpUseStage({ log, orderId }: { log: LogFn; orderId: string }): ReactNode {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const prev = (window as { openai?: unknown }).openai
    const stub = buildOpenAiStub(log, orderId)
    ;(window as { openai?: unknown }).openai = stub
    window.dispatchEvent(new CustomEvent("openai:set_globals", { detail: { globals: stub } }))
    setReady(true)
    return () => {
      ;(window as { openai?: unknown }).openai = prev
    }
  }, [log, orderId])

  if (!ready) return null
  return <McpUseInner orderId={orderId} />
}

function McpUseInner({ orderId }: { orderId: string }): ReactNode {
  // The real adapter, reading the installed window.openai shim via mcp-use.
  const bridge = createMcpUseHostBridge()
  return (
    <HostBridgeProvider bridge={bridge}>
      <OrderStatusCard orderId={orderId} />
    </HostBridgeProvider>
  )
}

/**
 * Render the demo widget under the selected host bridge. Each branch wraps the
 * *same* {@link OrderStatusCard} — the whole point of the example — in a
 * different adapter, and every bridge routes its actions to `log`.
 */
export function BridgeStage({
  bridgeId,
  orderId,
  log,
}: {
  bridgeId: BridgeId
  orderId: string
  log: LogFn
}): ReactNode {
  const explicitBridge = useMemo<HostBridge | null>(() => {
    if (bridgeId === "chatgpt") {
      // Pass the stub explicitly so the adapter doesn't depend on a global.
      return createChatGptHostBridge(buildOpenAiStub(log, orderId))
    }
    if (bridgeId === "standalone") {
      return createStandaloneHostBridge({
        callTool: (name, args) => {
          log({ kind: "callTool", name, args })
          return callFakeTool(name, args)
        },
        // A standalone app has no host-pushed data — the widget fetches via
        // callTool on mount. (Set getData here to pre-seed instead.)
        onFollowup: (prompt) => log({ kind: "sendFollowup", prompt }),
        onOpenExternal: (url) => {
          log({ kind: "openExternal", url })
          window.open(url, "_blank", "noopener")
        },
        onModelContext: (text) => log({ kind: "setModelContext", text }),
        theme,
      })
    }
    return null
  }, [bridgeId, orderId, log])

  // mcp-use needs the shim installed first — handled by its own stage.
  if (bridgeId === "mcp-use") {
    return (
      <AppQueryProvider>
        <McpUseStage log={log} orderId={orderId} />
      </AppQueryProvider>
    )
  }

  if (!explicitBridge) return null
  return (
    <AppQueryProvider>
      <HostBridgeProvider bridge={explicitBridge}>
        <OrderStatusCard orderId={orderId} />
      </HostBridgeProvider>
    </AppQueryProvider>
  )
}
