import type { LayoutConfig } from "../framework/layout-types.js"
import type { PipelineStepRef } from "./pipeline.js"

/**
 * Per-step slice of a view's `structuredContent`. Each entry carries the
 * step's `data` payload plus the routing fields the browser-side
 * `adaptDataWidget` reads to pick the right widget component:
 *   - `_app` — the app the step (or eager builder) belongs to,
 *   - `_dataType` — the data type the widget is registered against.
 *
 * Both routing fields are optional because not every producer sets them
 * (e.g. a bare key-only view), but the view builders and `render-view`
 * always populate them for real widget data.
 */
export interface StepDataEntry {
  data: unknown
  keys: Record<string, unknown>
  _app?: string
  _dataType?: string
}

/**
 * The view input echoed back so the in-iframe refresh button can re-issue the
 * exact same `render-view` call. Only `render-view` emits this; the eager view
 * builders omit it (their callers re-run the originating `*_show_*` tool).
 */
export interface RefreshParams {
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  layout: LayoutConfig
  title?: string
}

/**
 * The `structuredContent` envelope a view tool returns. This is the wire
 * contract between the producers — `render-view` and the eager
 * `view-builders` (`buildSingleWidgetView` / `buildComposedView`) — and the
 * `McpAppView` shell / `adaptDataWidget` in `@miragon/mcp-toolkit-ui` that
 * consumes it. The text channel carries only a short model-facing summary; the
 * full payload lives here.
 *
 * Optional fields reflect which producer emitted the envelope: `render-view`
 * sets `_refreshParams` and `remoteWidgets`, while the eager view builders
 * leave both out.
 */
export interface ViewStructuredContent {
  // Index signature: the MCP SDK types a tool result's `structuredContent` as
  // an open `Record<string, unknown>`. Declaring it keeps this envelope
  // assignable to that contract (a plain `interface` lacks the implicit index
  // signature) while the named fields below stay documented and type-checked.
  [key: string]: unknown
  _refreshParams?: RefreshParams
  title?: string
  context: {
    keys: Record<string, unknown>
    stepIds: string[]
    stepData: Record<string, StepDataEntry>
    errors: { stepId: string; reason: string }[]
  }
  layout: LayoutConfig
  remoteWidgets?: Record<string, { bundle: string; moduleId: string }>
  /**
   * Whether the in-iframe visual builder is actually usable on this server —
   * i.e. `app.builder` is enabled and the app-only `get-builder-catalogue`
   * tool is registered. `render-view` derives it from `createFrameworkApp`'s
   * `app.builder` and the `McpAppView` shell gates its Build/edit affordance
   * on it, so the button never appears against a server that can't service it.
   * Absent on payloads from the eager view builders (which don't run the
   * builder platform).
   */
  builderAvailable?: boolean
}
