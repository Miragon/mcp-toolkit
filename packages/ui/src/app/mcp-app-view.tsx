import { useState, useCallback, useEffect, useMemo } from "react"
import { useWidget } from "mcp-use/react"
import { Maximize2, Minimize2, Pencil, RefreshCw } from "lucide-react"
import type { LayoutConfig, PipelineStepRef, RowDef } from "@miragon/mcp-toolkit-core"
import { normalizeLayout } from "@miragon/mcp-toolkit-core"
import { Skeleton } from "../primitives/skeleton.js"
import { AppQueryProvider, queryClient } from "../providers/query-provider.js"
import { parseToolResult } from "../lib/parse-tool-result.js"
import { LayoutBuilder } from "./layout-builder.js"
import { WidgetRenderer, type WidgetComponent } from "./widget-renderer.js"
import { createRemoteWidgetLoader, type WidgetLoader } from "./remote-widget-loader.js"

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

interface RemoteWidgetInfo {
  bundle: string
  moduleId: string
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
  remoteWidgets?: Record<string, RemoteWidgetInfo>
}

export interface McpAppViewProps {
  /**
   * Map of widget ID to React component. The consumer aggregates this from
   * each module's widget exports and passes it in at the bundled `main.tsx`
   * entry point.
   */
  widgets: Record<string, WidgetComponent>
  /**
   * Optional loader invoked for widget IDs that aren't in `widgets` but are
   * advertised by the server in `viewData.remoteWidgets`. Defaults to a
   * `createRemoteWidgetLoader` that calls the toolkit's built-in
   * `read-widget-bundle` MCP tool via the host bridge — pass this only to
   * override (custom evaluator, alternate tool name, etc.). Widgets loaded
   * through the loader are memoised for the lifetime of the view.
   */
  widgetLoader?: WidgetLoader
  /**
   * Name of the MCP tool that the refresh button invokes. Consumers typically
   * register this tool as a thin wrapper around `renderView(...)` from
   * `@miragon/mcp-toolkit-core`. Defaults to `"refresh-view"`.
   */
  refreshToolName?: string
  /**
   * Name of the MCP tool the default `widgetLoader` calls to fetch an
   * upstream-hosted widget bundle's JS source. Defaults to
   * `"read-widget-bundle"` (the toolkit's built-in tool). Ignored when an
   * explicit `widgetLoader` is passed.
   */
  remoteBundleToolName?: string
  /**
   * Override UI strings (loading, refresh, fullscreen, build).
   * Defaults to English.
   */
  labels?: McpAppViewLabels
}

