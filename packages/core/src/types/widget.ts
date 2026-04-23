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
  /**
   * Optional MCP resource URI the widget's compiled ESM bundle can be
   * fetched from. Present only on widgets registered via an upstream
   * module manifest (Phase 3 remote loading); local widgets leave it
   * unset and stay baked into the app-bundle at build time.
   */
  bundle?: string
  /**
   * Module ID that contributed this widget. Mirrors the namespace prefix
   * on `id`. Used by render-view to tell the app-bundle which upstream
   * the bundle lives on so the browser-side loader can route the resource
   * read to the right proxy.
   */
  moduleId?: string
}
