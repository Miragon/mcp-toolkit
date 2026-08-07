import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useWidget } from "mcp-use/react"

/**
 * The host capabilities a hand-built widget needs, abstracted away from any one
 * host runtime. A `HostBridge` is the single seam a portable widget talks to:
 * write the widget against {@link useHostBridge} and it runs unchanged in our
 * own `mcp-use` host, inside ChatGPT (OpenAI Apps SDK), or as a standalone web
 * app driven directly by a `@modelcontextprotocol/sdk` client — only the
 * surrounding adapter changes.
 *
 * This is deliberately the *minimum* a deterministic UI needs, not a mirror of
 * any host's full surface. Each adapter maps these verbs onto its host and
 * fails soft where the host cannot honour them (see the per-factory docs).
 */
export interface HostBridge {
  /**
   * Invoke an MCP tool on the connected server and resolve with its raw
   * response (typically `{ structuredContent, content, … }`). Callers decode it
   * with `parseToolResult`. Rejects if the call fails so a widget's own error
   * state (TanStack Query, try/catch) can surface it.
   */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>
  /**
   * Hand a natural-language prompt back to the conversation to drive a new model
   * turn (navigate to another widget, ask the agent to analyse something). In
   * hosts without a conversation (standalone web app) this is a no-op unless an
   * `onFollowup` handler is supplied.
   */
  sendFollowup(prompt: string): void
  /**
   * Ask the host to open a URL outside the (often sandboxed) widget frame.
   * Falls back to `window.open` only where no host bridge mediates links.
   */
  openExternal(url: string): void
  /**
   * The structured data this widget was rendered with, if the host pushed any
   * (the tool result's `structuredContent` / `toolOutput`). Returns `null` when
   * the host delivers data another way (e.g. props) or has none.
   */
  getWidgetData<T>(): T | null
  /**
   * Persist a short text the model should see on the next turn (selection,
   * filter, current view). Optional: not every host exposes model context, and
   * a standalone web app has no model at all — callers must guard its absence.
   */
  setModelContext?(text: string): void
  /** The host's colour-scheme preference, when it reports one. */
  theme?: "light" | "dark"
}

const HostBridgeContext = createContext<HostBridge | null>(null)

/**
 * Provide an explicit {@link HostBridge} to a subtree. Wrap a portable widget in
 * the adapter for the host it is running in — {@link createChatGptHostBridge},
 * {@link createStandaloneHostBridge}, or {@link createMcpUseHostBridge} — and
 * every `useHostBridge()` below resolves to it.
 *
 * Omitting the provider is supported: {@link useHostBridge} (and, for backward
 * compatibility, `useHostActions`) then fall back to the `mcp-use`/react default
 * bridge so existing widgets keep working without any wrapping.
 */
export function HostBridgeProvider({
  bridge,
  children,
}: {
  bridge: HostBridge
  children: ReactNode
}): ReactNode {
  return <HostBridgeContext.Provider value={bridge}>{children}</HostBridgeContext.Provider>
}

/**
 * Read the explicit {@link HostBridge} from context, or `null` if no
 * {@link HostBridgeProvider} is present. Adapters that want to *fall back* to the
 * default `mcp-use` bridge (rather than throw) use this instead of
 * {@link useHostBridge}.
 */
export function useHostBridgeOrNull(): HostBridge | null {
  return useContext(HostBridgeContext)
}

/**
 * The {@link HostBridge} for the current subtree. Resolution order:
 *
 * 1. An explicit bridge from the nearest {@link HostBridgeProvider}.
 * 2. The default `mcp-use`/react bridge ({@link createMcpUseHostBridge}), so a
 *    widget mounted in our own host needs no provider.
 *
 * The `mcp-use` hooks the default bridge wraps must run under an `mcp-use`
 * provider/host context; outside one (e.g. a bare unit test render) wrap the
 * widget in a `HostBridgeProvider` with a {@link createStandaloneHostBridge}
 * instead. This hook never returns `null`: a portable widget can always assume a
 * bridge exists.
 */
