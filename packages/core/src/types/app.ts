import type { PipelineStepDefinition } from "./step.js"
import type { WidgetDefinition } from "./widget.js"

export interface AppDefinition {
  name: string
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AppPlugin<TServer = any> {
  definition: AppDefinition
  appConfig?: Record<string, unknown>
  registerTools?: (server: TServer) => void
  registerWidgetTools?: (server: TServer, resourceUri: string) => void
}
