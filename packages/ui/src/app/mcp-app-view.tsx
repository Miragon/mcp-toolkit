import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react"
import { LucideProvider } from "lucide-react"
import { ToolCancelledError, useDisplayMode, useHostContext, useToolContext } from "mcp-use/react"
import { ToastProvider, useToast } from "../components/Toast.js"
import { ToolkitLocaleFallback, useToolkitMessages } from "../locale/locale-provider.js"
import { formatClockTime, type ViewMessages } from "../locale/toolkit-messages.js"
import { AppQueryProvider, queryClient } from "../providers/query-provider.js"
import { resolveToolSafety } from "../hooks/tool-result-recovery-model.js"
import {
  DEFAULT_ASSUME_STRIPPED_AFTER_MS,
  resolveRecoveryToolName,
  useToolResultRecovery,
  type RecoveryPolicy,
} from "../hooks/use-tool-result-recovery.js"
import { ICON_STROKE } from "../lib/icon-stroke.js"
import { useHostBridge } from "./host-bridge.js"
import { useViewResultSink } from "./mcp-use-host-bridge.js"
import { HostModelContext } from "./model-context.js"
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
import { useBuildModeFocus } from "./use-build-mode-focus.js"
import { useRetryFocus, useViewLifecycle } from "./use-view-lifecycle.js"
import {
  DEFAULT_SLOW_HINT_MS,
  decodeViewResult,
  describeViewForModel,
  type ViewLifecycle,
} from "./view-lifecycle.js"
import type { WidgetComponent } from "./widget-renderer.js"

export type { McpAppViewLabels, ViewTitleLevel, ViewTitleMode } from "./mcp-app-view-chrome.js"
export type { DescribeStep } from "./mcp-app-view-chrome.js"
export type { DescribeViewError, ViewErrorKind } from "./mcp-app-view-states.js"
export type { RecoveryPolicy } from "../hooks/use-tool-result-recovery.js"

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
  /**
   * Which originating tools the view may re-execute on its own when the host
   * strips the result's `structuredContent` (claude.ai, Claude Desktop).
   * `"auto"` (default): any tool the host does not report as writing
   * (`readOnlyHint: false` or `destructiveHint: true`); `"read-only"`: only
   * tools reported with `readOnlyHint: true`; `"never"`: none. A recovery
   * the policy forbids shows a note that the chat did not pass the result to
   * the view. It offers to load the view only for a tool the host does not
   * report as writing; for a writing tool it asks for the current state in
   * the chat, so one click never runs the write a second time.
   */
  recoverStrippedResult?: RecoveryPolicy
  /**
   * Grace period (ms) after which a silent call counts as a stripped result.
   * Only used where the view could not watch the host's notifications from
   * the start (e.g. a custom shell mounted under its own `bootstrapView`
   * without `installToolResultObserver`); a view mounted by
   * `mountMcpToolkitApp` sees the stripped result itself and never guesses,
   * so a slow tool is never re-run. Default 2500 ms.
   */
  strippedResultGraceMs?: number
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
 * Where the shown payload came from: the host's tool result, the view's own
 * re-execution when the host stripped it, the user's retry, or a refresh.
 */
type ViewSource = "host" | "recovered" | "retry" | "refresh"

interface ShownView {
  data: ViewData | null
  source: ViewSource | null
  /** For a `"recovered"` payload: when it arrived (epoch ms). */
  recoveredAt: number | null
}

const NO_VIEW: ShownView = { data: null, source: null, recoveredAt: null }

/**
 * Host-delivered payload → the shown view, recovered payloads included, each
 * tagged with its source. Render-phase setState (not an effect) so the React
 * Compiler doesn't flag a cascading render.
 */