export function McpAppView({
  widgets,
  widgetLoader,
  refreshToolName = "refresh-view",
  remoteBundleToolName = "read-widget-bundle",
  labels,
}: McpAppViewProps) {
  const effectiveLabels = { ...DEFAULT_LABELS, ...labels }
  const {
    props: initialViewData,
    isPending,
    callTool,
    displayMode: currentDisplayMode,
    requestDisplayMode,
    safeArea,
  } = useWidget<ViewData>()

  const [viewData, setViewData] = useState<ViewData | null>(null)
  const [displayMode, setDisplayMode] = useState<string>(currentDisplayMode ?? "inline")
  const [prevCurrentDisplayMode, setPrevCurrentDisplayMode] = useState(currentDisplayMode)
  if (currentDisplayMode !== prevCurrentDisplayMode) {
    setPrevCurrentDisplayMode(currentDisplayMode)
    if (currentDisplayMode) setDisplayMode(currentDisplayMode)
  }
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [remoteWidgets, setRemoteWidgets] = useState<Record<string, WidgetComponent>>({})

  // In-iframe build mode is purely a UI state — the LLM never sees the
  // catalogue, the user toggles into build by clicking the toolbar button.
  const [buildMode, setBuildMode] = useState(false)

  // Sync host-provided initialViewData → local viewData via render-phase
  // setState (rather than an effect) so the React Compiler doesn't flag a
  // cascading render. The guard against transient empty toolOutput stays:
  // widgetProps may briefly drop `context`/`layout` when displayMode toggles,
  // and we don't want that to clobber a valid viewData.
  const [prevInitialViewData, setPrevInitialViewData] = useState(initialViewData)
  if (initialViewData !== prevInitialViewData) {
    setPrevInitialViewData(initialViewData)
    if (!isPending && initialViewData?.context && initialViewData?.layout) {
      setViewData(initialViewData)
    }
  }

  // Lazy-load any remote widgets referenced by the current layout that the
  // consumer didn't pre-wire. The server advertises bundle URIs via
  // `viewData.remoteWidgets`; the loader fetches + evaluates each bundle
  // exactly once and memoises the component in local state.
  //
  // Build mode preloads *every* upstream-hosted widget so the palette can
  // render real widgets immediately when the user drops them onto the
  // canvas — without a per-click fetch delay.
  const widgetIdsInLayout = useMemo<string[]>(() => {
    const ids = new Set<string>()
    if (viewData?.layout) {
      for (const id of collectLayoutWidgetIds(viewData.layout)) ids.add(id)
    }
    if (buildMode && viewData?.remoteWidgets) {
      for (const id of Object.keys(viewData.remoteWidgets)) ids.add(id)
    }
    return [...ids]
  }, [viewData, buildMode])

  // Default to the toolkit's built-in `read-widget-bundle` tool so consumers
  // don't have to hand-wire a loader for standard upstream-hosted modules.
  const effectiveWidgetLoader = useMemo<WidgetLoader>(() => {
    if (widgetLoader) return widgetLoader
    return createRemoteWidgetLoader({
      fetchResource: async (id) => {
        const res = await callTool(remoteBundleToolName, { id })
        const source = (res.structuredContent as { source?: string } | undefined)?.source
        if (typeof source !== "string") {
          throw new Error(
            `${remoteBundleToolName} returned no source for "${id}" — check that the tool is registered on the host.`,
          )
        }
        return source
      },
    })
  }, [widgetLoader, callTool, remoteBundleToolName])

  useEffect(() => {
    if (!viewData?.remoteWidgets) return
    const manifest = viewData.remoteWidgets
    const missing = widgetIdsInLayout.filter(
      (id) => !widgets[id] && !remoteWidgets[id] && manifest[id],
    )
    if (missing.length === 0) return
    let cancelled = false
    for (const id of missing) {
      const info = manifest[id]
      if (!info) continue
      effectiveWidgetLoader(id, info.bundle)
        .then((component) => {
          if (cancelled) return
          setRemoteWidgets((prev) => (prev[id] ? prev : { ...prev, [id]: component }))
        })
        .catch((err: unknown) => {
          const reason = err instanceof Error ? err.message : String(err)
          console.error(`[mcp-toolkit] failed to load remote widget "${id}": ${reason}`)
        })
    }
    return () => {
      cancelled = true
    }
  }, [effectiveWidgetLoader, viewData?.remoteWidgets, widgetIdsInLayout, widgets, remoteWidgets])

  const mergedWidgets = useMemo(() => ({ ...widgets, ...remoteWidgets }), [widgets, remoteWidgets])

  const toggleFullscreen = useCallback(async () => {
    const newMode = displayMode === "fullscreen" ? "inline" : "fullscreen"
    try {
      const result = await requestDisplayMode(newMode)
      setDisplayMode(result.mode)
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

  if (isPending || !viewData) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <p className="text-muted-foreground text-sm">{effectiveLabels.loading}</p>
      </div>
    )
  }

  const showHeader = !buildMode

  return (
    <main
      style={{
        // Fullscreen: the widget owns the viewport, so we take the full window
        // and handle our own scrolling. Inline: the host (Claude, ChatGPT) owns
        // sizing + scrolling and is notified of our intrinsic height via
        // `McpUseProvider`, so we let content dictate height and avoid setting
        // overflowY (which would clip our own content inside a host that's
        // already auto-sized to us).
        ...(displayMode === "fullscreen"
          ? { minHeight: "100vh", overflowY: "auto" as const }
          : null),
        paddingTop: safeArea?.insets?.top,
        paddingRight: safeArea?.insets?.right,
        paddingBottom: safeArea?.insets?.bottom,
        paddingLeft: safeArea?.insets?.left,
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
            {viewData._refreshParams && (
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
            widgets={mergedWidgets}
            callTool={callToolFn}
            onExit={exitBuildMode}
          />
        ) : viewData.layout ? (
          <WidgetRenderer
            layout={viewData.layout}
            keys={viewData.context.keys}
            stepData={viewData.context.stepData}
            errors={viewData.context.errors}
            widgets={mergedWidgets}
          />
        ) : null}
      </AppQueryProvider>
    </main>
  )
}

/**
 * Walks a normalised layout (rows or tabs) and returns the set of widget
 * IDs it references, de-duplicated. The remote-widget-loader effect uses
 * it to decide which bundles still need fetching.
 */
function collectLayoutWidgetIds(layout: LayoutConfig): string[] {
  const seen = new Set<string>()
  const normalised = normalizeLayout(layout)
  const collectRows = (rows: RowDef[]) => {
    for (const row of rows) {
      for (const cell of row.row) seen.add(cell.widget)
    }
  }
  if ("tabs" in normalised) {
    for (const tab of normalised.tabs) collectRows(tab.rows)
  } else {
    collectRows(normalised.rows)
  }
  return [...seen]
}
