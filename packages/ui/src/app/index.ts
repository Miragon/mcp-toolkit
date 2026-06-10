export { McpAppView } from "./mcp-app-view.js"
export type { McpAppViewProps, McpAppViewLabels } from "./mcp-app-view.js"
export { McpToolkitApp } from "./mcp-toolkit-app.js"
export { WidgetRenderer } from "./widget-renderer.js"
export type { WidgetRendererProps, WidgetComponent } from "./widget-renderer.js"
export { LayoutBuilder } from "./layout-builder.js"
export type { LayoutBuilderProps, LayoutBuilderLabels } from "./layout-builder.js"
export { createRemoteWidgetLoader } from "./remote-widget-loader.js"
export type {
  WidgetLoader,
  FetchResourceText,
  CreateRemoteWidgetLoaderOptions,
} from "./remote-widget-loader.js"

// App-level value modules that import `mcp-use/react` (ModelContext, useWidget)
// — exported from this subpath only, never the root barrel.
export { adaptDataWidget } from "./adapt-data-widget.js"
export type { DescribeForModel } from "./adapt-data-widget.js"
export { useHostActions, buildShowWidgetIntent } from "./use-host-actions.js"
export type { HostActions } from "./use-host-actions.js"