export function useHostBridge(): HostBridge {
  const explicit = useContext(HostBridgeContext)
  // Always call the default-bridge hook (Rules of Hooks): it's cheap and only
  // *used* when no explicit bridge is provided. The mcp-use hooks underneath are
  // host-context readers, safe to call even when their result goes unused.
  const fallback = useMcpUseHostBridge()
  return explicit ?? fallback
}

/**
 * Build a {@link HostBridge} backed by `mcp-use`/react — the default for widgets
 * running in the toolkit's own host. Wraps `useWidget()` (host actions,
 * `toolOutput`, `theme`) and `useCallTool` so it preserves exactly the behaviour
 * widgets had before the bridge abstraction:
 *
 * - `openExternal` routes through the host's `openExternal` and falls back to
 *   `window.open` when no host bridge is wired (local dev preview) — mirroring
 *   the original `useHostActions.openLink`.
 * - `sendFollowup` routes through `sendFollowUpMessage` and swallows rejections
 *   with a `console.warn`, as `useHostActions` did.
 *
 * Must be called inside an `mcp-use` host context (it calls `mcp-use` hooks).
 * Use {@link createMcpUseHostBridge} for the standalone factory variant.
 */
export function useMcpUseHostBridge(): HostBridge {
  const { callTool, sendFollowUpMessage, openExternal, output, theme, setState } = useWidget()

  return useMemo<HostBridge>(
    () => toHostBridge({ callTool, sendFollowUpMessage, openExternal, output, theme, setState }),
    [callTool, sendFollowUpMessage, openExternal, output, theme, setState],
  )
}

/**
 * Exactly the slice of `mcp-use`'s widget surface {@link toHostBridge} reads —
 * declared structurally rather than imported from `mcp-use/react`.
 *
 * That indirection is the point: the mapping below is the behaviour widgets
 * depend on, and pinning it against a local interface keeps it testable without
 * a host, a DOM, or a React renderer. It also localises upstream churn — when
 * the shape moves, this interface and {@link useMcpUseHostBridge} are what
 * change, and {@link toHostBridge}'s tests still prove the bridge contract
 * widgets see is unchanged.
 */
export interface McpUseWidgetSurface {
  /** Invoke a tool on the connected server. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /** Hand a prompt back to the conversation. Rejects are swallowed by the mapping. */
  sendFollowUpMessage: (prompt: string) => Promise<unknown>
  /** Open a URL outside the widget frame. Throws when no host mediates links. */
  openExternal: (url: string) => void
  /** The tool output the host rendered this widget with, when it pushed one. */
  output?: unknown
  /** The host's reported colour scheme, in whatever spelling it uses. */
  theme?: unknown
  /** Persist widget state; the model-context write rides on this. */
  setState: (state: Record<string, unknown>) => Promise<unknown>
}

/**
 * Map `mcp-use`'s widget surface onto the host-agnostic {@link HostBridge}.
 *
 * Pure and separately exported so the fail-soft behaviour is pinned by tests:
 * every verb here has a documented failure mode that widgets rely on, and none
 * of them may start throwing into widget render paths.
 */
export function toHostBridge(widget: McpUseWidgetSurface): HostBridge {
  const { callTool, sendFollowUpMessage, openExternal, output, theme, setState } = widget
  return {
    callTool: (name, args) => callTool(name, args),
    sendFollowup: (prompt) => {
      void sendFollowUpMessage(prompt).catch((err: unknown) => {
        console.warn("[host-bridge] sendFollowUpMessage failed:", err)
      })
    },
    openExternal: (url) => {
      try {
        openExternal(url)
      } catch {
        // No host bridge (local dev preview) — fall back to window.open.
        if (typeof window !== "undefined") window.open(url, "_blank", "noopener")
      }
    },
    getWidgetData: <T,>() => (output as T | null) ?? null,
    setModelContext: (text) => {
      void setState({ __model_context: text }).catch((err: unknown) => {
        console.warn("[host-bridge] setState (model context) failed:", err)
      })
    },
    theme: theme === "dark" ? "dark" : "light",
  }
}

/**
 * Factory form of {@link useMcpUseHostBridge} for symmetry with the other
 * adapters. Because the `mcp-use` bridge is hook-driven (it reads live host
 * context), the "factory" is really the hook itself — call it from a component.
 *
 * @example
 * function MyWidget() {
 *   const bridge = createMcpUseHostBridge() // === useMcpUseHostBridge()
 *   // …or rely on useHostBridge()'s default and skip the provider entirely.
 * }
 */
