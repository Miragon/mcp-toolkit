import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react"
import { useWidget } from "mcp-use/react"
import type { PipelineContext, StepResult, WidgetProps } from "@miragon/mcp-toolkit-core"
import { AppQueryProvider } from "../providers/query-provider.js"
import { HostBridgeProvider, createStandaloneHostBridge } from "./host-bridge.js"

/**
 * Key `mcp-use` writes the serialized model-context string under when it flushes
 * to `window.openai.setWidgetState`. Mirrors `MODEL_CONTEXT_KEY` in
 * `mcp-use/react` (not exported, so duplicated here). The harness intercepts
 * `setWidgetState` and reads this field to surface what the model would see.
 */
const MODEL_CONTEXT_KEY = "__model_context"

/**
 * Minimal shape of a tool-call response the harness hands back to widgets.
 * Mirrors `mcp-use`'s `CallToolResponse` closely enough that both the toolkit's
 * `parseToolResult` (structured-first) and `mcp-use`'s `useCallTool`
 * (`result`/`content` text) can decode a fixture result without a real host.
 *
 * A fixture entry may also be a bare value: the registry wraps it into this
 * envelope under `structuredContent`, which is what `parseToolResult` reads
 * first — so a fixture can be written as just the data the widget expects.
 */
export interface FixtureToolResult {
  structuredContent?: unknown
  content?: { type: string; text?: string }[]
  isError?: boolean
  _meta?: Record<string, unknown>
}

/**
 * A handler fixture: invoked with the call args, may return a value or a
 * promise (the registry `await`s it either way).
 */
export type FixtureToolHandler = (args: Record<string, unknown>) => unknown

/**
 * A fixture for one tool: either a static result returned verbatim, or a
 * {@link FixtureToolHandler} invoked with the call args. Handlers let a fixture
 * react to the widget's input — e.g. echo back a filtered list. Any registered
 * function is treated as a handler (so a fixture cannot itself *be* the data
 * `Function`, which is never JSON tool output anyway).
 */
export type FixtureToolEntry = unknown

/**
 * Pure, host-free registry of fake tool implementations. Drives every
 * `callTool` path the harness exposes (`window.openai.callTool`, the toolkit's
 * `AppQueryProvider` bridge). Kept free of React/DOM so its semantics are unit
 * testable in a plain Node environment.
 *
 * Resolution rules:
 * - A registered **function** entry is called with `args` and its return value
 *   (awaited) is wrapped into a {@link FixtureToolResult}.
 * - A registered **value** entry is returned as-is when it already looks like a
 *   tool response (has `structuredContent`/`content`), otherwise wrapped under
 *   `structuredContent` so widgets that read structured data Just Work.
 * - An **unknown** tool rejects with a descriptive error. This is the
 *   error-friendly path: the rejection flows into the widget's own error state
 *   (TanStack Query `error`, `mcp-use` `isError`) instead of crashing the
 *   harness, and the message names the missing tool so the gap is obvious.
 */
export class FixtureCallToolRegistry {
  private readonly entries = new Map<string, FixtureToolEntry>()

  constructor(initial?: Record<string, FixtureToolEntry>) {
    if (initial) {
      for (const [name, entry] of Object.entries(initial)) this.register(name, entry)
    }
  }

  /** Register (or overwrite) the fixture for a tool name. */
  register(name: string, resultOrHandler: FixtureToolEntry): this {
    this.entries.set(name, resultOrHandler)
    return this
  }

  /** True if a fixture is registered for `name`. */
  has(name: string): boolean {
    return this.entries.has(name)
  }

  /** Registered tool names, for diagnostics / the harness log. */
  names(): string[] {
    return [...this.entries.keys()]
  }

  /**
   * Resolve a tool call against the registered fixtures. Always returns a
   * promise so callers can `await` uniformly regardless of whether the fixture
   * was a static value or an async handler.
   */
  async call(name: string, args: Record<string, unknown> = {}): Promise<FixtureToolResult> {
    if (!this.entries.has(name)) {
      throw new Error(
        `[widget-fixture] No fixture registered for tool "${name}". ` +
          `Registered: ${this.names().length ? this.names().join(", ") : "(none)"}.`,
      )
    }
    const entry = this.entries.get(name)
    const raw = typeof entry === "function" ? await (entry as FixtureToolHandler)(args) : entry
    return toToolResult(raw)
  }
}