function useHostViewData(
  initialViewData: ViewData | undefined,
  isPending: boolean,
  recovered: ViewData | null,
  recoveredAt: number | null,
) {
  const [view, setView] = useState<ShownView>(NO_VIEW)
  // `prev` MUST start as `null`, not `initialViewData`: hosts that expose the
  // complete tool output before the app's first render (e.g. window.openai
  // globals injected ahead of script execution) would otherwise never trip the
  // identity check — the sync never runs and the app idles on the skeleton.
  // The completeness guard stays: widgetProps may briefly drop
  // `context`/`layout` when displayMode toggles.
  const [prevInitial, setPrevInitial] = useState<ViewData | undefined | null>(null)
  if (initialViewData !== prevInitial) {
    setPrevInitial(initialViewData)
    if (!isPending && isCompleteViewData(initialViewData)) {
      setView({ data: initialViewData, source: "host", recoveredAt: null })
    }
  }
  const [prevRecovered, setPrevRecovered] = useState<ViewData | null>(null)
  if (recovered !== prevRecovered) {
    setPrevRecovered(recovered)
    // The host-delivered payload always wins; a recovery fills the gap, and a
    // recovery for newer arguments replaces an older recovered payload (N21).
    if (recovered) {
      setView((prev) =>
        prev.data === null || prev.source === "recovered"
          ? { data: recovered, source: "recovered", recoveredAt }
          : prev,
      )
    }
  }
  return [view, setView] as const
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

/**
 * Hands a payload the view got by re-running the originating tool (its own
 * recovery or the user's retry) to the host bridge, so
 * `HostBridge.getWidgetData()` returns what the view shows (toolkit#176 K15).
 */
function useReportRerunPayload(view: ShownView) {
  const report = useViewResultSink()
  const rerun = view.source === "recovered" || view.source === "retry"
  const payload = rerun ? view.data : null
  useEffect(() => {
    if (payload) report?.(payload)
  }, [payload, report])
}

/** The rendering call as mcp-use 2.x latches it, plus the tool the host names. */
function useRenderCall() {
  const tool = useToolContext()
  const { hostContext } = useHostContext()
  // Since mcp-use 2.7.1 a host cancellation latches as `status: "error"`.
  const isCancelled = tool.status === "error" && tool.error instanceof ToolCancelledError
  const isCallError = tool.status === "error" && !isCancelled
  return {
    tool,
    hostContext,
    isPending: tool.status === "pending",
    isCancelled,
    isCallError,
    callError: isCallError ? tool.error : undefined,
    initialViewData: tool.status === "ready" ? (tool.toolOutput as ViewData) : undefined,
    toolName: resolveRecoveryToolName(hostContext),
    /** The host reports the tool as writing: the view never offers to re-run it after a block. */
    toolWrites: resolveToolSafety(hostContext) === "writes",
  }
}

/**
 * The payload the view shows: the host's, else the stripped-result recovery's.
 * Hosts that strip `structuredContent` (claude.ai) never latch a result under
 * mcp-use 2.x; the recovery re-executes the call once when the stripped
 * result arrives. It never fires on a cancelled or failed call, nor while a
 * slow tool is still running (#176): those render their state.
 */
function useShownView(
  call: ReturnType<typeof useRenderCall>,
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  policy: RecoveryPolicy = "auto",
  graceMs: number = DEFAULT_ASSUME_STRIPPED_AFTER_MS,
) {
  const recovery = useToolResultRecovery<ViewData>({
    resultReady: !call.isPending,
    cancelled: call.isCancelled,
    errored: call.isCallError,
    props: call.initialViewData,
    isValid: isCompleteViewData,
    toolInput: call.tool.toolInput,
    hostContext: call.hostContext,
    callTool,
    policy,
    assumeStrippedAfterMs: graceMs,
  })
  const [view, setView] = useHostViewData(
    call.initialViewData,
    call.isPending,
    recovery.data,
    recovery.recoveredAt,
  )
  useReportRerunPayload(view)
  const showRetried = useCallback(
    (data: ViewData) => setView({ data, source: "retry", recoveredAt: null }),
    [setView],
  )
  const showRefreshed = useCallback(
    (data: ViewData) => setView({ data, source: "refresh", recoveredAt: null }),
    [setView],
  )
  return {
    view,
    setView,
    showRetried,
    showRefreshed,
    // Without a named tool nothing can re-run it: a plain failure. A policy
    // block is its own state: the tool ran, and the view must not repeat it.
    recoveryFailed: recovery.failed || recovery.blocked === "no-tool",
    recoveryBlocked: recovery.blocked === "policy",
  }
}

/** When a payload the view re-loaded itself arrived (its figures are live as of then). */
function recoveredAtOf(view: ShownView): number | null {
  return view.source === "recovered" ? view.recoveredAt : null
}

/**
 * The view's own line of model context (toolkit#176 K20, N23): an error the
 * user sees instead of the view, failed data steps, or data the view
 * re-loaded itself. Renders nothing while there is nothing to report.
 */
function ViewModelContext({
  lifecycle,
  toolName,
  view,
}: {
  lifecycle: ViewLifecycle
  toolName: string | undefined
  view: ShownView
}) {
  const content = describeViewForModel({
    lifecycle,
    toolName,
    stepErrors: view.data?.context.errors,
    stepsRetryable: Boolean(view.data?._refreshParams),
    recoveredAt: recoveredAtOf(view),
  })
  return content ? <HostModelContext content={content} /> : null
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
  recoverStrippedResult,
  strippedResultGraceMs,
}: McpAppViewProps) {
  const messages = useToolkitMessages()
  const L = useMemo(() => ({ ...messages.view, ...labels }), [messages.view, labels])
  // The mcp-use 2.x view channels (all need the `bootstrapView` mount
  // `mountMcpToolkitApp` provides); tools go through the HostBridge.
  const call = useRenderCall()
  const { safeArea, locale, timeZone } = useHostContext()
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
  const shown = useShownView(call, callTool, recoverStrippedResult, strippedResultGraceMs)
  const { view, setView } = shown
  const viewData = view.data
  const { lifecycle, retry: retryCall } = useViewLifecycle({
    hasViewData: viewData !== null,
    callStatus: call.tool.status,
    cancelled: call.isCancelled,
    callError: call.callError,
    recoveryFailed: shown.recoveryFailed,
    recoveryBlocked: shown.recoveryBlocked,
    toolWrites: call.toolWrites,
    toolName: call.toolName,
    toolInput: call.tool.toolInput,
    callTool,
    isValid: isCompleteViewData,
    onResult: shown.showRetried,
    slowHintAfterMs,
  })
  const { frameRef, retry } = useRetryFocus(lifecycle.phase, retryCall)
  const { isRefreshing, refreshView } = useViewRefresh({
    viewData,
    setViewData: shown.showRefreshed,
    callTool,
    refreshToolName,
    labels: L,
  })
  const fullscreen = useFullscreenToggle(L)
  // In-iframe build mode is purely a UI state — the LLM never sees the catalogue.
  const [buildMode, setBuildMode] = useState(false)
  useBuildModeFocus(buildMode, frameRef)
  const exitBuildMode = useCallback(
    (commit?: BuilderCommit) => {
      if (commit) setView((prev) => withBuilderCommit(prev, commit))
      setBuildMode(false)
    },
    [setView],
  )
  const viewContext = (
    <ViewModelContext lifecycle={lifecycle} toolName={call.toolName} view={view} />
  )

  // `isPending` must not gate the render: on stripping hosts the latch stays
  // "pending" forever, and recovered viewData still has to replace it. The
  // frame is the stable focus target of a retry (`useRetryFocus`).
  if (!viewData) {
    return (
      <div ref={frameRef} tabIndex={-1} data-slot="mcp-app-view" className="outline-hidden">
        {viewContext}
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
      {viewContext}
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
          dataAsOf={formatDataAsOf(recoveredAtOf(view), locale, timeZone)}
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

/** The shown view with a builder commit applied (nothing to apply without data). */
function withBuilderCommit(view: ShownView, commit: BuilderCommit): ShownView {
  return view.data ? { ...view, data: applyBuilderCommit(view.data, commit) } : view
}

/** The toolbar's "as of" time of a recovered payload, `undefined` for any other. */
function formatDataAsOf(
  recoveredAt: number | null,
  locale: string | undefined,
  timeZone: string | undefined,
): string | undefined {
  return recoveredAt === null ? undefined : formatClockTime(recoveredAt, locale, timeZone)
}
