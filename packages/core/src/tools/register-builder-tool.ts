import { type MCPServer } from "mcp-use/server"
import { z } from "zod"
import { buildView } from "../framework/builder.js"
import { layoutSchema } from "../framework/layout-schemas.js"
import type { LayoutConfig } from "../framework/layout-types.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"

export interface RegisterBuilderToolOptions {
  stepRegistry: StepRegistry
  widgetRegistry: WidgetRegistry
  appConfigs: Record<string, Record<string, unknown>>
  /** MCP UI resource URI that hosts the widget bundle (same as render-view). */
  resourceUri: string
  /** Override the tool name (default: `open-view-builder`). */
  toolName?: string
}

const stepRefSchema = z.object({
  id: z.string().describe("Context key under which the step's result is stored."),
  step: z.string().describe("Registered step id, e.g. 'lexoffice:load-invoice'."),
  optional: z.boolean().optional(),
})

const builderSchema = z.object({
  keys: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Initial context keys that seed the builder. All widgets whose `requires` are satisfiable by these keys (plus any keys produced by the declared steps) are offered in the palette.",
    ),
  steps: z
    .array(stepRefSchema)
    .optional()
    .describe(
      "Optional pipeline steps used to grow the key set before the palette is computed and to populate the live preview.",
    ),
  layout: layoutSchema
    .optional()
    .describe("Optional draft layout to resume editing. Omit to start with an empty canvas."),
  title: z.string().optional().describe("Optional view title shown in the builder header."),
})

type BuilderParams = z.infer<typeof builderSchema>

function extractUserId(ctx: unknown): string | undefined {
  const user = (ctx as { auth?: { user?: { userId?: unknown } } } | undefined)?.auth?.user
  return typeof user?.userId === "string" ? user.userId : undefined
}

/**
 * Registers `open-view-builder`: the interactive counterpart to `render-view`.
 *
 * Same input shape (`keys`, `steps`, `layout`, `title`); the returned
 * `structuredContent` carries `mode: "builder"` plus the catalogue of
 * widgets the user can drop onto the canvas. The host's `McpAppView`
 * branches on the mode to render the `LayoutBuilder` composer.
 */
export function registerBuilderTool(server: MCPServer, options: RegisterBuilderToolOptions): void {
  const {
    stepRegistry,
    widgetRegistry,
    appConfigs,
    resourceUri,
    toolName = "open-view-builder",
  } = options

  server.tool(
    {
      name: toolName,
      title: "Open View Builder",
      description:
        "Opens the interactive layout composer. Starts with the given keys + steps, surfaces the widgets whose contracts are satisfied by the resulting key set, and lets the user/LLM assemble rows, columns, and tabs. Call `render-view` (or `save-dashboard`) with the finished layout when done.",
      schema: builderSchema,
      _meta: { ui: { resourceUri } },
    },
    async (params: BuilderParams, ctx: unknown) => {
      return buildView(
        {
          keys: params.keys,
          steps: params.steps,
          layout: params.layout as LayoutConfig | undefined,
          title: params.title,
        },
        stepRegistry,
        widgetRegistry,
        appConfigs,
        { userId: extractUserId(ctx) },
      )
    },
  )
}
