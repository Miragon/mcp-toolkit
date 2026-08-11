/**
 * Presentational chrome for `McpAppView` — the toolbar, the pipeline error
 * list, and the build/render body — plus the view-envelope types they share.
 * Split out of `mcp-app-view.tsx` so the shell component keeps only the
 * host-sync and state logic while this file stays hook-free.
 */
import { Maximize2, Minimize2, Pencil, RefreshCw } from "lucide-react"
import type { LayoutConfig, PipelineStepRef } from "@miragon/mcp-toolkit-core"
import { LayoutBuilder, type LayoutBuilderProps } from "./layout-builder.js"
import { WidgetRenderer, type WidgetComponent } from "./widget-renderer.js"

export interface McpAppViewLabels {
  loading?: string
  refresh?: string
  refreshing?: string
  enterFullscreen?: string
  exitFullscreen?: string
  build?: string
}

export const DEFAULT_LABELS: Required<McpAppViewLabels> = {
  loading: "Waiting for pipeline result...",
  refresh: "Refresh",
  refreshing: "Loading...",
  enterFullscreen: "Fullscreen",
  exitFullscreen: "Collapse",
  build: "Build",
}

export interface RefreshParams {
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  layout?: LayoutConfig
  title?: string
}

export interface ViewData {
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
export function isCompleteViewData(value: unknown): value is ViewData {
  const v = value as ViewData | null | undefined
  return Boolean(v?.context && v?.layout)
}

// -------------------------------------------------------------------------- //
// Toolbar
// -------------------------------------------------------------------------- //

export interface ViewToolbarProps {
  /** The toolbar hides entirely while build mode owns the surface. */
  hidden: boolean
  viewData: ViewData
  builderAvailable: boolean
  isFullscreen: boolean
  isRefreshing: boolean
  labels: Required<McpAppViewLabels>
  onRefresh: () => Promise<void>
  onEnterBuildMode: () => void
  onToggleFullscreen: () => Promise<void>
}

export function ViewToolbar({
  hidden,
  viewData,
  builderAvailable,
  isFullscreen,
  isRefreshing,
  labels,
  onRefresh,
  onEnterBuildMode,
  onToggleFullscreen,
}: ViewToolbarProps) {
  if (hidden) return null
  return (
    <div className="mb-4 flex items-center justify-between">
      {viewData.title && <h2 className="text-xl font-bold">{viewData.title}</h2>}
      <div className="ml-auto flex items-center gap-2">
        {viewData._refreshParams && viewData.layout && (
          <button
            onClick={() => {
              void onRefresh()
            }}
            disabled={isRefreshing}
            className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? labels.refreshing : labels.refresh}
          </button>
        )}
        {builderAvailable && viewData._refreshParams && (
          <button
            onClick={onEnterBuildMode}
            className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Pencil className="h-4 w-4" />
            {labels.build}
          </button>
        )}
        <button
          onClick={() => {
            void onToggleFullscreen()
          }}
          className="hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          {isFullscreen ? (
            <Minimize2 aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Maximize2 aria-hidden="true" className="h-4 w-4" />
          )}
          {isFullscreen ? labels.exitFullscreen : labels.enterFullscreen}
        </button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Pipeline error list
// -------------------------------------------------------------------------- //

export function StepErrors({
  hidden,
  errors,
}: {
  /** Build mode surfaces its own diagnostics; the shell list hides. */
  hidden: boolean
  errors: ViewData["context"]["errors"]
}) {
  if (hidden || errors.length === 0) return null
  return (
    <div className="mb-4 flex flex-col gap-2">
      {errors.map((err) => (
        <div key={err.stepId} className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          <strong>{err.stepId}:</strong> {err.reason}
        </div>
      ))}
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Body: LayoutBuilder in build mode, WidgetRenderer otherwise
// -------------------------------------------------------------------------- //

export interface ViewBodyProps {
  buildMode: boolean
  viewData: ViewData
  widgets: Record<string, WidgetComponent>
  callTool: (name: string, args: object) => Promise<unknown>
  onExit: LayoutBuilderProps["onExit"]
}

export function ViewBody({ buildMode, viewData, widgets, callTool, onExit }: ViewBodyProps) {
  if (buildMode) {
    return (
      <LayoutBuilder
        initialLayout={viewData.layout}
        title={viewData.title}
        initialKeys={viewData._refreshParams?.keys}
        initialSteps={viewData._refreshParams?.steps}
        widgets={widgets}
        callTool={callTool}
        onExit={onExit}
      />
    )
  }
  if (!viewData.layout) return null
  return (
    <WidgetRenderer
      layout={viewData.layout}
      keys={viewData.context.keys}
      stepData={viewData.context.stepData}
      errors={viewData.context.errors}
      widgets={widgets}
    />
  )
}
