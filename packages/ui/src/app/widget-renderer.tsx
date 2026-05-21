import { Component, type ComponentType, type ReactNode, type ErrorInfo } from "react"
import type { LayoutConfig, PipelineContext, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { normalizeLayout } from "@miragon/mcp-toolkit-core"
import { GridLayout, GridItem } from "../components/GridLayout.js"
import { Card, CardContent } from "../primitives/card.js"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../primitives/tabs.js"

export type WidgetComponent = ComponentType<WidgetProps>

class WidgetErrorBoundary extends Component<
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
            if (!WidgetComponent) return null
            // Use a composite key so the same widget can appear in multiple
            // cells of one row (e.g. side-by-side scoped dashboards) without
            // colliding on React's reconciliation key.
            return (
              <GridItem key={`${cell.widget}-${cellIdx}`} span={cell.span ?? 12}>
                <WidgetErrorBoundary widgetId={cell.widget}>
                  <WidgetComponent {...props} widgetProps={cell.props} />
                </WidgetErrorBoundary>
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
