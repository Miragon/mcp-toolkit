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
 * Fields shared by every widget regardless of where its code lives. Internal
 * helper — consumers always work with the {@link WidgetDefinition} union.
 */
interface WidgetDefinitionBase {
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

/**
 * Widget whose React component is baked into the host's app-bundle at build
 * time. The framework looks the component up in the `widgets` map passed to
 * `McpAppView` — no resource read at render time.
 */
export interface LocalWidgetDefinition extends WidgetDefinitionBase {
  bundle?: undefined
  moduleId?: undefined
  hostWidget?: undefined
}

/**
 * Widget served as a compiled ESM bundle by an upstream MCP server. At
 * render time the browser-side widget loader reads `bundle` via the
 * upstream identified by `moduleId` and dynamically imports it.
 */
export interface RemoteWidgetDefinition extends WidgetDefinitionBase {
  /** MCP resource URI the upstream serves the widget's ESM bundle under. */
  bundle: string
  /**
   * Module ID that contributed this widget. Mirrors the namespace prefix
   * on `id`. Used by render-view to route the bundle fetch to the right
   * upstream proxy.
   */
  moduleId: string
  hostWidget?: undefined
}

/**
 * Widget contributed by an upstream module as an ALIAS onto a host-bundled
 * widget: no bundle, no resource read — render the host component identified
 * by `hostWidget` with `presetProps` merged under the layout cell's props.
 */
export interface HostAliasWidgetDefinition extends WidgetDefinitionBase {
  bundle?: undefined
  /** Module that contributed this alias (namespace prefix of `id`). */
  moduleId: string
  /** Id of the host-registered (local) widget this alias renders. */
  hostWidget: string
  /** Preset props from the manifest; layout-cell props override key-by-key. */
  presetProps?: Record<string, unknown>
}

/**
 * A {@link LocalWidgetDefinition}, a {@link RemoteWidgetDefinition}, or a
 * {@link HostAliasWidgetDefinition}. Use the {@link isRemoteWidget} /
 * {@link isHostAliasWidget} type guards to narrow when iterating.
 */
export type WidgetDefinition =
  LocalWidgetDefinition | RemoteWidgetDefinition | HostAliasWidgetDefinition

/**
 * Type-guard: true iff the widget's code lives on an upstream MCP server and
 * must be loaded through `read-widget-bundle` at render time. Checks both
 * fields the type contract claims so downstream code (`render-view`,
 * `read-widget-bundle`) can safely read `widget.moduleId` after the narrow.
 * Host-alias widgets carry a `moduleId` but no `bundle`, so they are `false`.
 */
export function isRemoteWidget(widget: WidgetDefinition): widget is RemoteWidgetDefinition {
  return typeof widget.bundle === "string" && typeof widget.moduleId === "string"
}

/**
 * Type-guard: true iff the widget is an upstream-contributed alias onto a
 * host-bundled widget (see {@link HostAliasWidgetDefinition}). Downstream
 * code can safely read `widget.hostWidget` / `widget.presetProps` after the
 * narrow.
 */
export function isHostAliasWidget(widget: WidgetDefinition): widget is HostAliasWidgetDefinition {
  return typeof widget.hostWidget === "string"
}
