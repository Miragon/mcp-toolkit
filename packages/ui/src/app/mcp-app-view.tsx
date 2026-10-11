import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react"
import { LucideProvider } from "lucide-react"
import { ToolCancelledError, useHostContext, useToolContext } from "mcp-use/react"
import { ToastProvider } from "../components/Toast.js"
import {
  ToolkitLocaleFallback,
  useToolkitLocale,
  useToolkitMessages,
} from "../locale/locale-provider.js"
import { formatClockTime, resolveFormatLocale } from "../locale/toolkit-messages.js"
import { AppQueryProvider, useAppQueryClient } from "../providers/query-provider.js"
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
import { useFullscreenToggle, useViewRefresh } from "./use-view-actions.js"
import { useRetryFocus, useViewLifecycle } from "./use-view-lifecycle.js"
import {
  DEFAULT_SLOW_HINT_MS,
  describeViewForModel,
  reloadedAtOf,
  type ViewLifecycle,
  type ViewSource,
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
  /**
   * Put the tool name into the cache keys of the data hooks inside the view
   * (`[...queryKey, toolName, args]`, see `toolQueryKey`), so two tools never
   * share an entry. Omitted: an enclosing `AppQueryProvider`'s setting, else
   * the 2.x key `[...queryKey, args]`. The next major makes it the default.
   */
  toolNameInQueryKey?: boolean
}

/**
 * The toolkit's MCP App view: lifecycle placeholder (waiting / error /
 * cancelled), toolbar, failed-steps alert and the rendered layout (or the
 * builder). Mounts a `ToastProvider` and binds the toolkit's own strings to
 * the host's locale unless a `LocaleProvider` sets one, so the chrome follows
 * the host language; `useLocale()` in consumer widgets is unaffected. Lucide
 * icons draw at the CI stroke (2.5) throughout, the toast stack included.
 * The widgets' data hooks fetch through an enclosing `AppQueryProvider`'s
 * client, else the toolkit's shared `queryClient`.
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

/** The payload the view shows, where it came from, and when the view loaded it itself. */
interface ShownView {
  data: ViewData | null
  source: ViewSource | null
  /**
   * When the view re-loaded the payload itself (epoch ms), so its figures can
   * differ from the result the chat answered from (`reloadedAtOf`); `null`
   * otherwise.
   */
  reloadedAt: number | null
}

const NO_VIEW: ShownView = { data: null, source: null, reloadedAt: null }

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
      setView({ data: initialViewData, source: "host", reloadedAt: null })
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
          ? { data: recovered, source: "recovered", reloadedAt: recoveredAt }
          : prev,
      )
    }
  }
  return [view, setView] as const
}

/**
 * Hands the payload the view shows (the host's, its own recovery's, the
 * user's retry or refresh) to the host bridge, so `HostBridge.getWidgetData()`
 * returns what the view shows (toolkit#176 K15), also after a latch the view
 * could not render.
 */
function useReportShownPayload(view: ShownView) {
  const report = useViewResultSink()
  const payload = view.data
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
  useReportShownPayload(view)
  // A re-run's figures can differ from the answer in the chat (N23): stamp
  // it, unless the original call failed and the chat never had figures.
  const callFailed = call.isCallError || call.isCancelled
  const showRetried = useCallback(
    (data: ViewData) =>
      setView({ data, source: "retry", reloadedAt: reloadedAtOf("retry", Date.now(), callFailed) }),
    [setView, callFailed],
  )
  const showRefreshed = useCallback(
    (data: ViewData) =>
      setView({
        data,
        source: "refresh",
        reloadedAt: reloadedAtOf("refresh", Date.now(), callFailed),
      }),
    [setView, callFailed],
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

/**
 * The view's own line of model context (toolkit#176 K20, N23): an error the
 * user sees instead of the view, failed data steps, or data the view
 * re-loaded itself (a recovery, a retry, a refresh). Renders nothing while
 * there is nothing to report.
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
    reloadedAt: view.reloadedAt,
    reloadedBy: reloadedByOf(view.source),
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
  toolNameInQueryKey,
}: McpAppViewProps) {
  const messages = useToolkitMessages()
  const L = useMemo(() => ({ ...messages.view, ...labels }), [messages.view, labels])
  // The mcp-use 2.x view channels (all need the `bootstrapView` mount
  // `mountMcpToolkitApp` provides); tools go through the HostBridge.
  const call = useRenderCall()
  const { safeArea, locale, timeZone } = useHostContext()
  // A time in the language of the sentence around it, in the host's zone.
  const formatLocale = resolveFormatLocale(useToolkitLocale(), locale)
  // The client the view's widgets fetch through (an enclosing
  // AppQueryProvider's, else the shared one): a refresh invalidates it.
  const viewClient = useAppQueryClient()
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
    client: viewClient,
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
          dataAsOf={formatDataAsOf(view.reloadedAt, formatLocale, timeZone)}
        />

        <StepErrors
          hidden={buildMode}
          errors={viewData.context.errors}
          steps={viewData._refreshParams?.steps}
          labels={L}
          describeStep={describeStep}
          onRetry={viewData._refreshParams ? () => void refreshView() : undefined}
        />

        <AppQueryProvider
          callTool={callToolFn}
          client={viewClient}
          toolNameInQueryKey={toolNameInQueryKey}
        >
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

/** How the model line names the view's own re-load of the shown payload. */
function reloadedByOf(source: ViewSource | null): "recovery" | "refresh" | "builder" {
  if (source === "refresh" || source === "builder") return source
  return "recovery"
}

/**
 * The shown view with a builder commit applied (nothing to apply without
 * data). A commit that carries the builder's live context shows figures the
 * builder loaded itself (its catalogue call ran the steps again), so it is
 * stamped like a refresh: the toolbar says when, and the model learns that
 * they can differ from the result the chat answered from. A commit without a
 * context keeps the shown figures, and with them their source and stamp.
 */
function withBuilderCommit(view: ShownView, commit: BuilderCommit): ShownView {
  if (!view.data) return view
  const data = applyBuilderCommit(view.data, commit)
  if (!commit.context) return { ...view, data }
  return { data, source: "builder", reloadedAt: reloadedAtOf("builder", Date.now(), false) }
}

/** The toolbar's "as of" time of a re-loaded payload, `undefined` for any other. */
function formatDataAsOf(
  reloadedAt: number | null,
  locale: string,
  timeZone: string | undefined,
): string | undefined {
  return reloadedAt === null ? undefined : formatClockTime(reloadedAt, locale, timeZone)
}