export const createMcpUseHostBridge = useMcpUseHostBridge

/**
 * Minimal structural view of the OpenAI Apps SDK `window.openai` object this
 * adapter reads. Every field is optional: the real SDK shape varies across
 * versions and host builds, so the adapter probes each method/field defensively
 * and degrades to a no-op (with a `console.warn`) rather than assuming presence.
 *
 * Assumptions documented here (verify against the Apps SDK you target):
 * - `callTool(name, args)` resolves with the tool response. Required for tool
 *   calls; without it `callTool` rejects with a clear error.
 * - `sendFollowUpMessage` is called with `{ prompt }` (older builds) — we also
 *   accept a bare-string signature and try both shapes.
 * - `openExternal` is called with `{ href }`.
 * - `toolOutput` (preferred) or `toolResponseMetadata` carries the structured
 *   widget data; `setWidgetState(state)` persists model-visible state.
 * - `theme` is `"light"` | `"dark"`.
 */
export interface OpenAiAppsSdk {
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>
  sendFollowUpMessage?: (arg: { prompt: string } | string) => unknown
  sendFollowupMessage?: (arg: { prompt: string } | string) => unknown
  openExternal?: (payload: { href: string } | string) => unknown
  toolOutput?: unknown
  toolResponseMetadata?: unknown
  setWidgetState?: (state: Record<string, unknown>) => unknown
  theme?: unknown
}

/**
 * Resolve the `window.openai` object, or `null` outside a browser / when the SDK
 * is absent. Pulled out so the no-SDK fallback path is unit-testable by passing
 * an explicit object (or `null`).
 */
function resolveOpenAi(explicit?: OpenAiAppsSdk | null): OpenAiAppsSdk | null {
  if (explicit !== undefined) return explicit
  if (typeof window === "undefined") return null
  const candidate: unknown = (window as { openai?: unknown }).openai
  return candidate && typeof candidate === "object" ? candidate : null
}

/**
 * Build a {@link HostBridge} for the OpenAI Apps SDK (ChatGPT). Reads the host's
 * `window.openai` object and maps the bridge verbs onto it **defensively** —
 * every method is probed before use, and a missing one degrades to a logged
 * no-op (or, for `callTool`, a rejected promise) instead of crashing the widget.
 * This is what lets the *same* hand-built widget run in ChatGPT with no code
 * change, even across Apps SDK versions whose surface drifts.
 *
 * Pass an explicit `sdk` to test the guards without a real `window.openai`
 * (passing `null` exercises the fully-absent path). See {@link OpenAiAppsSdk}
 * for the documented assumptions about the SDK shape.
 */
export function createChatGptHostBridge(sdk?: OpenAiAppsSdk | null): HostBridge {
  const openai = resolveOpenAi(sdk)

  return {
    callTool: (name, args) => {
      if (typeof openai?.callTool !== "function") {
        console.warn("[host-bridge] window.openai.callTool unavailable — cannot call", name)
        return Promise.reject(
          new Error(
            `[host-bridge] OpenAI Apps SDK callTool is unavailable; cannot invoke "${name}".`,
          ),
        )
      }
      return Promise.resolve(openai.callTool(name, args))
    },
    sendFollowup: (prompt) => {
      const fn = openai?.sendFollowUpMessage ?? openai?.sendFollowupMessage
      if (typeof fn !== "function") {
        console.warn("[host-bridge] window.openai.sendFollowUpMessage unavailable — no-op")
        return
      }
      try {
        // Newer builds take `{ prompt }`; try that first, then a bare string.
        const result: unknown = fn({ prompt })
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            console.warn("[host-bridge] sendFollowUpMessage rejected:", err)
          })
        }
      } catch {
        try {
          fn(prompt)
        } catch (err) {
          console.warn("[host-bridge] sendFollowUpMessage failed:", err)
        }
      }
    },
    openExternal: (url) => {
      if (typeof openai?.openExternal === "function") {
        try {
          openai.openExternal({ href: url })
          return
        } catch (err) {
          console.warn("[host-bridge] window.openai.openExternal failed:", err)
        }
      }
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener")
    },
    getWidgetData: <T,>() => {
      const data = openai?.toolOutput ?? openai?.toolResponseMetadata
      return (data as T | null) ?? null
    },
    setModelContext: (text) => {
      if (typeof openai?.setWidgetState !== "function") {
        console.warn("[host-bridge] window.openai.setWidgetState unavailable — model context no-op")
        return
      }
      try {
        openai.setWidgetState({ __model_context: text })
      } catch (err) {
        console.warn("[host-bridge] setWidgetState failed:", err)
      }
    },
    theme: openai?.theme === "dark" ? "dark" : openai?.theme === "light" ? "light" : undefined,
  }
}

