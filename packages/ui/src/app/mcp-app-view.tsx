import { useState, useCallback, useMemo, type ReactNode } from "react"
import { LucideProvider } from "lucide-react"
import { ToolCancelledError, useDisplayMode, useHostContext, useToolContext } from "mcp-use/react"
import { ToastProvider, useToast } from "../components/Toast.js"
import { ToolkitLocaleFallback, useToolkitMessages } from "../locale/locale-provider.js"
import type { ViewMessages } from "../locale/toolkit-messages.js"
import { AppQueryProvider, queryClient } from "../providers/query-provider.js"
import {
  resolveRecoveryToolName,
  useToolResultRecovery,
} from "../hooks/use-tool-result-recovery.js"
import { ICON_STROKE } from "../lib/icon-stroke.js"
import { useHostBridge } from "./host-bridge.js"
import {
  applyBuilderCommit,
  fullscreenAvailable,
  isCompleteViewData,
  StepErrors,
  ViewBody,
  ViewToolbar,
  type BuilderCommit,
  type DescribeStep,
  type McpAppViewLabels,
  type ViewData,
  type ViewTitleLevel,
  type ViewTitleMode,
} from "./mcp-app-view-chrome.js"
import { ViewPlaceholder, type DescribeViewError } from "./mcp-app-view-states.js"
import type { LayoutBuilderLabels } from "./layout-builder.js"
import { useRetryFocus, useViewLifecycle } from "./use-view-lifecycle.js"
import { DEFAULT_SLOW_HINT_MS, decodeViewResult } from "./view-lifecycle.js"
import type { WidgetComponent } from "./widget-renderer.js"

export type { McpAppViewLabels, ViewTitleLevel, ViewTitleMode } from "./mcp-app-view-chrome.js"
export type { DescribeStep } from "./mcp-app-view-chrome.js"
export type { DescribeViewError } from "./mcp-app-view-states.js"

export interface McpAppViewProps {
  /**
   * Map of widget ID to React component. The consumer aggregates this from
   * each module's widget exports and passes it in at the bundled `main.tsx`
   * entry point. All widgets are host-bundled — the framework never fetches
   * widget code at render time.
   */
  widgets: Record<string, WidgetComponent>
  /**
   * Name of the MCP tool that the refresh button invokes. Consumers typically
   * register this tool as a thin wrapper around `renderView(...)` from
   * `@miragon/mcp-toolkit-core`. Defaults to `"refresh-view"`.
   */
  refreshToolName?: string
  /**
   * Explicit override for the Build / edit (Pencil) affordance. Leave it
   * `undefined` (the default) to let the shell follow the server's own
   * signal — `render-view` reports `structuredContent.builderAvailable`,
   * derived from `createFrameworkApp`'s `app.builder`, so the button appears
   * only when the `get-builder-catalogue` tool is actually registered. Set it
   * to `true` / `false` only to force the affordance on or off regardless of
   * that signal (e.g. a custom server that registers the catalogue tool by
   * hand). Even when forced on, the LayoutBuilder's catalogue fetch fails
   * soft (no crash) if the tool is absent.
   */
  builderEnabled?: boolean
  /**
   * Override chrome strings (loading, error, refresh, fullscreen, edit, …).
   * Defaults to the active locale's toolkit catalog: the nearest
   * `LocaleProvider`, else the host's locale (`en`/`de`, English otherwise).
   */
  labels?: McpAppViewLabels
  /** Override strings of the embedded view builder (defaults: the locale's catalog). */
  builderLabels?: LayoutBuilderLabels
  /**
   * How the toolbar shows the view title, so a view carries ONE title:
   * `"show"` (default) renders it as a heading, `"hide"` leaves the title to
   * the widget's own header, `"slot"` renders {@link McpAppViewProps.renderTitle}.
   */
  titleMode?: ViewTitleMode
  /** Heading level of the toolbar title in `"show"` mode. Default `2`. */
  titleLevel?: ViewTitleLevel
  /** Renders the toolbar title in `"slot"` mode; receives the view's title. */
  renderTitle?: (title: string | undefined) => ReactNode
  /** Delay before the loading placeholder adds its "taking longer" hint. Default 8000 ms. */
  slowHintAfterMs?: number
  /**
   * Map a raw rendering error (the tool's `isError` text) onto human text.
   * The raw reason always stays available under "Details".
   */
  describeError?: DescribeViewError
  /** Human title of a pipeline step in the failed-steps alert (default: the step id). */
  describeStep?: DescribeStep
}

/**
 * The toolkit's MCP App view: lifecycle placeholder (waiting / error /
 * cancelled), toolbar, failed-steps alert and the rendered layout (or the
 * builder). Mounts a `ToastProvider` and binds the toolkit's own strings to
 * the host's locale unless a `LocaleProvider` sets one, so the chrome follows
 * the host language; `useLocale()` in consumer widgets is unaffected. Lucide
 * icons draw at the CI stroke (2.5) throughout, the toast stack included.
 */
