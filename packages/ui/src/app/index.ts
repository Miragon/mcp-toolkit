export { McpAppView } from "./mcp-app-view.js"
export type { McpAppViewProps, McpAppViewLabels } from "./mcp-app-view.js"
export { McpToolkitApp, mountMcpToolkitApp } from "./mcp-toolkit-app.js"
export {
  WidgetRenderer,
  WidgetErrorBoundary,
  RenderedWidget,
  contextHasNoData,
} from "./widget-renderer.js"
export type { WidgetRendererProps, WidgetComponent } from "./widget-renderer.js"
export { LayoutBuilder } from "./layout-builder.js"
export type { LayoutBuilderProps, LayoutBuilderLabels } from "./layout-builder.js"

// App-level value modules that import `mcp-use/react` (ModelContext, the 2.x
// view hooks) — exported from this subpath only, never the root barrel.
export { adaptDataWidget } from "./adapt-data-widget.js"
export type { DescribeForModel } from "./adapt-data-widget.js"
export { useHostActions, buildShowWidgetIntent } from "./use-host-actions.js"
export type { HostActions } from "./use-host-actions.js"

// Host-portability bridge: the seam that lets the same hand-built widget run in
// our mcp-use host, ChatGPT (Apps SDK), or a standalone web app against an
// existing MCP server. Lives under ./app because the mcp-use adapter imports
// `mcp-use/react` — never the root barrel.
export {
  HostBridgeProvider,
  useHostBridge,
  useHostBridgeOrNull,
  toHostBridge,
  createChatGptHostBridge,
  createStandaloneHostBridge,
} from "./host-bridge.js"
export type {
  HostBridge,
  McpUseWidgetSurface,
  OpenAiAppsSdk,
  StandaloneHostBridgeOptions,
} from "./host-bridge.js"
export { McpUseHostBridgeProvider, useIsInsideMcpUseView } from "./mcp-use-host-bridge.js"

// Storybook-style harness for developing widgets in isolation with fixture
// data and a simulated HostBridge. Lives under ./app to keep every host-facing
// surface on one subpath — never the root barrel.
export {
  WidgetFixtureHost,
  FixtureCallToolRegistry,
  buildFixtureWidgetProps,
  useFixtureHost,
} from "./widget-fixture.js"
export type {
  WidgetFixtureHostProps,
  FixtureWidget,
  FixtureToolEntry,
  FixtureToolResult,
  HostActionLog,
} from "./widget-fixture.js"
