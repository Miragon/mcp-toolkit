import { useState, useCallback } from "react"
import { useDisplayMode, useHostContext, useToolContext } from "mcp-use/react"
import { Maximize2, Minimize2, Pencil, RefreshCw } from "lucide-react"
import type { LayoutConfig, PipelineStepRef } from "@miragon/mcp-toolkit-core"
import { Skeleton } from "../primitives/skeleton.js"
import { AppQueryProvider, queryClient } from "../providers/query-provider.js"
import { useToolResultRecovery } from "../hooks/use-tool-result-recovery.js"
import { parseToolResult } from "../lib/parse-tool-result.js"
import { useHostBridge } from "./host-bridge.js"
import { LayoutBuilder } from "./layout-builder.js"
import { WidgetRenderer, type WidgetComponent } from "./widget-renderer.js"

export interface McpAppViewLabels {
  loading?: string
  refresh?: string
  refreshing?: string
  enterFullscreen?: string
  exitFullscreen?: string
  build?: string
}

const DEFAULT_LABELS: Required<McpAppViewLabels> = {
  loading: "Waiting for pipeline result...",
  refresh: "Refresh",
  refreshing: "Loading...",
  enterFullscreen: "Fullscreen",
  exitFullscreen: "Collapse",
  build: "Build",
}

interface RefreshParams {
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  layout?: LayoutConfig
  title?: string
}

interface ViewData {
  _refreshParams?: RefreshParams
  title?: string
  context: {
    keys: Record<string, unknown>
    stepIds: string[]
    stepData: Record<
      string,
      { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
    >
    errors: { stepId: string; reason: string }[]
  }
  layout?: LayoutConfig
  /**
   * Whether the server's in-iframe builder platform is usable (set by
   * `render-view` from `createFrameworkApp`'s `app.builder`). The shell gates
   * its Build affordance on this so the edit button never appears against a
   * server whose `get-builder-catalogue` tool isn't registered.
   */
  builderAvailable?: boolean
}

/**
 * A renderable view payload: the envelope `render-view`/`show_*` tools emit
 * as `structuredContent`. Module-level so it is referentially stable as the
 * recovery hook's `isValid` dependency.
 */
function isCompleteViewData(value: unknown): value is ViewData {
  const v = value as ViewData | null | undefined
  return Boolean(v?.context && v?.layout)
}

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
   * Override UI strings (loading, refresh, fullscreen, build).
   * Defaults to English.
   */
  labels?: McpAppViewLabels
}