export function McpAppView(props: McpAppViewProps) {
  const { locale } = useHostContext()
  return (
    <ToolkitLocaleFallback locale={locale}>
      {/* Wraps the ToastProvider, whose toast stack renders beside the shell. */}
      <LucideProvider strokeWidth={ICON_STROKE}>
        <ToastProvider>
          <McpAppViewShell {...props} />
        </ToastProvider>
      </LucideProvider>
    </ToolkitLocaleFallback>
  )
}

/**
 * Host-delivered payload → local `viewData`, recovered payloads included.
 * Render-phase setState (not an effect) so the React Compiler doesn't flag a
 * cascading render.
 */
function useHostViewData(
  initialViewData: ViewData | undefined,
  isPending: boolean,
  recovered: ViewData | null,
) {
  const [viewData, setViewData] = useState<ViewData | null>(null)
  // `prev` MUST start as `null`, not `initialViewData`: hosts that expose the
  // complete tool output before the app's first render (e.g. window.openai
  // globals injected ahead of script execution) would otherwise never trip the
  // identity check — the sync never runs and the app idles on the skeleton.
  // The completeness guard stays: widgetProps may briefly drop
  // `context`/`layout` when displayMode toggles.
  const [prevInitial, setPrevInitial] = useState<ViewData | undefined | null>(null)
  if (initialViewData !== prevInitial) {
    setPrevInitial(initialViewData)
    if (!isPending && isCompleteViewData(initialViewData)) setViewData(initialViewData)
  }
  const [prevRecovered, setPrevRecovered] = useState<ViewData | null>(null)
  if (recovered !== prevRecovered) {
    setPrevRecovered(recovered)
    // The host-delivered payload always wins; recovery only fills the gap.
    if (recovered && !viewData) setViewData(recovered)
  }
  return [viewData, setViewData] as const
}

/**
 * Refresh via the refresh tool. A failure keeps the data and says so in a
 * toast in catalog words only; the raw reason goes to the console, never to
 * the user.
 */
function useViewRefresh(options: {
  viewData: ViewData | null
  setViewData: (next: ViewData) => void
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  refreshToolName: string
  labels: Pick<ViewMessages, "refreshFailed" | "refreshFailedHint">
}) {
  const { viewData, setViewData, callTool, refreshToolName, labels } = options
  const toast = useToast()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshView = useCallback(async () => {
    if (!viewData?._refreshParams) return
    setIsRefreshing(true)
    let failure: unknown = null
    try {
      const result = await callTool(
        refreshToolName,
        viewData._refreshParams as unknown as Record<string, unknown>,
      )
      // One decoding convention with `useToolQuery` (structured-first), with a
      // typed outcome: an unusable payload is a failure, never exception text.
      const outcome = decodeViewResult(result, isCompleteViewData)
      if (outcome.ok) setViewData(outcome.data)
      else failure = outcome.reason ?? "the refresh tool returned no view"
      // The call went through, so self-fetching widgets refresh as well;
      // a tool error refreshes nothing.
      if (outcome.ok || !outcome.isError) void queryClient.invalidateQueries()
    } catch (e) {
      failure = e
    } finally {
      setIsRefreshing(false)
    }
    if (failure === null) return
    console.warn("[mcp-toolkit] refresh failed:", failure)
    toast.show({
      tone: "danger",
      title: labels.refreshFailed,
      description: labels.refreshFailedHint,
    })
  }, [callTool, labels, refreshToolName, setViewData, toast, viewData])
  return { isRefreshing, refreshView }
}

/**
 * The fullscreen toggle, gated on the host's offer. A rejected request shows
 * a toast in catalog words; the raw reason goes to the console.
 */
function useFullscreenToggle(
  labels: Pick<ViewMessages, "fullscreenFailed" | "fullscreenFailedHint">,
) {
  const { displayMode, availableDisplayModes, requestDisplayMode } = useDisplayMode()
  const toast = useToast()
  const toggle = useCallback(async () => {
    const mode = displayMode === "fullscreen" ? "inline" : "fullscreen"
    try {
      // Advisory since 2.x: `displayMode` updates when the host applies it.
      await requestDisplayMode({ mode })
    } catch (e) {
      console.warn("[mcp-toolkit] display-mode request failed:", e)
      toast.show({
        tone: "danger",
        title: labels.fullscreenFailed,
        description: labels.fullscreenFailedHint,
      })
    }
  }, [displayMode, labels, requestDisplayMode, toast])
  return {
    isFullscreen: displayMode === "fullscreen",
    canFullscreen: fullscreenAvailable(displayMode, availableDisplayModes),
    toggle,
  }
}

