import { type MCPServer } from "mcp-use"
import { z } from "zod"
import { getBuilderCatalogue } from "../framework/catalogue.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"

export interface RegisterCatalogueToolOptions {
  stepRegistry: StepRegistry
  widgetRegistry: WidgetRegistry
  appConfigs: Record<string, Record<string, unknown>>
  /** Override the tool name (default: `get-builder-catalogue`). */
  toolName?: string
}

const stepRefSchema = z.object({
  id: z.string().describe("Context key under which the step's result is stored, e.g. 'invoice'."),
  step: z.string().describe("Registered step id, e.g. 'lexoffice:load-invoice'."),
  optional: z
    .boolean()
    .optional()
    .describe("If true, a failure of this step skips it instead of failing the whole view."),
})

const catalogueSchema = z.object({
  keys: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Keys already present in the view — used to compute step/widget reachability."),
  steps: z
    .array(stepRefSchema)
    .optional()
    .describe("Steps already configured in the view — their produced keys count as reachable."),
})

function extractUserId(ctx: unknown): string | undefined {
  const user = (ctx as { auth?: { user?: { userId?: unknown } } } | undefined)?.auth?.user
  return typeof user?.userId === "string" ? user.userId : undefined
}

/**
 * Registers `get-builder-catalogue` — the in-iframe builder's data
 * source. App-only (`visibility: ["app"]`), so it never appears in the
 * LLM's `tools/list`. The LayoutBuilder calls it on mount and on each
 * keys/steps edit; the LLM uses `render-view` for its own work.
 *
 * Registered by `createFrameworkApp` only when `app.builder` is `true` —
 * the visual builder platform is opt-in (lean by default). When the builder
 * is off this tool is absent and the `McpAppView` hides its Build affordance.
 */
export function registerCatalogueTool(
  server: MCPServer,
  options: RegisterCatalogueToolOptions,
): void {
  const { stepRegistry, widgetRegistry, appConfigs, toolName = "get-builder-catalogue" } = options

  server.tool(
    {
      name: toolName,
      title: "Get Builder Catalogue",
      description:
        "App-only. Returns the live pipeline context plus the reachable / unreachable widgets, available steps and key catalogue for the current keys + steps. Used by the in-iframe LayoutBuilder.",
      inputSchema: catalogueSchema,
      visibility: "app",
    },
    async (params, ctx) => {
      return getBuilderCatalogue({
        input: { keys: params.keys, steps: params.steps },
        stepRegistry,
        widgetRegistry,
        appConfigs,
        ctx: { userId: extractUserId(ctx) },
      })
    },
  )
}
