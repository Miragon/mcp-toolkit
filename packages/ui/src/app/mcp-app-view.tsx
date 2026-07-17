import { useState, useCallback, useEffect, useMemo } from "react"
import { useWidget } from "mcp-use/react"
import { Maximize2, Minimize2, Pencil, RefreshCw } from "lucide-react"
import type { LayoutConfig, PipelineStepRef, RowDef } from "@miragon/mcp-toolkit-core"
import { normalizeLayout } from "@miragon/mcp-toolkit-core"
import { Skeleton } from "../primitives/skeleton.js"
import { AppQueryProvider, queryClient } from "../providers/query-provider.js"
import { useToolResultRecovery } from "../hooks/use-tool-result-recovery.js"
import { parseToolResult } from "../lib/parse-tool-result.js"
import { LayoutBuilder } from "./layout-builder.js"
import { WidgetRenderer, resolveAliasComponents, type WidgetComponent } from "./widget-renderer.js"
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

/**
 * Alias metadata for a manifest widget that renders a host-bundled component:
 * the shell resolves `hostWidget` in its own `widgets` map and merges
 * `presetProps` under each layout cell's props (the cell wins key-by-key).
 * Mirrors `HostAliasWidgetInfo` in `@miragon/mcp-toolkit-core`.
 */
interface HostAliasWidgetInfo {
  hostWidget: string
  presetProps?: Record<string, unknown>
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
  /**
   * Manifest widgets that alias a host-bundled widget. Only layout-referenced
   * aliases are advertised by `render-view`; build mode merges in the full
   * catalogue palette via `LayoutBuilder`'s `onAliasCatalogue`.
   */
  aliasWidgets?: Record<string, HostAliasWidgetInfo>
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
  widgetLoader,
  refreshToolName = "refresh-view",
  remoteBundleToolName = "read-widget-bundle",
  builderEnabled,
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
    toolInput,
    hostContext,
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

  // Full remote-widget palette for build mode. `render-view` only advertises
  // the upstream-hosted widgets the layout references (see
  // `viewData.remoteWidgets`), so when the user enters build mode the
  // LayoutBuilder reports the catalogue's complete palette via `onCatalogue`
  // and we merge it in for pre-loading.
  const [cataloguedRemoteWidgets, setCataloguedRemoteWidgets] = useState<
    Record<string, RemoteWidgetInfo>
  >({})

  // Same idea for host-alias widgets: `render-view` only advertises the
  // layout-referenced aliases, the builder catalogue reports the full palette
  // via `onAliasCatalogue` so dropped aliases resolve immediately.
  const [cataloguedAliasWidgets, setCataloguedAliasWidgets] = useState<
    Record<string, HostAliasWidgetInfo>
  >({})

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
  // (claude.ai / Claude Desktop) leave `initialViewData` empty forever; the
  // recovery re-executes the originating tool once via `callTool` (responses
  // carry `structuredContent` intact) and fills the gap. Conforming hosts
  // deliver a valid payload up front, so this never fires there.
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

  // Lazy-load any remote widgets referenced by the current layout that the
  // consumer didn't pre-wire. The server advertises bundle URIs via
  // `viewData.remoteWidgets`; the loader fetches + evaluates each bundle
  // exactly once and memoises the component in local state.
  //
  // Build mode preloads *every* upstream-hosted widget so the palette can
  // render real widgets immediately when the user drops them onto the
  // canvas — without a per-click fetch delay.
  // The remote-widget manifest the loader resolves bundles against: the
  // layout-referenced widgets from `render-view`, plus (in build mode) the
  // full catalogue palette so dropping any upstream widget renders instantly.
  const remoteWidgetManifest = useMemo<Record<string, RemoteWidgetInfo>>(() => {
    if (!buildMode) return viewData?.remoteWidgets ?? {}
    return { ...cataloguedRemoteWidgets, ...viewData?.remoteWidgets }
  }, [buildMode, viewData, cataloguedRemoteWidgets])

  const widgetIdsInLayout = useMemo<string[]>(() => {
    const ids = new Set<string>()
    if (viewData?.layout) {
      for (const id of collectLayoutWidgetIds(viewData.layout)) ids.add(id)
    }
    if (buildMode) {
      for (const id of Object.keys(remoteWidgetManifest)) ids.add(id)
    }
    return [...ids]
  }, [viewData, buildMode, remoteWidgetManifest])

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
    const manifest = remoteWidgetManifest
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
  }, [effectiveWidgetLoader, remoteWidgetManifest, widgetIdsInLayout, widgets, remoteWidgets])

  // Resolve host-alias widgets into renderable components: each alias id maps
  // to a host-bundled component wrapped so its manifest preset props merge
  // UNDER the layout cell's props (the cell wins key-by-key).
  const aliasManifest = useMemo<Record<string, HostAliasWidgetInfo>>(() => {
    if (!buildMode) return viewData?.aliasWidgets ?? {}
    return { ...cataloguedAliasWidgets, ...viewData?.aliasWidgets }
  }, [buildMode, viewData, cataloguedAliasWidgets])

  // Server-side validation guarantees each alias targets a registered local
  // widget, but the browser bundle map can still lack the component — the
  // resolver warns and skips those (the cell renders like any unbundled
  // widget), never crashing the view.
  const aliasComponents = useMemo<Record<string, WidgetComponent>>(
    () => resolveAliasComponents(aliasManifest, widgets),
    [aliasManifest, widgets],
  )

  const mergedWidgets = useMemo(
    () => ({ ...widgets, ...remoteWidgets, ...aliasComponents }),
    [widgets, remoteWidgets, aliasComponents],
  )

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
            widgets={mergedWidgets}
            callTool={callToolFn}
            onCatalogue={setCataloguedRemoteWidgets}
            onAliasCatalogue={setCataloguedAliasWidgets}
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
