import type { PipelineContext } from "./context.js"

export interface WidgetProps {
  keys: Record<string, unknown>
  context: PipelineContext
}

export type WidgetSize = "quarter" | "third" | "half" | "full" | "header"

export interface WidgetDefinition {
  id: string
  /**
   * Keys that must be present in the pipeline context for this widget to render.
   * e.g. ["lexoffice:invoice"] or ["camunda7:instance", "camunda7:activityTree"]
   * Widgets read their data from the keys map passed via WidgetProps.
   */
  requires: string[]
  size: WidgetSize
}