function McpAppViewShell({
  widgets,
  refreshToolName = "refresh-view",
  builderEnabled,
  labels,
  builderLabels,
  titleMode = "show",
  titleLevel = 2,
  renderTitle,
  slowHintAfterMs = DEFAULT_SLOW_HINT_MS,
  describeError,
  describeStep,
}: McpAppViewProps) {
  const messages = useToolkitMessages()
  const L = useMemo(() => ({ ...messages.view, ...labels }), [messages.view, labels])
  // The mcp-use 2.x view channels (all need the `bootstrapView` mount
  // `mountMcpToolkitApp` provides); tools go through the HostBridge.
  const tool = useToolContext()
  const { safeArea, hostContext } = useHostContext()
  const bridge = useHostBridge()
  const callTool = useCallback(
    (name: string, args: Record<string, unknown>) => bridge.callTool(name, args),
    [bridge],
  )
  // The widget-facing shape (`args: object`, so generated input interfaces
  // without an index signature pass straight through).
  const callToolFn = useCallback(
    (name: string, args: object) => bridge.callTool(name, args as Record<string, unknown>),
    [bridge],
  )
  const isPending = tool.status === "pending"
  // Since mcp-use 2.7.1 a host cancellation latches as `status: "error"`.
  const isCancelled = tool.status === "error" && tool.error instanceof ToolCancelledError
  const isCallError = tool.status === "error" && !isCancelled
  const initialViewData = tool.status === "ready" ? (tool.toolOutput as ViewData) : undefined

  // Hosts that strip `structuredContent` (claude.ai) never latch a result under
  // mcp-use 2.x; the recovery re-executes the call once to fill the gap. It
  // never fires on a cancelled or failed call (#176): those render their state.
  const recovery = useToolResultRecovery<ViewData>({
    resultReady: !isPending,
    cancelled: isCancelled,
    errored: isCallError,
    props: initialViewData,
    isValid: isCompleteViewData,
    toolInput: tool.toolInput,
    hostContext,
    callTool,
  })
  const [viewData, setViewData] = useHostViewData(initialViewData, isPending, recovery.data)
  const { lifecycle, retry: retryCall } = useViewLifecycle({
    hasViewData: viewData !== null,
    callStatus: tool.status,
    cancelled: isCancelled,
    callError: isCallError ? tool.error : undefined,
    recoveryFailed: recovery.failed,
    toolName: resolveRecoveryToolName(hostContext),
    toolInput: tool.toolInput,
    callTool,
    isValid: isCompleteViewData,
    onResult: setViewData,
    slowHintAfterMs,
  })
  const { frameRef, retry } = useRetryFocus(lifecycle.phase, retryCall)
  const { isRefreshing, refreshView } = useViewRefresh({
    viewData,
    setViewData,
    callTool,
    refreshToolName,
    labels: L,
  })
  const fullscreen = useFullscreenToggle(L)
  // In-iframe build mode is purely a UI state — the LLM never sees the catalogue.
  const [buildMode, setBuildMode] = useState(false)
  const exitBuildMode = useCallback(
    (commit?: BuilderCommit) => {
      if (commit) setViewData((prev) => (prev ? applyBuilderCommit(prev, commit) : prev))
      setBuildMode(false)
    },
    [setViewData],
  )

  // `isPending` must not gate the render: on stripping hosts the latch stays
  // "pending" forever, and recovered viewData still has to replace it. The
  // frame is the stable focus target of a retry (`useRetryFocus`).
  if (!viewData) {
    return (
      <div ref={frameRef} tabIndex={-1} data-slot="mcp-app-view" className="outline-hidden">
        <ViewPlaceholder
          lifecycle={lifecycle}
          labels={L}
          onRetry={retry}
          describeError={describeError}
        />
      </div>
    )
  }

  return (
    <div ref={frameRef} tabIndex={-1} data-slot="mcp-app-view" className="outline-hidden">
      <main
        style={{
          // Fullscreen: the view owns the viewport and scrolls itself. Inline:
          // the host sizes us from our intrinsic height (bootstrapView's
          // auto-resize), so no overflow clipping there.
          ...(fullscreen.isFullscreen ? { minHeight: "100vh", overflowY: "auto" as const } : null),
          paddingTop: safeArea.top,
          paddingRight: safeArea.right,
          paddingBottom: safeArea.bottom,
          paddingLeft: safeArea.left,
        }}
      >
        <ViewToolbar
          hidden={buildMode}
          viewData={viewData}
          builderAvailable={builderEnabled ?? viewData.builderAvailable ?? false}
          isFullscreen={fullscreen.isFullscreen}
          canFullscreen={fullscreen.canFullscreen}
          isRefreshing={isRefreshing}
          labels={L}
          titleMode={titleMode}
          titleLevel={titleLevel}
          renderTitle={renderTitle}
          onRefresh={refreshView}
          onEnterBuildMode={() => setBuildMode(true)}
          onToggleFullscreen={fullscreen.toggle}
        />

        <StepErrors
          hidden={buildMode}
          errors={viewData.context.errors}
          steps={viewData._refreshParams?.steps}
          labels={L}
          describeStep={describeStep}
          onRetry={viewData._refreshParams ? () => void refreshView() : undefined}
        />

        <AppQueryProvider callTool={callToolFn}>
          <ViewBody
            buildMode={buildMode}
            viewData={viewData}
            widgets={widgets}
            callTool={callToolFn}
            builderLabels={builderLabels}
            onExit={exitBuildMode}
          />
        </AppQueryProvider>
      </main>
    </div>
  )
}
