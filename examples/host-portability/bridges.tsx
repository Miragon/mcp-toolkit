import { useMemo, type ReactNode } from "react"
import {
  HostBridgeProvider,
  createChatGptHostBridge,
  createStandaloneHostBridge,
  toHostBridge,
  type HostBridge,
  type McpUseWidgetSurface,
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
    blurb:
      "The toolkit's own host: toHostBridge() over a stubbed 2.x view surface " +
      "(in production, McpUseHostBridgeProvider feeds it the real view hooks).",
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
 * Build the OpenAI Apps SDK stub (`window.openai` shape) the ChatGPT bridge
 * reads from. Routes `callTool` to the fake server and reports every action to
 * `log`. This is a *stub* of the real host object — exactly the surface
 * {@link createChatGptHostBridge} probes.
 */
function buildOpenAiStub(log: LogFn, orderId: string): OpenAiAppsSdk & Record<string, unknown> {
  return {
    theme,
    // Host-context globals a real Apps-SDK host exposes; harmless defaults.
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
      // Only surface meaningful (non-empty) model-context writes.
      const ctx = state["__model_context"]
      if (typeof ctx === "string" && ctx.length > 0) log({ kind: "setModelContext", text: ctx })
      return Promise.resolve()
    },
    notifyIntrinsicHeight: () => Promise.resolve(),
  }
}

/**
 * Build the mcp-use bridge from a stubbed 2.x view surface. In the toolkit's
 * production host, `McpUseHostBridgeProvider` composes the real
 * `mcp-use/react` view hooks into this same {@link McpUseWidgetSurface} shape;
 * those hooks only run inside a `bootstrapView`-mounted iframe, so this demo
 * page stubs the surface and runs it through the *real* mapping —
 * {@link toHostBridge} — which is the adapter code widgets actually depend on.
 */
function buildMcpUseSurfaceBridge(log: LogFn, orderId: string): HostBridge {
  const surface: McpUseWidgetSurface = {
    callTool: (name, args) => {
      log({ kind: "callTool", name, args })
      return callFakeTool(name, args)
    },
    sendFollowUpMessage: (prompt) => {
      log({ kind: "sendFollowup", prompt })
      return Promise.resolve()
    },
    openExternal: (url) => {
      log({ kind: "openExternal", url })
    },
    output: seedOrder(orderId),
    theme,
    setState: (state) => {
      const ctx = state["__model_context"]
      if (typeof ctx === "string" && ctx.length > 0) log({ kind: "setModelContext", text: ctx })
      return Promise.resolve()
    },
  }
  return toHostBridge(surface)
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
    if (bridgeId === "mcp-use") {
      return buildMcpUseSurfaceBridge(log, orderId)
    }
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

  if (!explicitBridge) return null
  return (
    <AppQueryProvider>
      <HostBridgeProvider bridge={explicitBridge}>
        <OrderStatusCard orderId={orderId} />
      </HostBridgeProvider>
    </AppQueryProvider>
  )
}
