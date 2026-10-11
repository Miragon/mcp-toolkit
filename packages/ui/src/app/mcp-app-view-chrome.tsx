/**
 * Presentational chrome for `McpAppView` — the toolbar, the failed-steps
 * alert, and the build/render body — plus the view-envelope types they share.
 * The pre-payload states (waiting / error / cancelled) live in
 * `mcp-app-view-states.tsx`. Split out of `mcp-app-view.tsx` so the shell
 * component keeps only the host-sync and state logic while these files stay
 * hook-light.
 */
import { createElement, type ReactNode } from "react"
import { LucideProvider, Maximize2, Minimize2, Pencil, RefreshCw } from "lucide-react"
import type { LayoutConfig, PipelineStepRef } from "@miragon/mcp-toolkit-core"
import { ErrorState } from "../components/ErrorState.js"
import { DENSE_ICON_STROKE } from "../lib/icon-stroke.js"
import { TOOLKIT_MESSAGES, type ViewMessages } from "../locale/toolkit-messages.js"
import { Button } from "../primitives/button.js"
import {
  LayoutBuilder,
  type LayoutBuilderLabels,
  type LayoutBuilderProps,
} from "./layout-builder.js"
import { WidgetRenderer, type WidgetComponent } from "./widget-renderer.js"

/**
 * Override strings of the view chrome (placeholder, error state, toolbar,
 * step errors). Every field defaults to the active locale's toolkit catalog
 * (`en`/`de`, see `useToolkitMessages`).
 */
export type McpAppViewLabels = Partial<ViewMessages>

/**
 * English chrome strings.
 * @deprecated Read the active locale's strings with `useToolkitMessages().view`
 * (or `TOOLKIT_MESSAGES.en.view`); this alias stays for existing imports.
 */
export const DEFAULT_LABELS: Required<McpAppViewLabels> = TOOLKIT_MESSAGES.en.view

/** How the toolbar shows the view title — so a view has exactly ONE title. */
export type ViewTitleMode = "show" | "hide" | "slot"

/** Heading level of the toolbar title. */
export type ViewTitleLevel = 1 | 2 | 3 | 4 | 5 | 6

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

/** What the LayoutBuilder hands back on Apply. */
export interface BuilderCommit {
  layout: LayoutConfig
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  title?: string
  context?: ViewData["context"]
}

/**
 * Commit the builder's draft into the view payload so the renderer shows the
 * just-built layout and Refresh re-issues it. Exported for tests.
 */
export function applyBuilderCommit(prev: ViewData, commit: BuilderCommit): ViewData {
  const title = commit.title ?? prev.title
  return {
    ...prev,
    layout: commit.layout,
    title,
    context: commit.context ?? prev.context,
    _refreshParams: { keys: commit.keys, steps: commit.steps, layout: commit.layout, title },
  }
}

/**
 * Whether the Fullscreen toggle may render: the host offers fullscreen
 * (mcp-use's negotiated `availableDisplayModes`, toolkit#178 K22), or the view
 * is already there (its exit toggle must stay).
 */
export function fullscreenAvailable(
  displayMode: string,
  availableDisplayModes: readonly string[],
): boolean {
  return displayMode === "fullscreen" || availableDisplayModes.includes("fullscreen")
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
  /** The host offers fullscreen (see {@link fullscreenAvailable}). */
  canFullscreen: boolean
  isRefreshing: boolean
  labels: Required<McpAppViewLabels>
  titleMode: ViewTitleMode
  titleLevel: ViewTitleLevel
  renderTitle?: (title: string | undefined) => ReactNode
  onRefresh: () => Promise<void>
  onEnterBuildMode: () => void
  onToggleFullscreen: () => Promise<void>
  /**
   * The pre-formatted time of a view that loaded its data again on its own
   * (toolkit#176 N23): the toolbar stamps it, so the figures read as live
   * data of that time, not the result the chat answered from.
   */
  dataAsOf?: string
}

