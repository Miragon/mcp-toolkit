import { Component, type ComponentType, type ReactNode, type ErrorInfo } from "react"
import type { LayoutConfig, PipelineContext, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { normalizeLayout } from "@miragon/mcp-toolkit-core"
import { GridLayout, GridItem } from "../components/GridLayout.js"
import { Card, CardContent } from "../primitives/card.js"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../primitives/tabs.js"

export type WidgetComponent = ComponentType<WidgetProps>

/**
 * Catches render-time crashes from a single widget so one broken widget
 * can't take down the entire iframe view (or the builder canvas/preview).
 *
 * Exported so the visual builder's canvas + preview render sites reuse the
 * same isolation the rendered `WidgetRenderer` already had — every place a
 * widget component is rendered goes through {@link RenderedWidget}, which
 * wraps the component in this boundary.
 */
export class WidgetErrorBoundary extends Component<
  { widgetId: string; children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Widget ${this.props.widgetId} crashed:`, error, info)
  }
  override render() {
    if (this.state.error) {
      return (
        <Card>
          <CardContent className="text-muted-foreground py-3 text-sm">
            Widget "{this.props.widgetId}" failed to render.
          </CardContent>
        </Card>
      )
    }
    return this.props.children
  }
}

/**
 * True when the pipeline context carries no widget data at all — no step
 * results and no keys. A widget rendered against an empty context typically
 * paints an empty shell (Finding [4]); callers use this to swap in a
 * "data appears after refresh" hint instead.
 *
 * Intentionally coarse (per-view, not per-widget): the toolkit can't know
 * which slice each widget reads without running its adapter, so it only
 * degrades when there is provably nothing for any widget to show.
 */
export function contextHasNoData(context: PipelineContext): boolean {
  return Object.keys(context.steps).length === 0 && Object.keys(context.keys).length === 0
}

/**
 * Merges manifest preset props under layout-cell props. Cell wins key-by-key.
 * Returns undefined when both are absent so adapters keep seeing `widgetProps`
 * exactly as before for non-alias widgets.
 */
export function mergeAliasProps(
  preset?: Record<string, unknown>,
  cell?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!preset && !cell) return undefined
  return { ...preset, ...cell }
}

/**
 * Wraps a host widget so an upstream alias renders it with preset props merged
 * under cell props. {@link RenderedWidget} passes the layout cell's `props` as
 * `widgetProps`, so the wrapper sees them on `props.widgetProps` — precedence
 * layout cell > manifest preset holds.
 */
export function createAliasWidget(
  Target: WidgetComponent,
  presetProps?: Record<string, unknown>,
): WidgetComponent {
  return function AliasWidget(props: WidgetProps) {
    return <Target {...props} widgetProps={mergeAliasProps(presetProps, props.widgetProps)} />
  }
}

/**
 * Resolves a host-alias manifest (`{ aliasId → { hostWidget, presetProps? } }`)
 * against the host bundle's widget map into renderable components via
 * {@link createAliasWidget}.
 *
 * Fail-soft: server-side validation guarantees each alias targets a registered
 * local widget, but the browser bundle map can still lack the component. An
 * unresolvable target logs a warning and skips that alias (the cell then
 * renders like any unbundled widget) — it never throws.
 */
export function resolveAliasComponents(
  aliasManifest: Record<string, { hostWidget: string; presetProps?: Record<string, unknown> }>,
  widgets: Record<string, WidgetComponent>,
): Record<string, WidgetComponent> {
  const out: Record<string, WidgetComponent> = {}
  for (const [id, info] of Object.entries(aliasManifest)) {
    const target = widgets[info.hostWidget]
    if (!target) {
      console.warn(
        `[mcp-toolkit] alias widget "${id}" targets "${info.hostWidget}", which is not in the host bundle — skipping.`,
      )
      continue
    }
    out[id] = createAliasWidget(target, info.presetProps)
  }
  return out
}

/**
 * The single render site for a layout cell's widget, shared across the
 * rendered view (`RowsRenderer`), the builder canvas, and the builder
 * preview so all three isolate crashes identically:
 *   - missing component → "not bundled" fallback,
 *   - render crash → caught by {@link WidgetErrorBoundary} (Finding [1]),
 *   - (builder only, opt-in) empty pipeline context → a dezent
 *     "no data yet" hint (Finding [4]).
 *
 * The empty-state hint is gated behind `showEmptyHint` and defaults off so
 * the shipped rendered view is unchanged: self-fetching control widgets
 * there render correctly against an empty key-only context. The builder's
 * canvas/preview opt in because their live context is empty until the first
 * catalogue refresh resolves, and an empty widget shell reads as broken.
 *
 * `notBundledClassName` lets each surface match its own chrome (the builder
 * uses denser padding/text than the rendered view).
 */
export function RenderedWidget({
  widget: Widget,
  widgetId,
  props,
  cellProps,
  showEmptyHint = false,
  notBundledClassName = "text-muted-foreground rounded border border-dashed p-4 text-center text-xs",
}: {
  widget: WidgetComponent | undefined
  widgetId: string
  props: WidgetProps
  cellProps?: Record<string, unknown>
  showEmptyHint?: boolean
  notBundledClassName?: string
}) {
  if (!Widget) {
    return <div className={notBundledClassName}>Widget "{widgetId}" not bundled.</div>
  }
  if (showEmptyHint && contextHasNoData(props.context)) {
    return (
      <div className={notBundledClassName}>
        No data for this widget yet — it appears after a refresh.
      </div>
    )
  }
  return (
    <WidgetErrorBoundary widgetId={widgetId}>
      <Widget {...props} widgetProps={cellProps} />
    </WidgetErrorBoundary>
  )
}

export interface WidgetRendererProps {
  layout: LayoutConfig
  keys: Record<string, unknown>
  stepData?: Record<
    string,
    { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
  >
  errors: { stepId: string; reason: string }[]
  /**
   * Map of widget ID to React component. Consumers provide this so that the
   * renderer can dispatch layout entries like `{widget: "camunda7:incident-panel"}`
   * to the concrete component. The map is usually aggregated from each module's
   * widget exports at the consumer's `main.tsx` entry point.
   */
  widgets: Record<string, WidgetComponent>
}

function RowsRenderer({
  rows,
  props,
  widgets,
}: {
  rows: RowDef[]
  props: WidgetProps
  widgets: Record<string, WidgetComponent>
}) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, rowIdx) => (
        <GridLayout key={rowIdx}>
          {row.row.map((cell, cellIdx) => {
            const WidgetComponent = widgets[cell.widget]
            // Keep the rendered view's original behaviour of skipping cells
            // whose component isn't bundled (no placeholder in the shipped
            // view), while still routing the resolvable ones through the
            // shared `RenderedWidget` for error-boundary + empty-state.
            if (!WidgetComponent) return null
            // Use a composite key so the same widget can appear in multiple
            // cells of one row (e.g. side-by-side scoped dashboards) without
            // colliding on React's reconciliation key.
            return (
              <GridItem key={`${cell.widget}-${cellIdx}`} span={cell.span ?? 12}>
                <RenderedWidget
                  widget={WidgetComponent}
                  widgetId={cell.widget}
                  props={props}
                  cellProps={cell.props}
                />
              </GridItem>
            )
          })}
        </GridLayout>
      ))}
    </div>
  )
}

export function WidgetRenderer({ layout, keys, stepData, errors, widgets }: WidgetRendererProps) {
  const steps: Record<string, PipelineContext["steps"][string]> = {}
  if (stepData) {
    for (const [id, result] of Object.entries(stepData)) {
      steps[id] = { ...result, _step: id }
    }
  }
  const pipelineContext: PipelineContext = {
    steps,
    keys,
    errors,
  }
  const widgetProps: WidgetProps = { keys, context: pipelineContext }
  const normalized = normalizeLayout(layout)

  if ("tabs" in normalized) {
    return (
      <Tabs defaultValue={normalized.tabs[0]?.label}>
        <TabsList>
          {normalized.tabs.map((tab) => (
            <TabsTrigger key={tab.label} value={tab.label}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {normalized.tabs.map((tab) => (
          <TabsContent key={tab.label} value={tab.label}>
            <RowsRenderer rows={tab.rows} props={widgetProps} widgets={widgets} />
          </TabsContent>
        ))}
      </Tabs>
    )
  }

  return <RowsRenderer rows={normalized.rows} props={widgetProps} widgets={widgets} />
}
