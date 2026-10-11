import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  useDynamicTool,
  useHostContext,
  useOpenExternal,
  useSendFollowUp,
  useToolContext,
  useViewTheme,
} from "mcp-use/react"
import { HostBridgeProvider, toHostBridge, type HostBridge } from "./host-bridge.js"
import {
  McpUseViewContext,
  ModelContextChannelContext,
  ModelContextLines,
  modelContextLine,
  withModelContextLine,
  type ModelContextChannel,
} from "./model-context.js"

type DynamicCallTool = (name: string, args: Record<string, unknown>) => Promise<unknown>
type BoundCall = (args: Record<string, unknown>) => Promise<unknown>

/**
 * Mounts one `useDynamicTool` handle and hands its stable `callTool` up to the
 * pool. This rendered indirection exists because mcp-use 2.x has no public
 * "call any tool by name" API — `useDynamicTool(name)` is fixed per hook
 * instance, so a generic `(name, args)` caller needs one mounted hook per
 * distinct name.
 */
function ToolBinder({
  name,
  onBind,
}: {
  name: string
  onBind: (name: string, call: BoundCall) => void
}): null {
  const { callTool } = useDynamicTool<Record<string, unknown>, unknown>(name)
  useEffect(() => {
    onBind(name, callTool)
  }, [name, callTool, onBind])
  return null
}

/**
 * A generic `(name, args)` tool caller over mcp-use 2.x's per-name hooks.
 *
 * The first call for a given name mounts a {@link ToolBinder} (one render
 * tick) and resolves once its handle is bound; later calls hit the bound
 * handle directly. Binders accumulate for the mount's lifetime — tool names in
 * a view are a small closed set. Calls left waiting when the view unmounts
 * never settle, which is moot because their callers unmounted with it.
 */
function useDynamicToolPool(): { callTool: DynamicCallTool; binders: ReactNode } {
  const [names, setNames] = useState<readonly string[]>([])
  const boundRef = useRef(new Map<string, BoundCall>())
  const waitersRef = useRef(new Map<string, ((call: BoundCall) => void)[]>())

  const onBind = useCallback((name: string, call: BoundCall) => {
    boundRef.current.set(name, call)
    const waiters = waitersRef.current.get(name)
    if (!waiters) return
    waitersRef.current.delete(name)
    for (const resolve of waiters) resolve(call)
  }, [])

  const callTool = useCallback<DynamicCallTool>((name, args) => {
    const bound = boundRef.current.get(name)
    if (bound) return bound(args)
    const pending = new Promise<BoundCall>((resolve) => {
      const waiters = waitersRef.current.get(name) ?? []
      waiters.push(resolve)
      waitersRef.current.set(name, waiters)
    })
    setNames((prev) => (prev.includes(name) ? prev : [...prev, name]))
    return pending.then((call) => call(args))
  }, [])

  const binders = useMemo(
    () => names.map((name) => <ToolBinder key={name} name={name} onBind={onBind} />),
    [names, onBind],
  )

  return { callTool, binders }
}

/** The line of the bridge's own `setModelContext` (last writer wins). */
const BRIDGE_LINE = "host-bridge"

/**
 * Where the view reports the payload it shows (the host's, a stripped-result
 * recovery's, the user's retry or refresh), so `HostBridge.getWidgetData()`
 * returns what the view shows (toolkit#176 K15): the bridge, not one
 * component's local state, holds the view's data.
 */
const ViewResultSinkContext = createContext<((payload: unknown) => void) | null>(null)

/**
 * The sink for the payload a view shows, or `null` outside a
 * {@link McpUseHostBridgeProvider}. `McpAppView` reports through it.
 */
export function useViewResultSink(): ((payload: unknown) => void) | null {
  return useContext(ViewResultSinkContext)
}

/**
 * What `getWidgetData()` returns: the payload the view reported it shows,
 * else the rendering tool's output once the call latched `"ready"`.
 */
function bridgeOutput(shown: unknown, tool: { status: string; toolOutput?: unknown }): unknown {
  if (shown !== undefined) return shown
  return tool.status === "ready" ? tool.toolOutput : undefined
}