/**
 * Wrap an arbitrary fixture value into a {@link FixtureToolResult}. Values that
 * already carry `structuredContent` or `content` are passed through untouched
 * so a fixture can opt into the full envelope; everything else is placed under
 * `structuredContent` (the field `parseToolResult` reads first) and mirrored
 * into a `content` text block so `mcp-use`'s text-oriented decoder also sees it.
 */
function toToolResult(raw: unknown): FixtureToolResult {
  if (raw != null && typeof raw === "object" && ("structuredContent" in raw || "content" in raw)) {
    return raw as FixtureToolResult
  }
  return {
    structuredContent: raw,
    content: [{ type: "text", text: typeof raw === "string" ? raw : JSON.stringify(raw) }],
  }
}

/**
 * A host action a widget asked the host to perform, surfaced to the harness so
 * it can render an activity log. Mirrors the `mcp-use` bridge verbs that
 * {@link useHostActions} and `useWidget` route through `window.openai`.
 */
export type HostActionLog =
  | { type: "callTool"; name: string; args: Record<string, unknown> }
  | { type: "sendFollowUpMessage"; prompt: string }
  | { type: "openExternal"; href: string }
  | { type: "requestDisplayMode"; mode: string }
  | { type: "setWidgetState"; state: Record<string, unknown> }

interface FixtureHostValue {
  registry: FixtureCallToolRegistry
}

const FixtureHostContext = createContext<FixtureHostValue | null>(null)

/**
 * Access the active fixture registry from inside a {@link WidgetFixtureHost}.
 * Returns `null` outside a harness — callers should treat that as "no fixture
 * host present" rather than an error.
 */
export function useFixtureHost(): FixtureHostValue | null {
  return useContext(FixtureHostContext)
}

/**
 * Default host-context globals a widget sees in the harness. Chosen to be
 * harmless and inert: inline display, light theme, desktop, no safe-area
 * insets. Overridable per-mount via {@link WidgetFixtureHostProps.globals}.
 */
const DEFAULT_GLOBALS = {
  theme: "light",
  displayMode: "inline",
  locale: "en-US",
  maxHeight: 4096,
  safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  userAgent: {
    device: { type: "desktop" },
    capabilities: { hover: true, touch: false },
  },
} as const

/**
 * Build the `window.openai` shim the `mcp-use` React hooks read from. Routes
 * `callTool` through the fixture registry and reports every other bridge verb
 * to `onHostAction`. Returns `null` outside a browser-like environment (SSR)
 * so the harness degrades to a plain render rather than throwing.
 */
function buildOpenAiShim(
  registry: FixtureCallToolRegistry,
  toolOutput: Record<string, unknown> | null,
  toolInput: Record<string, unknown>,
  globals: Record<string, unknown>,
  onHostAction?: (action: HostActionLog) => void,
  onModelContext?: (text: string) => void,
): Record<string, unknown> | null {
  if (typeof window === "undefined") return null
  return {
    ...DEFAULT_GLOBALS,
    ...globals,
    toolInput,
    toolOutput,
    toolResponseMetadata: null,
    widgetState: null,
    callTool: async (name: string, args: Record<string, unknown>) => {
      onHostAction?.({ type: "callTool", name, args })
      return registry.call(name, args)
    },
    sendFollowUpMessage: (args: { prompt: string }) => {
      onHostAction?.({ type: "sendFollowUpMessage", prompt: args.prompt })
      return Promise.resolve()
    },
    openExternal: (payload: { href: string }) => {
      onHostAction?.({ type: "openExternal", href: payload.href })
    },
    requestDisplayMode: (args: { mode: string }) => {
      onHostAction?.({ type: "requestDisplayMode", mode: args.mode })
      return Promise.resolve({ mode: args.mode })
    },
    setWidgetState: (state: Record<string, unknown>) => {
      onHostAction?.({ type: "setWidgetState", state })
      // `mcp-use` flushes the serialized `<ModelContext>` tree through
      // setWidgetState under MODEL_CONTEXT_KEY — surface it as the model view.
      const ctx = state?.[MODEL_CONTEXT_KEY]
      if (typeof ctx === "string") onModelContext?.(ctx)
      return Promise.resolve()
    },
    notifyIntrinsicHeight: () => Promise.resolve(),
  }
}

/**
 * Renders nothing but mounts a `useWidget()` so `mcp-use` registers its
 * model-context flush handler — even for widgets that never call `useWidget`
 * themselves (e.g. a simple `({ keys })` card). Without this, a widget's
 * `<ModelContext>` would render but never flush, and `onModelContext` would
 * stay silent. The flush routes through our `setWidgetState` shim above.
 */
