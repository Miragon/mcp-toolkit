import type { LayoutConfig } from "./layout-types.js"
import type { ViewStructuredContent } from "../types/view-data.js"

export interface SingleWidgetViewInput {
  widget: string
  app: string
  dataType: string
  data: unknown
  title?: string
  /**
   * Short model-facing summary emitted on the text channel (1-2 sentences,
   * e.g. "Process list: 12 definitions matching ..."). The full data payload
   * lives only in `structuredContent` — never put bulky data (BPMN XML, row
   * arrays) in the summary. Falls back to a generic one-liner derived from
   * the widget type and an item count when omitted.
   */
  summary?: string
}

export interface ComposedViewEntry {
  /** Stable id used as the step result key (must be unique within the view). */
  id?: string
  /** Step `_dataType` widgets resolve through `adaptDataWidget`. */
  dataType: string
  /** Eager data payload — same shape the matching widget expects. */
  data: unknown
}

export interface ComposedViewInput {
  app: string
  layout: LayoutConfig
  entries: ComposedViewEntry[]
  title?: string
  /** Same contract as {@link SingleWidgetViewInput.summary}. */
  summary?: string
}

/** Shape both view builders return — the `McpAppView` envelope plus a summary. */
export interface ViewToolResult {
  content: { type: "text"; text: string }[]
  structuredContent: ViewStructuredContent
}

/**
 * Best-effort item count for the generic fallback summary: array length or a
 * conventional `totalCount`/`total` field. Returns null when not derivable.
 */
export function deriveItemCount(data: unknown): number | null {
  if (Array.isArray(data)) return data.length
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>
    if (typeof d.totalCount === "number") return d.totalCount
    if (typeof d.total === "number") return d.total
  }
  return null
}

/**
 * Generic model-facing summary used when a caller omits `summary`. Names the
 * view (its `title`, or the widget ids) and appends a derivable item count.
 */
export function defaultSummary(widgets: string[], data: unknown, title?: string): string {
  const label = title ?? widgets.join(", ")
  const count = deriveItemCount(data)
  const countSuffix = count === null ? "" : ` (${count} item${count === 1 ? "" : "s"})`
  return `Rendered widget "${label}"${countSuffix}. Full data is shown in the widget.`
}

/** Widget ids across all three LayoutConfig variants (rows array, rows object, tabs). */
export function collectLayoutWidgets(layout: LayoutConfig): string[] {
  const rows = Array.isArray(layout)
    ? layout
    : "rows" in layout
      ? layout.rows
      : layout.tabs.flatMap((tab) => tab.rows)
  return rows.flatMap((row) => row.row.map((cell) => cell.widget))
}

/**
 * Multi-widget variant of {@link buildSingleWidgetView}. Lets `*_show_*` tools
 * compose several small widgets into a layout while keeping the eager
 * (no-pipeline) execution model: each widget resolves its slice through
 * `adaptDataWidget` by `_dataType`. Widgets that share a `dataType` all
 * receive the same data object and are expected to render their own slice.
 *
 * The text channel carries only the model-facing `summary`; the data payload
 * lives in `structuredContent.context.stepData`. In-widget refresh callers
 * must therefore parse results structuredContent-first (the toolkit's
 * text-first `useToolQuery` would only see the summary string).
 */
export function buildComposedView(input: ComposedViewInput): ViewToolResult {
  const stepData: Record<string, ViewStructuredContent["context"]["stepData"][string]> = {}
  const stepIds: string[] = []
  for (const [idx, entry] of input.entries.entries()) {
    const id = entry.id ?? `result_${idx}`
    stepIds.push(id)
    stepData[id] = {
      data: entry.data,
      keys: {},
      _app: input.app,
      _dataType: entry.dataType,
    }
  }
  const widgets = collectLayoutWidgets(input.layout)
  const summary =
    input.summary ??
    defaultSummary(widgets, input.entries.length === 1 ? input.entries[0]!.data : null, input.title)
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: {
      title: input.title,
      context: {
        keys: {},
        stepIds,
        stepData,
        errors: [],
      },
      layout: input.layout,
    },
  }
}

/**
 * Builds an MCP tool result that renders a single widget through the same
 * `McpAppView` shell as `render-view`. Use this from `*_show_*` tools that
 * compute their data eagerly (no pipeline) — the widget data is exposed under
 * `context.stepData["result"]` with the given `_dataType`, so the registry
 * adapter (`adaptDataWidget`) can route it to the right widget component.
 *
 * The text channel carries only the model-facing `summary` (the model never
 * needs the rendered payload); the data lives in `structuredContent`.
 * In-widget refresh callers parse structuredContent-first.
 */
export function buildSingleWidgetView(input: SingleWidgetViewInput): ViewToolResult {
  const layout: LayoutConfig = [{ row: [{ widget: input.widget }] }]
  const summary = input.summary ?? defaultSummary([input.widget], input.data, input.title)
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: {
      title: input.title,
      context: {
        keys: {},
        stepIds: ["result"],
        stepData: {
          result: {
            data: input.data,
            keys: {},
            _app: input.app,
            _dataType: input.dataType,
          },
        },
        errors: [],
      },
      layout,
    },
  }
}
