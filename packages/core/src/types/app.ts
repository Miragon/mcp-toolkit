import type { PipelineStepDefinition } from "./step.js"
import type { WidgetDefinition } from "./widget.js"

export interface AppDefinition {
  name: string
  // Each step is generic in its own appConfig shape and the array is
  // heterogeneous, so `any` is the pragmatic escape from TS's invariant
  // treatment of `PipelineStepDefinition<TConfig>`. The executor narrows back
  // to `unknown` at the call site via `bindAppConfig`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: PipelineStepDefinition<any>[]
  widgets: WidgetDefinition[]
}

/**
 * An AppPlugin bundles everything an app contributes to the framework:
 * - The AppDefinition (steps + widgets)
 * - Optional functions to register domain tools and widget tools on an MCP server
 *
 * The server type is generic so consumers can pass the concrete `MCPServer`
 * type from `mcp-use/server` without the toolkit itself having to import from
 * `mcp-use`. This keeps the core barrel free of mcp-use type dependencies,
 * which avoids transitive type leaks (hono versions, langchain chunks, etc.)
 * when the pre-built core `dist/` is shared between projects with diverging
 * peer dep resolutions.
 *
 * Each app exports a `createPlugin(config)` factory that returns an
 * `AppPlugin<MCPServer>`.
 */
export interface AppPlugin<TServer = unknown> {
  definition: AppDefinition
  appConfig?: Record<string, unknown>
  /**
   * Name of an `UpstreamProxyPlugin` this plugin is bound to. When set,
   * `buildProxyAppConfigs()` (from `@miragon/mcp-toolkit-tool-codegen`)
   * injects a typed `callTool` closure into this plugin's `appConfig` at
   * boot, so pipeline steps can dispatch tool calls against the upstream
   * MCP without knowing about the proxy plumbing.
   *
   * UI-only modules typically set this and omit `registerTools` entirely —
   * the upstream's tools are already federated via the proxy.
   */
  proxyBinding?: string
  registerTools?: (server: TServer) => void
  registerWidgetTools?: (server: TServer, resourceUri: string) => void
}