function ModelContextPump(): null {
  useWidget()
  return null
}

/**
 * Either an `adaptDataWidget`-style component (receives {@link WidgetProps}) or
 * a "raw" single-data component (`({ data }) | ({ keys })`). The harness builds
 * a `WidgetProps` envelope from the fixture and spreads it so both shapes work
 * without the author declaring which they wrote.
 */
export type FixtureWidget = ComponentType<WidgetProps> | ComponentType<Record<string, unknown>>

export interface WidgetFixtureHostProps {
  /** The widget component under development. */
  widget: FixtureWidget
  /**
   * Fixture data for the widget. Shaped however the widget reads it:
   * - widgets reading `keys["ns:thing"]` (the common pattern) → pass the keys map
   * - `adaptDataWidget` components → also pass {@link WidgetFixtureHostProps.dataType}
   *   so the harness seeds a matching pipeline step the adapter can find
   * - raw `({ data })` widgets → the same object is forwarded as `data`
   */
  data?: Record<string, unknown>
  /**
   * `dataType` to register the fixture step under, for `adaptDataWidget`
   * components (which look up the step whose `_dataType` matches). When set,
   * `data` is placed in `context.steps[<id>].data` so the adapter resolves it.
   */
  dataType?: string
  /**
   * Tool fixtures keyed by tool name. Each value is a static result or a
   * handler — see {@link FixtureToolEntry}. Drives both `mcp-use`'s
   * `useCallTool` and the toolkit's `useToolQuery`.
   */
  tools?: Record<string, FixtureToolEntry>
  /**
   * Host context globals to override (theme, displayMode, locale, …). Merged
   * over {@link DEFAULT_GLOBALS}.
   */
  globals?: Record<string, unknown>
  /**
   * Called with the serialized model-context string the widget reports via
   * `<ModelContext>` / `modelContext.set`. This is exactly what the model would
   * see in a real host — surfacing it in the harness is the didactic point.
   */
  onModelContext?: (text: string) => void
  /** Called for every host action the widget triggers (tool call, link, …). */
  onHostAction?: (action: HostActionLog) => void
}

/**
 * Build the `WidgetProps` envelope the harness passes to the widget. Seeds a
 * single pipeline step from `data` (keyed by `dataType` when given) and uses
 * `data` as the `keys` map, so widgets that read `keys[...]` and adapted
 * widgets that scan `context.steps` are both satisfied from one fixture.
 *
 * Exported for unit testing the envelope shape without rendering React.
 */
export function buildFixtureWidgetProps(
  data: Record<string, unknown>,
  dataType?: string,
): WidgetProps {
  const steps: Record<string, StepResult> = {}
  if (dataType) {
    steps.fixture = {
      _app: "fixture",
      _step: "fixture",
      _dataType: dataType,
      data,
      keys: data,
    }
  }
  const context: PipelineContext = { steps, keys: data, errors: [] }
  return { keys: data, context }
}

/**
 * Storybook-style harness for MCP widgets. Renders a single widget with fixture
 * data and a mocked host environment so it can be developed in isolation —
 * without booting a real MCP host or backend.
 *
 * ### What it mocks
 * - **`window.openai`** — the `mcp-use` Apps-SDK bridge `useWidget`/`useCallTool`
 *   read from. Installed on mount, removed on unmount. `callTool` is routed to a
 *   {@link FixtureCallToolRegistry} built from `tools`; `sendFollowUpMessage`,
 *   `openExternal`, etc. are reported to `onHostAction`.
 * - **The toolkit `AppQueryProvider`** — so widgets that fetch via `useToolQuery`
 *   (e.g. generated `use*` hooks) resolve against the same registry.
 * - **`ModelContext`** — a flush handler captures the serialized context string
 *   and forwards it to `onModelContext`, so you can *see* what the model would.
 * - **A {@link HostBridge}** — a `createStandaloneHostBridge` over the same
 *   registry and callbacks, provided via `HostBridgeProvider`, so widgets
 *   written against `useHostBridge` (the host-portable pattern) are simulated
 *   from the same single source as the `window.openai` shim above.
 *
 * ### Boundaries
 * `mcp-use`'s hooks select their provider from `window.openai` presence; this
 * harness deliberately drives the Apps-SDK path (sets `window.openai`) rather
 * than the `postMessage` bridge, which only activates inside a cross-origin
 * iframe. The shim is intentionally minimal — it is not a host, and host
 * features beyond the bridge verbs above are out of scope.
 */