export function McpAppView({
  widgets,
  refreshToolName = "refresh-view",
  builderEnabled,
  labels,
}: McpAppViewProps) {
  const effectiveLabels = { ...DEFAULT_LABELS, ...labels }
  // Since mcp-use 2.x the shell reads the view channels through the dedicated
  // hooks (all require the surrounding `bootstrapView` mount that
  // `mountMcpToolkitApp` provides) and calls tools through the HostBridge that
  // `McpUseHostBridgeProvider` installs.
  const tool = useToolContext()
  const { displayMode, requestDisplayMode } = useDisplayMode()
  const { safeArea, hostContext } = useHostContext()
  const bridge = useHostBridge()
  const callTool = useCallback(
    (name: string, args: Record<string, unknown>) => bridge.callTool(name, args),
    [bridge],
  )

  const isPending = tool.status === "pending"
  const initialViewData = tool.status === "ready" ? (tool.toolOutput as ViewData) : undefined
  const toolInput = tool.toolInput

  const [viewData, setViewData] = useState<ViewData | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // In-iframe build mode is purely a UI state — the LLM never sees the
  // catalogue, the user toggles into build by clicking the toolbar button.
  const [buildMode, setBuildMode] = useState(false)

  // Sync host-provided initialViewData → local viewData via render-phase
  // setState (rather than an effect) so the React Compiler doesn't flag a
  // cascading render. The guard against transient empty toolOutput stays:
  // widgetProps may briefly drop `context`/`layout` when displayMode toggles,
  // and we don't want that to clobber a valid viewData.
  //
  // `prev` MUST start as `null`, not `initialViewData`: hosts that expose the
  // complete tool output before the app's first render (e.g. window.openai
  // globals injected ahead of script execution) would otherwise never trip the
  // identity check — initialViewData never changes again, the sync never runs,
  // and the app idles on the loading skeleton forever.
  const [prevInitialViewData, setPrevInitialViewData] = useState<typeof initialViewData | null>(
    null,
  )
  if (initialViewData !== prevInitialViewData) {
    setPrevInitialViewData(initialViewData)
    if (!isPending && isCompleteViewData(initialViewData)) {
      setViewData(initialViewData)
    }
  }

  // Hosts that strip `structuredContent` from the tool-result notification
  // (claude.ai / Claude Desktop) never latch a result under mcp-use 2.x — the
  // `useToolContext` latch ignores content-only results, so `isPending` stays
  // true forever. The recovery therefore also arms itself on a grace timer
  // once the originating tool is known, re-executes it via `callTool`
  // (responses carry `structuredContent` intact), and fills the gap.
  // Conforming hosts deliver a valid payload up front, so it never fires
  // there.
  const recovery = useToolResultRecovery<ViewData>({
    resultReady: !isPending,
    props: initialViewData,
    isValid: isCompleteViewData,
    toolInput,
    hostContext,
    callTool,
  })
  const [prevRecovered, setPrevRecovered] = useState<ViewData | null>(null)
  if (recovery.data !== prevRecovered) {
    setPrevRecovered(recovery.data)
    // The host-delivered payload always wins; recovery only fills the gap.
    if (recovery.data && !viewData) setViewData(recovery.data)
  }

  const toggleFullscreen = useCallback(async () => {
    const newMode = displayMode === "fullscreen" ? "inline" : "fullscreen"
    try {
      // Advisory since 2.x: the promise only confirms the host processed the
      // request. `displayMode` from `useDisplayMode` updates reactively when
      // (and only when) the host actually applies the change.
      await requestDisplayMode({ mode: newMode })
    } catch (e) {
      console.error("Failed to toggle display mode:", e)
    }
  }, [displayMode, requestDisplayMode])

  // Stable callTool callback (avoids a new object reference on every render)
  const callToolFn = useCallback(
    async (name: string, args: object) => {
      return callTool(name, args as Record<string, unknown>)
    },
    [callTool],
  )

  const refreshView = useCallback(async () => {
    if (!viewData?._refreshParams) return
    setIsRefreshing(true)
    try {
      const result = await callTool(
        refreshToolName,
        viewData._refreshParams as unknown as Record<string, unknown>,
      )
      // Decode through the shared structured-first parser (one convention with
      // `useToolQuery`); a refresh returns the view envelope as `structuredContent`.
      const refreshed = parseToolResult<ViewData | null>(result)
      if (refreshed?.context && refreshed?.layout) {
        setViewData(refreshed)
      }
      void queryClient.invalidateQueries()
    } catch (e) {
      console.error("Failed to refresh view:", e)
    } finally {
      setIsRefreshing(false)
    }
  }, [callTool, refreshToolName, viewData])

  // Called by LayoutBuilder when the user clicks Done. Commits the draft
  // layout (and any keys/steps edits) into the parent viewData so the
  // WidgetRenderer takes over showing the just-built layout.
  const exitBuildMode = useCallback(
    (commit?: {
      layout: LayoutConfig
      keys?: Record<string, unknown>
      steps?: PipelineStepRef[]
      title?: string
      context?: ViewData["context"]
    }) => {
      if (commit) {
        setViewData((prev) =>
          prev
            ? {
                ...prev,
                layout: commit.layout,
                title: commit.title ?? prev.title,
                context: commit.context ?? prev.context,
                _refreshParams: {
                  keys: commit.keys,
                  steps: commit.steps,
                  layout: commit.layout,
                  title: commit.title ?? prev.title,
                },
              }
            : prev,
        )
      }
      setBuildMode(false)
    },
    [],
  )

  // `isPending` must not gate the render: on hosts that strip
  // `structuredContent` the 2.x latch stays "pending" forever, and recovered
  // viewData still has to replace the skeleton.
  if (!viewData) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <p className="text-muted-foreground text-sm">{effectiveLabels.loading}</p>
      </div>
    )
  }

  const showHeader = !buildMode

  // Follow the server's own signal by default: render-view reports
  // `builderAvailable` (derived from `app.builder`), so the Build button only
  // shows when the catalogue/dashboard tools are actually registered. An
  // explicit `builderEnabled` prop forces the affordance on or off.
  const builderAvailable = builderEnabled ?? viewData.builderAvailable ?? false

  return (
    <main
      style={{
        // Fullscreen: the widget owns the viewport, so we take the full window
        // and handle our own scrolling. Inline: the host (Claude, ChatGPT) owns
        // sizing + scrolling and observes our intrinsic height via
        // `bootstrapView`'s auto-resize, so we let content dictate height and
        // avoid setting overflowY (which would clip our own content inside a
        // host that's already auto-sized to us).
        ...(displayMode === "fullscreen"
          ? { minHeight: "100vh", overflowY: "auto" as const }
          : null),
        paddingTop: safeArea.top,
        paddingRight: safeArea.right,
        paddingBottom: safeArea.bottom,
        paddingLeft: safeArea.left,
      }}
    >
      {showHeader && (
        <div className="mb-4 flex items-center justify-between">
          {viewData.title && <h2 className="text-xl font-bold">{viewData.title}</h2>}
          <div className="ml-auto flex items-center gap-2">
            {viewData._refreshParams && viewData.layout && (
              <button
                onClick={() => {
                  void refreshView()
                }}
                disabled={isRefreshing}
                className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
                {isRefreshing ? effectiveLabels.refreshing : effectiveLabels.refresh}
              </button>
            )}
            {builderAvailable && viewData._refreshParams && (
              <button
                onClick={() => setBuildMode(true)}
                className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
              >
                <Pencil className="h-4 w-4" />
                {effectiveLabels.build}
              </button>
            )}
            <button
              onClick={() => {
                void toggleFullscreen()
              }}
              className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {displayMode === "fullscreen" ? (
                <Minimize2 aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Maximize2 aria-hidden="true" className="h-4 w-4" />
              )}
              {displayMode === "fullscreen"
                ? effectiveLabels.exitFullscreen
                : effectiveLabels.enterFullscreen}
            </button>
          </div>
        </div>
      )}

      {!buildMode && viewData.context.errors.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {viewData.context.errors.map((err) => (
            <div
              key={err.stepId}
              className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
            >
              <strong>{err.stepId}:</strong> {err.reason}
            </div>
          ))}
        </div>
      )}

      <AppQueryProvider callTool={callToolFn}>
        {buildMode ? (
          <LayoutBuilder
            initialLayout={viewData.layout}
            title={viewData.title}
            initialKeys={viewData._refreshParams?.keys}
            initialSteps={viewData._refreshParams?.steps}
            widgets={widgets}
            callTool={callToolFn}
            onExit={exitBuildMode}
          />
        ) : viewData.layout ? (
          <WidgetRenderer
            layout={viewData.layout}
            keys={viewData.context.keys}
            stepData={viewData.context.stepData}
            errors={viewData.context.errors}
            widgets={widgets}
          />
        ) : null}
      </AppQueryProvider>
    </main>
  )
}