/** Options for {@link createStandaloneHostBridge}. */
export interface StandaloneHostBridgeOptions {
  /**
   * The only required capability: how to call a tool on the server. In a
   * standalone web app this typically wraps a `@modelcontextprotocol/sdk`
   * `Client.callTool({ name, arguments })`, but any function with this shape
   * works — that injection is the whole point: hand-built widgets render
   * against *any* existing MCP server without the toolkit's host runtime.
   */
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /**
   * Supply the structured data a widget reads via `getWidgetData()`. A static
   * value, or a getter `() => value` that is re-read on each call (so the data
   * can change without rebuilding the bridge). Any function is treated as a
   * getter — widget data is never itself a function. Optional: many standalone
   * widgets fetch everything through `callTool` instead.
   */
  getData?: unknown
  /**
   * Handle a `sendFollowup` prompt. A standalone app has no conversation, so
   * this is where you wire "ask the model" to your own chat UI, a toast, or a
   * logger. Omit to make `sendFollowup` a logged no-op.
   */
  onFollowup?: (prompt: string) => void
  /**
   * Handle `openExternal`. Defaults to `window.open(url, "_blank")` when omitted
   * (a standalone app is not sandboxed, so that is safe).
   */
  onOpenExternal?: (url: string) => void
  /** Handle `setModelContext`. Omit to make it a logged no-op. */
  onModelContext?: (text: string) => void
  /** Static theme to report to widgets. */
  theme?: "light" | "dark"
}

/**
 * Build a {@link HostBridge} for a standalone web app driven against an existing
 * MCP server — no toolkit host, no `createFrameworkApp`. You inject `callTool`
 * (usually a thin wrapper over a `@modelcontextprotocol/sdk` client); the
 * conversation-shaped verbs (`sendFollowup`, `setModelContext`) are no-ops
 * unless you wire handlers, and `openExternal` defaults to `window.open`.
 *
 * This is the decoupling layer that turns the toolkit's hand-built widgets into
 * a reusable UI kit for *any* MCP server: render `<HostBridgeProvider bridge=…>`
 * once at the app root and every portable widget below works. The widget fixture
 * harness also builds on this factory so host simulation has a single source.
 *
 * @example
 * const client = new Client(…) // @modelcontextprotocol/sdk
 * const bridge = createStandaloneHostBridge({
 *   callTool: (name, args) => client.callTool({ name, arguments: args }),
 *   getData: () => currentRecord,
 * })
 */
export function createStandaloneHostBridge(options: StandaloneHostBridgeOptions): HostBridge {
  const { callTool, getData, onFollowup, onOpenExternal, onModelContext, theme } = options
  return {
    callTool: (name, args) => callTool(name, args),
    sendFollowup: (prompt) => {
      if (onFollowup) {
        onFollowup(prompt)
        return
      }
      console.warn("[host-bridge] standalone bridge has no onFollowup handler — prompt dropped")
    },
    openExternal: (url) => {
      if (onOpenExternal) {
        onOpenExternal(url)
        return
      }
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener")
    },
    getWidgetData: <T,>() => {
      const data = typeof getData === "function" ? (getData as () => unknown)() : getData
      return (data as T | null) ?? null
    },
    setModelContext: (text) => {
      if (onModelContext) {
        onModelContext(text)
        return
      }
      console.warn(
        "[host-bridge] standalone bridge has no onModelContext handler — context dropped",
      )
    },
    theme,
  }
}
