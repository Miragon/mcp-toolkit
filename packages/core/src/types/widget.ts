import type { PipelineContext } from "./context.js"

export interface WidgetProps {
  keys: Record<string, unknown>
  context: PipelineContext
  /**
   * Per-instance props supplied by the layout cell (`row[].props`). Lets the
   * same widget render multiple times in one view with different scoping
   * (e.g. `{ processDefinitionKey: "miraveloLeasing" }` for a per-process tab).
   * Adapters (see `adaptDataWidget` in `packages/ui/src/app/adapt-data-widget.tsx`)
   * forward these as named props onto the underlying single-data widget.
   */
  widgetProps?: Record<string, unknown>
}

export type WidgetSize = "quarter" | "third" | "half" | "full" | "header"

/**
 * A widget the app contributes to the framework. The widget's React component
 * is baked into the host's app-bundle at build time: the framework looks it up
 * in the `widgets` map passed to `McpAppView` — no resource read at render
 * time.
 */
export interface WidgetDefinition {
  id: string
  /**
   * One-line human description of what the widget shows. Surfaced verbatim in
   * `getFrameworkManifest` so an LLM constructing a `render-view` knows what
   * to put in which slot without inferring intent from the widget id.
   */
  description?: string
  /**
   * Keys that must be present in the pipeline context for this widget to render.
   * e.g. ["lexoffice:invoice"] or ["camunda7:instance", "camunda7:activityTree"]
   * Widgets read their data from the keys map passed via WidgetProps.
   */
  requires: string[]
  /**
   * Step `dataType`s the widget can consume. Surfaces the widget→step binding
   * (which lives implicitly inside `adaptDataWidget(Widget, dataType)` in
   * `packages/ui/src/app/adapt-data-widget.tsx`) so the manifest tells an LLM
   * exactly which steps populate this widget. Empty or
   * omitted for widgets that don't read pipeline data (e.g. interactive
   * controls that drive their own fetches via `useToolQuery`).
   */
  consumes?: string[]
  size: WidgetSize
  /**
   * Optional JSON Schema describing the per-instance props the widget accepts
   * via the layout cell's `props` field. Surfaced verbatim in
   * `getFrameworkManifest` so an LLM constructing a `render-view` call can
   * discover valid props per widget without guessing — same JSON-Schema
   * contract the LLM already understands from MCP tool input schemas.
   *
   * Generate it from a Zod object with `z.toJSONSchema(schema)` so the
   * documentation lives next to the widget code.
   */
  propsSchema?: Record<string, unknown>
}