/** The toolbar title per {@link ViewTitleMode}: a heading, the consumer's slot, or nothing. */
function ToolbarTitle({
  title,
  mode,
  level,
  renderTitle,
}: {
  title: string | undefined
  mode: ViewTitleMode
  level: ViewTitleLevel
  renderTitle?: (title: string | undefined) => ReactNode
}) {
  if (mode === "slot") return <div className="min-w-0 flex-1">{renderTitle?.(title)}</div>
  if (mode === "hide" || !title) return null
  return createElement(
    `h${level}`,
    { className: "min-w-0 flex-1 truncate text-lg font-semibold tracking-tight" },
    title,
  )
}

/** Which toolbar controls render — pure, so the gates are unit-testable. */
export function toolbarControls(input: {
  viewData: Pick<ViewData, "_refreshParams" | "layout" | "title">
  builderAvailable: boolean
  canFullscreen: boolean
  titleMode: ViewTitleMode
}): { title: boolean; refresh: boolean; edit: boolean; fullscreen: boolean; any: boolean } {
  const refreshable = Boolean(input.viewData._refreshParams && input.viewData.layout)
  const edit = input.builderAvailable && Boolean(input.viewData._refreshParams)
  const title =
    input.titleMode === "slot" || (input.titleMode === "show" && Boolean(input.viewData.title))
  return {
    title,
    refresh: refreshable,
    edit,
    fullscreen: input.canFullscreen,
    any: title || refreshable || edit || input.canFullscreen,
  }
}

/**
 * The CI §8 chrome button (Icon-Button, Chrome): surface, `--cd-linie` border,
 * shadow-1, blue on hover. The `outline` variant brings the surface, the
 * border and the blue hover (it is also CI §8's secondary button, which has no
 * shadow), so the chrome adds `shadow-1` on top instead of changing it.
 */
const CHROME_BUTTON = { variant: "outline", className: "shadow-1" } as const

function RefreshButton({
  isRefreshing,
  labels,
  onRefresh,
}: {
  isRefreshing: boolean
  labels: Required<McpAppViewLabels>
  onRefresh: () => Promise<void>
}) {
  const label = isRefreshing ? labels.refreshing : labels.refresh
  return (
    <Button
      type="button"
      {...CHROME_BUTTON}
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={isRefreshing}
      onClick={() => {
        void onRefresh()
      }}
    >
      <RefreshCw
        aria-hidden="true"
        className={isRefreshing ? "motion-safe:animate-spin" : undefined}
      />
    </Button>
  )
}

function FullscreenButton({
  isFullscreen,
  labels,
  onToggle,
}: {
  isFullscreen: boolean
  labels: Required<McpAppViewLabels>
  onToggle: () => Promise<void>
}) {
  const label = isFullscreen ? labels.exitFullscreen : labels.enterFullscreen
  const Icon = isFullscreen ? Minimize2 : Maximize2
  return (
    <Button
      type="button"
      {...CHROME_BUTTON}
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => {
        void onToggle()
      }}
    >
      <Icon aria-hidden="true" />
    </Button>
  )
}

/**
 * The view toolbar: the title (per {@link ViewTitleMode}, so a widget that
 * renders its own heading is not titled twice), then Edit, Refresh and
 * Fullscreen. Refresh and Fullscreen are 32 px icon buttons named by
 * `aria-label`; Fullscreen renders only when the host offers it. All three are
 * chrome buttons in the CI pattern (CI §8: surface, border, shadow-1, blue
 * hover; {@link CHROME_BUTTON}). A 16 px inset keeps the bar off the frame
 * edge, also in fullscreen.
 */
