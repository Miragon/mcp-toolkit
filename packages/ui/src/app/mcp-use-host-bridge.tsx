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
  useViewState,
  useViewTheme,
} from "mcp-use/react"
import { HostBridgeProvider, toHostBridge, type HostBridge } from "./host-bridge.js"

/**
 * `true` inside an mcp-use 2.x view — i.e. under a
 * {@link McpUseHostBridgeProvider}, which itself only renders under a
 * `bootstrapView`-mounted tree. Components that want to use `mcp-use/react`
 * primitives (which throw outside a view) branch on this instead of probing
 * mcp-use internals; see `adaptDataWidget`'s ModelContext handling.
 */
const McpUseViewContext = createContext(false)

/** Whether the subtree runs inside an mcp-use view (see {@link McpUseViewContext}). */
export function useIsInsideMcpUseView(): boolean {
  return useContext(McpUseViewContext)
}

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
 * - `setModelContext` — writes `{ __model_context }` into the view state,
 *   which hosts receive via `ui/update-model-context` (ext-apps) or
 *   `widgetState` (ChatGPT). The key is a toolkit-owned convention since 2.x.
 * - `getWidgetData` — the rendering tool's `structuredContent` once ready.
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
  const [, setViewState] = useViewState<Record<string, unknown>>({})

  const output = tool.status === "ready" ? tool.toolOutput : undefined

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
        setState: (state) => {
          setViewState((prev) => ({ ...prev, ...state }))
          return Promise.resolve()
        },
      }),
    [callTool, sendFollowUp, openExternal, output, theme, isAvailable, setViewState],
  )

  return (
    <McpUseViewContext.Provider value={true}>
      {binders}
      <HostBridgeProvider bridge={bridge}>{children}</HostBridgeProvider>
    </McpUseViewContext.Provider>
  )
}
