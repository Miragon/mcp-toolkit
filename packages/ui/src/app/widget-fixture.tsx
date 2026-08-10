import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react"
import type { PipelineContext, StepResult, WidgetProps } from "@miragon/mcp-toolkit-core"
import { AppQueryProvider } from "../providers/query-provider.js"
import { HostBridgeProvider, createStandaloneHostBridge } from "./host-bridge.js"

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
 * it can render an activity log. The `HostBridge` verbs (`callTool`,
 * `sendFollowup`, `openExternal`) fire in the harness; `requestDisplayMode` /
 * `setWidgetState` remain in the union for log-renderer compatibility but no
 * longer fire — they belonged to the 1.x `window.openai` shim this harness
 * used to install.
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
 * Default host-context values the harness reports. Only `theme` is read since
 * the mcp-use 2.x move (the other host globals were consumed by the 1.x
 * `window.openai` shim); the object keeps its shape so existing playground
 * setups that spread overrides keep compiling.
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
   * handler — see {@link FixtureToolEntry}. Drives the simulated
   * `HostBridge.callTool` and the toolkit's `useToolQuery`.
   */
  tools?: Record<string, FixtureToolEntry>
  /**
   * Host context overrides, merged over {@link DEFAULT_GLOBALS}. Since the
   * mcp-use 2.x move only `theme` influences the simulated host; the other
   * keys are accepted for compatibility with existing playground setups.
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
 * - **A {@link HostBridge}** — a `createStandaloneHostBridge` over the fixture
 *   registry and callbacks, provided via `HostBridgeProvider`. `callTool`
 *   resolves against the {@link FixtureCallToolRegistry} built from `tools`;
 *   `sendFollowup` / `openExternal` are reported to `onHostAction`;
 *   `setModelContext` feeds `onModelContext`, so you can *see* what the model
 *   would (adapted widgets report through this bridge outside a real view).
 * - **The toolkit `AppQueryProvider`** — so widgets that fetch via `useToolQuery`
 *   (e.g. generated `use*` hooks) resolve against the same registry.
 *
 * ### Boundaries
 * The harness simulates the **host-portable pattern** (`useHostBridge`,
 * `useToolQuery`) — the surface the toolkit's skills teach. It does not
 * simulate the mcp-use 2.x view runtime: since 2.x the `mcp-use/react` hooks
 * only run under a `bootstrapView`-mounted view speaking the ext-apps
 * postMessage protocol (the 1.x `window.openai` shim this harness used to
 * install has no equivalent seam). A widget that calls `mcp-use/react` hooks
 * directly must be exercised against a real host — or rewritten against
 * `useHostBridge`, which is the portable contract anyway.
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

  const widgetProps = useMemo(() => buildFixtureWidgetProps(data, dataType), [data, dataType])

  const callTool = useMemo(
    () => async (name: string, args: object) =>
      registry.call(name, (args as Record<string, unknown>) ?? {}),
    [registry],
  )

  // The standalone host bridge is the harness's single simulation source: it
  // logs every verb through the `HostActionLog` channel for the playground's
  // activity log. Depends on the callback props directly — a fresh Provider
  // value on callback change is fine for a dev harness. Only `globals.theme`
  // still influences the simulated host (the remaining globals fed the 1.x
  // `window.openai` shim).
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

  // Spread `widgetProps` (keys/context) AND a `data` alias so both adapted
  // widgets and raw `({ data })` widgets read their fixture from one mount.
  const RenderWidget = Widget as ComponentType<Record<string, unknown>>

  return (
    <FixtureHostContext.Provider value={value}>
      <HostBridgeProvider bridge={bridge}>
        <AppQueryProvider callTool={callTool}>
          <RenderWidget {...widgetProps} data={data} />
        </AppQueryProvider>
      </HostBridgeProvider>
    </FixtureHostContext.Provider>
  )
}