export function ViewToolbar({
  hidden,
  viewData,
  builderAvailable,
  isFullscreen,
  canFullscreen,
  isRefreshing,
  labels,
  titleMode,
  titleLevel,
  renderTitle,
  onRefresh,
  onEnterBuildMode,
  onToggleFullscreen,
  dataAsOf,
}: ViewToolbarProps) {
  const show = toolbarControls({ viewData, builderAvailable, canFullscreen, titleMode })
  if (hidden || (!show.any && !dataAsOf)) return null
  return (
    <LucideProvider strokeWidth={DENSE_ICON_STROKE}>
      <div data-slot="view-toolbar" className="flex min-h-12 items-center gap-2 px-4 py-2">
        <ToolbarTitle
          title={viewData.title}
          mode={titleMode}
          level={titleLevel}
          renderTitle={renderTitle}
        />
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {dataAsOf && (
            <p
              data-slot="view-data-as-of"
              className="text-muted-foreground mr-1 truncate text-sm"
              title={labels.dataAsOfHint}
            >
              {labels.dataAsOf(dataAsOf)}
              <span className="sr-only"> {labels.dataAsOfHint}</span>
            </p>
          )}
          {show.edit && (
            <Button
              type="button"
              {...CHROME_BUTTON}
              size="sm"
              data-slot="view-edit"
              onClick={onEnterBuildMode}
            >
              <Pencil aria-hidden="true" />
              {labels.build}
            </Button>
          )}
          {show.refresh && (
            <RefreshButton isRefreshing={isRefreshing} labels={labels} onRefresh={onRefresh} />
          )}
          {show.fullscreen && (
            <FullscreenButton
              isFullscreen={isFullscreen}
              labels={labels}
              onToggle={onToggleFullscreen}
            />
          )}
        </div>
      </div>
    </LucideProvider>
  )
}

// -------------------------------------------------------------------------- //
// Failed data steps
// -------------------------------------------------------------------------- //

/** Resolves a human title for a pipeline step (`{ id, step }` from the view's steps). */
export type DescribeStep = (step: { id: string; step?: string }) => string | undefined

/**
 * The failed data steps as ONE inline alert: what happened (the title), which
 * data is affected (each step by its human title, else its step id), what you
 * can do (retry, or ask in the chat when the view cannot refresh). The raw
 * step reasons stay under "Details", out of the user copy.
 */
export function StepErrors({
  hidden,
  errors,
  steps,
  labels,
  describeStep,
  onRetry,
}: {
  /** Build mode surfaces its own diagnostics; the shell alert hides. */
  hidden: boolean
  errors: ViewData["context"]["errors"]
  /** The view's step refs (`_refreshParams.steps`), to name a failed step by its definition. */
  steps?: PipelineStepRef[]
  labels: Required<McpAppViewLabels>
  describeStep?: DescribeStep
  /** Re-runs the view (a refresh); omitted when the view cannot be refreshed. */
  onRetry?: () => void
}) {
  if (hidden || errors.length === 0) return null
  const failed = errors.map((err) => {
    const ref = { id: err.stepId, step: steps?.find((s) => s.id === err.stepId)?.step }
    return { ref, human: describeStep?.(ref), reason: err.reason }
  })
  return (
    <div className="px-4 pb-4">
      <ErrorState
        variant="inline"
        title={labels.stepErrorsTitle}
        retryLabel={labels.retry}
        onRetry={onRetry}
        detailsLabel={labels.errorDetails}
        details={failed.map(({ ref, reason }) => `${ref.step ?? ref.id}: ${reason}`).join("\n")}
        description={
          <>
            <ul className="flex flex-col gap-1">
              {failed.map(({ ref, human }) => (
                <li key={ref.id} className="break-words">
                  {human ? (
                    <span className="font-medium">{human}</span>
                  ) : (
                    <span className="text-small font-mono">{ref.step ?? ref.id}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-1">{onRetry ? labels.stepErrorsHint : labels.errorHintNoRetry}</p>
          </>
        }
      />
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
  builderLabels?: LayoutBuilderLabels
}

export function ViewBody({
  buildMode,
  viewData,
  widgets,
  callTool,
  onExit,
  builderLabels,
}: ViewBodyProps) {
  if (buildMode) {
    return (
      <LayoutBuilder
        initialLayout={viewData.layout}
        title={viewData.title}
        initialKeys={viewData._refreshParams?.keys}
        initialSteps={viewData._refreshParams?.steps}
        widgets={widgets}
        callTool={callTool}
        labels={builderLabels}
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
