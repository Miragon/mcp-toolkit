import type { WidgetToolMetaDefaults } from "./meta.js"
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
  /**
   * Configuration handed to this plugin's pipeline steps as their second
   * `execute` argument. May carry closures — e.g. a typed `callTool` bound to
   * the module's own store or client — which the pipeline executor rewraps
   * with the per-request user context (see `pipeline-executor.ts:bindAppConfig`).
   */
  appConfig?: Record<string, unknown>
  registerTools?: (server: TServer) => void
  /**
   * Registers the plugin's widget tools against the shared app resource.
   * The optional `metaDefaults` carry app-level widget `_meta` defaults
   * (currently the Apps SDK CSP) — forward them into
   * `createWidgetToolRegistrar` / `uiMeta` so every widget tool advertises
   * the same contract as the framework's own `render-view`. Implementations
   * may ignore the parameter; their tools then simply omit those keys.
   */
  registerWidgetTools?: (
    server: TServer,
    resourceUri: string,
    metaDefaults?: WidgetToolMetaDefaults,
  ) => void
}
