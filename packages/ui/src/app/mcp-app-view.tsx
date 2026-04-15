import { useState, useCallback, useEffect } from "react"
import { useWidget } from "mcp-use/react"
import { QueryClient } from "@tanstack/react-query"
import type { LayoutConfig } from "@miragon/mcp-toolkit-core"
import { Skeleton } from "../primitives/skeleton.js"
import { Alert, AlertDescription } from "../primitives/alert.js"
import { AppQueryProvider } from "../providers/query-provider.js"
import { WidgetRenderer, type WidgetComponent } from "./widget-renderer.js"

export interface McpAppViewLabels {
  loading?: string
  refresh?: string
  refreshing?: string
  enterFullscreen?: string
  exitFullscreen?: string
}

const DEFAULT_LABELS: Required<McpAppViewLabels> = {
  loading: "Waiting for pipeline result...",
  refresh: "⟳ Refresh",
  refreshing: "⟳ Loading...",
  enterFullscreen: "↗ Fullscreen",
  exitFullscreen: "↙ Collapse",
}

interface RefreshParams {
  keys?: Record<string, unknown>
  steps?: { id: string; step: string; optional?: boolean }[]
  layout: LayoutConfig
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
  layout: LayoutConfig
}

function isViewData(x: unknown): x is ViewData {
  if (typeof x !== "object" || x === null) return false
  const obj = x as Record<string, unknown>
  return (
    typeof obj["context"] === "object" &&
    obj["context"] !== null &&
    "keys" in obj["context"] &&
    typeof obj["layout"] !== "undefined"
  )
}

export interface McpAppViewProps {
  /**
   * Map of widget ID to React component. The consumer aggregates this from
   * each module's widget exports and passes it in at the bundled `main.tsx`
   * entry point.
   */
  widgets: Record<string, WidgetComponent>
  /**
   * Name of the MCP tool that the refresh button invokes. Consumers typically
   * register this tool as a thin wrapper around `renderView(...)` from
   * `@miragon/mcp-toolkit-core`. Defaults to `"refresh-view"`.
   */
  refreshToolName?: string
  /**
   * Override UI strings (loading, refresh button, fullscreen toggle).
   * Defaults to English.
   */
  labels?: McpAppViewLabels
  /**
   * Optional scope key passed to `queryClient.invalidateQueries` on refresh.
   * When omitted, all queries are invalidated (existing behavior, documented footgun).
   */
  scope?: string
}

export function McpAppView({
  widgets,
  refreshToolName = "refresh-view",
  labels,
  scope,
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

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  const [viewData, setViewData] = useState<ViewData | null>(null)
  const [displayMode, setDisplayMode] = useState<string>("inline")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPending && initialViewData) {
      setViewData(initialViewData)
    }
  }, [isPending, initialViewData])

  useEffect(() => {
    if (currentDisplayMode) setDisplayMode(currentDisplayMode)
  }, [currentDisplayMode])

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
    async (name: string, args: Record<string, unknown>) => {
      return callTool(name, args)
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
      if (result.structuredContent) {
        if (isViewData(result.structuredContent)) {
          setRefreshError(null)
          setViewData(result.structuredContent)
        } else {
          console.error("[McpAppView] refresh returned unexpected shape", result.structuredContent)
        }
      }
      void queryClient.invalidateQueries(scope ? { queryKey: [scope] } : undefined)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsRefreshing(false)
    }
  }, [callTool, queryClient, refreshToolName, scope, viewData?._refreshParams])

  if (isPending || !viewData) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <p className="text-muted-foreground text-sm">{effectiveLabels.loading}</p>
      </div>
    )
  }

  return (
    <main
      style={{
        minHeight: "600px",
        maxHeight: "600px",
        overflowY: "auto",
        paddingTop: safeArea?.insets?.top,
        paddingRight: safeArea?.insets?.right,
        paddingBottom: safeArea?.insets?.bottom,
        paddingLeft: safeArea?.insets?.left,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        {viewData.title && <h2 className="text-xl font-bold">{viewData.title}</h2>}
        <div className="flex items-center gap-2">
          {viewData._refreshParams && (
            <button
              onClick={() => {
                void refreshView()
              }}
              disabled={isRefreshing}
              className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isRefreshing ? effectiveLabels.refreshing : effectiveLabels.refresh}
            </button>
          )}
          <button
            onClick={() => {
              void toggleFullscreen()
            }}
            className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          >
            {displayMode === "fullscreen"
              ? effectiveLabels.exitFullscreen
              : effectiveLabels.enterFullscreen}
          </button>
        </div>
      </div>

      {refreshError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{refreshError}</AlertDescription>
        </Alert>
      )}

      {viewData.context.errors.length > 0 && (
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

      <AppQueryProvider callTool={callToolFn} client={queryClient} scope={scope}>
        <WidgetRenderer
          layout={viewData.layout}
          keys={viewData.context.keys}
          stepData={viewData.context.stepData}
          errors={viewData.context.errors}
          widgets={widgets}
        />
      </AppQueryProvider>
    </main>
  )
}