/**
 * Install the `mcp-use` {@link HostBridge} (plus the view-scope flag) for a
 * subtree inside an mcp-use 2.x view.
 *
 * Composes the 2.x view hooks into the `McpUseWidgetSurface` shape and maps it
 * through {@link toHostBridge}, so the fail-soft bridge contract widgets rely
 * on is exactly the pinned one:
 *
 * - `callTool` — the dynamic-tool pool above; resolves with the raw
 *   `CallToolResult` envelope, rejects on tool errors.
 * - `sendFollowup` / `openExternal` — `useSendFollowUp` / `useOpenExternal`;
 *   while the bridge is not connected (local `file://` preview), `openExternal`
 *   throws into `toHostBridge`'s documented `window.open` fallback.
 * - `setModelContext` — one line of the view's model-context tree (an mcp-use
 *   `ModelContext` node beside the ones `HostModelContext` and
 *   `useHostModelContext` register), which hosts receive via
 *   `ui/update-model-context` (ext-apps) or `widgetState` (ChatGPT). The
 *   provider does not seed mcp-use's view state, so a widget's own
 *   `useViewState(default)` keeps its default (N29).
 * - `getWidgetData` — the payload the view reports it shows
 *   ({@link useViewResultSink}): the host's, or the one it got by re-running
 *   the tool when the host stripped it or kept back an unusable one. Without
 *   a report, the rendering tool's `structuredContent` once ready.
 *
 * Must render inside a `bootstrapView`-mounted tree (the mcp-use hooks throw
 * otherwise) — `McpToolkitApp` does this for the standard bundle; use it
 * directly only when composing a custom shell under `bootstrapView`.
 */
export function McpUseHostBridgeProvider({ children }: { children: ReactNode }): ReactNode {
  const { callTool, binders } = useDynamicToolPool()
  const sendFollowUp = useSendFollowUp()
  const openExternal = useOpenExternal()
  const tool = useToolContext()
  const theme = useViewTheme()
  const { isAvailable } = useHostContext()
  const [lines, setLines] = useState<ReadonlyMap<string, string>>(() => new Map())
  const channel = useMemo<ModelContextChannel>(
    () => ({ set: (id, content) => setLines((prev) => withModelContextLine(prev, id, content)) }),
    [],
  )
  // The payload the view reports it shows wins: after a latch the view could
  // not render (`structuredContent: null` latches "ready"), the host's own
  // output is not what the user sees.
  const [shown, setShown] = useState<unknown>(undefined)

  const output = bridgeOutput(shown, tool)

  const bridge = useMemo<HostBridge>(
    () =>
      toHostBridge({
        callTool,
        sendFollowUpMessage: (prompt) => sendFollowUp({ prompt }),
        openExternal: (url) => {
          // Not connected (e.g. the bundle opened straight in a browser):
          // throw synchronously so toHostBridge's window.open fallback fires.
          if (!isAvailable) throw new Error("mcp-use view bridge is not connected")
          void openExternal({ url }).catch((err: unknown) => {
            console.warn("[host-bridge] openExternal failed:", err)
          })
        },
        output,
        theme,
        // toHostBridge writes model context as `{ __model_context }`: it
        // becomes the bridge's line of the one channel, never view state.
        setState: (state) => {
          const text = state.__model_context
          if (typeof text === "string") channel.set(BRIDGE_LINE, modelContextLine(text))
          return Promise.resolve()
        },
      }),
    [callTool, sendFollowUp, openExternal, output, theme, isAvailable, channel],
  )

  return (
    <McpUseViewContext.Provider value={true}>
      {binders}
      <ModelContextLines lines={lines} />
      <ModelContextChannelContext.Provider value={channel}>
        <ViewResultSinkContext.Provider value={setShown}>
          <HostBridgeProvider bridge={bridge}>{children}</HostBridgeProvider>
        </ViewResultSinkContext.Provider>
      </ModelContextChannelContext.Provider>
    </McpUseViewContext.Provider>
  )
}
