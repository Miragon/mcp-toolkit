import fs from "node:fs/promises"
import { type MCPServer, RESOURCE_MIME_TYPE, text } from "mcp-use/server"
import { z } from "zod"
import { getFrameworkManifest } from "../framework/manifest.js"
import { layoutSchema } from "../framework/layout-schemas.js"
import { renderView } from "../framework/render-view.js"
import type { LayoutConfig } from "../framework/layout-types.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppConfig, AppPlugin } from "../types/index.js"

export interface RegisterFrameworkToolsOptions {
  stepRegistry: StepRegistry
  widgetRegistry: WidgetRegistry
  config: AppConfig
  appConfigs: Record<string, Record<string, unknown>>
  plugins: AppPlugin[]
  /**
   * The MCP UI resource URI that hosts the widget bundle (typically the
   * compiled `mcp-app.html`). Referenced by `render-view` / `refresh-view`
   * via the `_meta.ui.resourceUri` convention.
   */
  resourceUri: string
  /** Absolute path to the bundled `mcp-app.html` served behind `resourceUri`. */
  htmlPath: string
  /**
   * Tool name for the refresh hook the UI calls to re-run the pipeline.
   * The `@miragon/mcp-toolkit-ui` default matches this — change both in
   * sync if you override.
   */
  refreshToolName?: string
}

const stepRefSchema = z.object({
  id: z.string().describe("Context key under which the step's result is stored, e.g. 'invoice'."),
  step: z.string().describe("Registered step id, e.g. 'lexoffice:load-invoice'."),
  optional: z.boolean().optional(),
})

const renderViewSchema = z.object({
  keys: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Keys the widgets will receive, e.g. { 'lexoffice:invoiceId': '…' }."),
  steps: z
    .array(stepRefSchema)
    .optional()
    .describe(
      "Optional pipeline steps to compute keys before rendering. Without steps only the passed-in keys are used.",
    ),
  layout: layoutSchema,
  title: z.string().optional().describe("Optional view title."),
})

type RenderViewParams = z.infer<typeof renderViewSchema>

function extractUserId(ctx: unknown): string | undefined {
  const user = (ctx as { auth?: { user?: { userId?: unknown } } } | undefined)?.auth?.user
  return typeof user?.userId === "string" ? user.userId : undefined
}

/**
 * Registers the framework-level MCP tools that make up a Miranum-style MCP
 * app: the manifest tool, the `render-view` / `refresh-view` pair, the widget
 * bundle resource, plus any widget-action tools each plugin contributes.
 *
 * Intended to be called from `createFrameworkApp`, but exposed directly so
 * consumers that build their own server can still opt into the framework
 * tools without the rest of the boot helper.
 */
export function registerFrameworkTools(
  server: MCPServer,
  options: RegisterFrameworkToolsOptions,
): void {
  const {
    stepRegistry,
    widgetRegistry,
    config,
    appConfigs,
    plugins,
    resourceUri,
    htmlPath,
    refreshToolName = "refresh-view",
  } = options

  server.tool(
    {
      name: "get-framework-manifest",
      description:
        "Returns all active apps, available pipeline steps, widgets, and their key contracts. Call this first to discover which step-ids and widget-ids exist before building a view.",
      annotations: { readOnlyHint: true },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
      const manifest = getFrameworkManifest(stepRegistry, widgetRegistry, config)
      return text(JSON.stringify(manifest, null, 2))
    },
  )

  const renderHandler = async (params: RenderViewParams, ctx: unknown) => {
    return renderView(
      {
        keys: params.keys,
        steps: params.steps,
        layout: params.layout as LayoutConfig,
        title: params.title,
      },
      stepRegistry,
      appConfigs,
      { userId: extractUserId(ctx) },
    )
  }

  server.tool(
    {
      name: "render-view",
      title: "Render View",
      description:
        "Builds a UI from pipeline steps and widgets. IMPORTANT: call get-framework-manifest first to learn which step-ids and widget-ids are available — only use ids listed there.",
      schema: renderViewSchema,
      _meta: { ui: { resourceUri } },
    },
    renderHandler,
  )

  for (const plugin of plugins) {
    plugin.registerWidgetTools?.(server, resourceUri)
  }

  server.tool(
    {
      name: refreshToolName,
      title: "Refresh View",
      description: "Re-runs the pipeline with the stored parameters.",
      schema: renderViewSchema,
      _meta: { ui: { resourceUri, visibility: ["app"] } },
    },
    renderHandler,
  )

  server.resource(
    {
      name: "mcp-app-html",
      uri: resourceUri,
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => {
      const html = await fs.readFile(htmlPath, "utf-8")
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      }
    },
  )
}
