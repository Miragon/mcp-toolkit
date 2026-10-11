import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import {
  HostBridgeProvider,
  createChatGptHostBridge,
  createStandaloneHostBridge,
  toHostBridge,
  type HostBridge,
  type McpUseWidgetSurface,
  type OpenAiAppsSdk,
} from "@miragon/mcp-toolkit-ui/app"
import { AppQueryProvider, LocaleProvider, ThemeProvider } from "@miragon/mcp-toolkit-ui"
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
    blurb: "createStandaloneHostBridge() with an injected callTool, no toolkit host.",
  },
]

/** The host's colour scheme, as a host reports it to the widget (`bridge.theme`). */
export type HostTheme = "light" | "dark"

/** What the page's switches tell every simulated host about itself. */
export interface HostSettings {
  theme: HostTheme
  /** The host's locale (BCP 47), e.g. `"de-DE"`. */
  locale: string
}

/** Reads the host's current settings (the page's switches) when a bridge asks. */
type CurrentHost = () => HostSettings

/**
 * Let `bridge.theme` report the host's current colour scheme. The factories
 * copy the theme once, at build time; a getter keeps the bridge itself when
 * the scheme changes. A new bridge would re-run the card's fetch effect and
 * log `get_order` calls nobody made: a real host keeps its bridge too.
 */
function withCurrentTheme(bridge: HostBridge, host: CurrentHost): HostBridge {
  return Object.defineProperty(bridge, "theme", { get: () => host().theme, enumerable: true })
}

/**
 * Build the OpenAI Apps SDK stub (`window.openai` shape) the ChatGPT bridge
 * reads from. Routes `callTool` to the fake server and reports every action to
 * `log`. This is a *stub* of the real host object — exactly the surface
 * {@link createChatGptHostBridge} probes. Theme and locale are getters, as
 * the host's globals change under a bridge that stays.
 */
function buildOpenAiStub(
  log: LogFn,
  orderId: string,
  host: CurrentHost,
): OpenAiAppsSdk & Record<string, unknown> {
  return {
    get theme() {
      return host().theme
    },
    get locale() {
      return host().locale
    },
    // Host-context globals a real Apps-SDK host exposes; harmless defaults.
    displayMode: "inline",
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
function buildMcpUseSurfaceBridge(log: LogFn, orderId: string, host: CurrentHost): HostBridge {
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
    // No `theme` here: `toHostBridge` would copy it once; `withCurrentTheme`
    // reports the current one instead.
    setState: (state) => {
      const ctx = state["__model_context"]
      if (typeof ctx === "string" && ctx.length > 0) log({ kind: "setModelContext", text: ctx })
      return Promise.resolve()
    },
  }
  return withCurrentTheme(toHostBridge(surface), host)
}

/**
 * Render the demo widget under the selected host bridge. Each branch wraps the
 * *same* {@link OrderStatusCard} (the whole point of the example) in a
 * different adapter, and every bridge routes its actions to `log`. The host's
 * theme and locale apply the way a real host applies them: the colour scheme
 * to the widget's scope (and `bridge.theme`), the locale through a
 * `LocaleProvider`, so the card looks and reads the same under every bridge.
 *
 * The bridge is built once per host and order. The switches reach it through
 * a ref, so changing the language or the colour scheme re-renders the card
 * under the same bridge instead of re-running its fetch.
 */
export function BridgeStage({
  bridgeId,
  orderId,
  log,
  host,
}: {
  bridgeId: BridgeId
  orderId: string
  log: LogFn
  host: HostSettings
}): ReactNode {
  const { theme, locale } = host
  const hostRef = useRef(host)
  useLayoutEffect(() => {
    hostRef.current = host
  }, [host])
  const explicitBridge = useMemo<HostBridge | null>(() => {
    const current: CurrentHost = () => hostRef.current
    if (bridgeId === "mcp-use") {
      return buildMcpUseSurfaceBridge(log, orderId, current)
    }
    if (bridgeId === "chatgpt") {
      // Pass the stub explicitly so the adapter doesn't depend on a global.
      const bridge = createChatGptHostBridge(buildOpenAiStub(log, orderId, current))
      return withCurrentTheme(bridge, current)
    }
    if (bridgeId === "standalone") {
      const bridge = createStandaloneHostBridge({
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
      })
      return withCurrentTheme(bridge, current)
    }
    return null
  }, [bridgeId, orderId, log])

  if (!explicitBridge) return null
  return (
    <ThemeProvider mode={theme} className="bg-background flex justify-center p-3 sm:p-5">
      <LocaleProvider locale={locale}>
        <AppQueryProvider>
          <HostBridgeProvider bridge={explicitBridge}>
            <OrderStatusCard orderId={orderId} />
          </HostBridgeProvider>
        </AppQueryProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}