export function WidgetFixtureHost({
  widget: Widget,
  data = {},
  dataType,
  tools,
  globals,
  onModelContext,
  onHostAction,
}: WidgetFixtureHostProps): ReactNode {
  // One registry per `tools` identity. Rebuilt when the fixture map changes so
  // edits in the playground take effect without a full remount.
  const registry = useMemo(() => new FixtureCallToolRegistry(tools), [tools])

  // Latest callbacks without re-installing the shim on every render. Updated in
  // an effect (not during render) so the shim's closures always see the newest
  // handler while the `window.openai` install effect stays stable.
  const onHostActionRef = useRef(onHostAction)
  const onModelContextRef = useRef(onModelContext)
  useEffect(() => {
    onHostActionRef.current = onHostAction
    onModelContextRef.current = onModelContext
  })

  const widgetProps = useMemo(() => buildFixtureWidgetProps(data, dataType), [data, dataType])

  // Install the `window.openai` shim for the lifetime of this mount. Wake any
  // already-mounted `mcp-use` hooks via the `set_globals` event they listen for.
  useEffect(() => {
    if (typeof window === "undefined") return
    const shim = buildOpenAiShim(
      registry,
      data ?? null,
      data ?? {},
      globals ?? {},
      (action) => onHostActionRef.current?.(action),
      (text) => onModelContextRef.current?.(text),
    )
    if (!shim) return
    const prev = (window as { openai?: unknown }).openai
    ;(window as { openai?: unknown }).openai = shim
    window.dispatchEvent(new CustomEvent("openai:set_globals", { detail: { globals: shim } }))
    return () => {
      ;(window as { openai?: unknown }).openai = prev
    }
  }, [registry, data, globals])

  const callTool = useMemo(
    () => async (name: string, args: object) =>
      registry.call(name, (args as Record<string, unknown>) ?? {}),
    [registry],
  )

  // A standalone host bridge over the same registry + callbacks, so portable
  // widgets written against `useHostBridge` (rather than the `mcp-use` host
  // hooks) are simulated from the *same* source as the `window.openai` shim.
  // It logs through the same `HostActionLog` channel, so the playground's
  // activity log shows tool calls, follow-ups, and links identically whether the
  // widget uses the mcp-use path or the host bridge. Reading globals.theme keeps
  // the bridge's reported theme in sync with the shim. Depends on the callback
  // props directly (not the refs) — a fresh Provider value on callback change is
  // fine for a dev harness, and keeps the bridge's closures pure of ref reads.
  const bridgeTheme = (globals?.theme ?? DEFAULT_GLOBALS.theme) === "dark" ? "dark" : "light"
  const bridge = useMemo(
    () =>
      createStandaloneHostBridge({
        callTool: (name, args) => {
          onHostAction?.({ type: "callTool", name, args })
          return registry.call(name, args)
        },
        getData: () => data ?? null,
        onFollowup: (prompt) => onHostAction?.({ type: "sendFollowUpMessage", prompt }),
        onOpenExternal: (href) => onHostAction?.({ type: "openExternal", href }),
        onModelContext: (text) => onModelContext?.(text),
        theme: bridgeTheme,
      }),
    [registry, data, bridgeTheme, onHostAction, onModelContext],
  )

  const value = useMemo<FixtureHostValue>(() => ({ registry }), [registry])

  // Mount the model-context pump only on the client. The pump calls `mcp-use`'s
  // `useWidget`, whose `useSyncExternalStore` lacks a server snapshot and throws
  // under `react-dom/server` — gating it keeps the harness (and any widget
  // rendered through it) SSR-safe. `useSyncExternalStore` with a `false` server
  // snapshot is the idiomatic "are we on the client?" check (no setState-in-effect).
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  // Spread `widgetProps` (keys/context) AND a `data` alias so both adapted
  // widgets and raw `({ data })` widgets read their fixture from one mount.
  const RenderWidget = Widget as ComponentType<Record<string, unknown>>

  return (
    <FixtureHostContext.Provider value={value}>
      {isClient && <ModelContextPump />}
      <HostBridgeProvider bridge={bridge}>
        <AppQueryProvider callTool={callTool}>
          <RenderWidget {...widgetProps} data={data} />
        </AppQueryProvider>
      </HostBridgeProvider>
    </FixtureHostContext.Provider>
  )
}
