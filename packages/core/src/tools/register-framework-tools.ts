import { type MCPServer } from "mcp-use"
import { z } from "zod"
import { textResult } from "./tool-results.js"
import { getFrameworkManifest } from "../framework/manifest.js"
import { layoutInputSchema } from "../framework/layout-schemas.js"
import { renderView } from "../framework/render-view.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppConfig, AppPlugin } from "../types/index.js"
import {
  appsSdkMeta,
  viewResourceUri,
  type AppResourceCsp,
  type WidgetCspMeta,
} from "../types/meta.js"

export type { AppResourceCsp } from "../types/meta.js"

/** View name (and thus `ui://views/render-view.html` URI) bound to `render-view`. */
export const RENDER_VIEW_NAME = "render-view"

export interface RegisterFrameworkToolsOptions {
  stepRegistry: StepRegistry
  widgetRegistry: WidgetRegistry
  config: AppConfig
  appConfigs: Record<string, Record<string, unknown>>
  plugins: AppPlugin[]
  /**
   * Tool name for the refresh hook the UI calls to re-run the pipeline.
   * The `@miragon/mcp-toolkit-ui` default matches this — change both in
   * sync if you override.
   */
  refreshToolName?: string
  /**
   * Whether the in-iframe visual builder platform is enabled (i.e.
   * `app.builder` is true and `get-builder-catalogue` is registered).
   * Forwarded into every `render-view` / `refresh-view` payload as
   * `structuredContent.builderAvailable` so the `McpAppView` shell only
   * shows its Build affordance when the server can service it. Defaults to
   * `false`.
   */
  builderAvailable?: boolean
  /**
   * Additional CSP origins advertised on the view resources (`_meta.ui.csp`,
   * via each tool's `view.csp`) and, snake_cased, on widget tools
   * (`openai/widgetCSP`). The server origin is appended by mcp-use itself at
   * emission time, so this only needs third-party origins (e.g. a CDN).
   */
  csp?: AppResourceCsp
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
  // `layoutInputSchema` (not `layoutSchema`): also accepts the layout as a
  // JSON-encoded string — hosts confronted with the type-less `anyOf` this
  // union emits sometimes stringify the parameter (see layout-schemas.ts).
  layout: layoutInputSchema,
  title: z.string().optional().describe("Optional view title."),
})

type RenderViewParams = z.infer<typeof renderViewSchema>

/**
 * Minimal shape of the mcp-use tool-handler context this module reads —
 * kept structural (rather than importing mcp-use's context type) so the
 * extraction stays tolerant of hosts that omit auth entirely.
 */
interface ToolHandlerAuthContext {
  auth?: { user?: { userId?: string } }
}

function extractUserId(ctx: unknown): string | undefined {
  const user = (ctx as ToolHandlerAuthContext | undefined)?.auth?.user
  return typeof user?.userId === "string" ? user.userId : undefined
}

/** Converts the camelCase resource CSP into the snake_cased `openai/widgetCSP` shape. */
function toWidgetCspMeta(csp: AppResourceCsp): WidgetCspMeta {
  const meta: WidgetCspMeta = {}
  if (csp.connectDomains) meta.connect_domains = csp.connectDomains
  if (csp.resourceDomains) meta.resource_domains = csp.resourceDomains
  if (csp.frameDomains) meta.frame_domains = csp.frameDomains
  if (csp.baseUriDomains) meta.base_uri_domains = csp.baseUriDomains
  return meta
}

/**
 * Registers the framework-level MCP tools that make up a Miranum-style MCP
 * app: the manifest tool, the `render-view` / `refresh-view` pair, plus any
 * widget-action tools each plugin contributes. `render-view` is bound to its
 * own view ({@link RENDER_VIEW_NAME}); the view resource itself is emitted by
 * mcp-use from the registry `createFrameworkApp` primes with the app bundle.
 *
 * Intended to be called from `createFrameworkApp`, but exposed directly so
 * consumers that build their own server can still opt into the framework
 * tools without the rest of the boot helper — such consumers must prime the
 * view registry themselves (see `createFrameworkApp`).
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
    refreshToolName = "refresh-view",
    builderAvailable = false,
    csp,
  } = options

  const widgetCSP = csp ? toWidgetCspMeta(csp) : undefined

  server.tool(
    {
      name: "get-framework-manifest",
      description:
        "Returns all active apps, available pipeline steps, widgets, and their key contracts. Call this first to discover which step-ids and widget-ids exist — and which `props` each widget accepts (see each widget's `propsSchema`) — before building a view.",
      annotations: { readOnlyHint: true },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
      const manifest = getFrameworkManifest(stepRegistry, widgetRegistry, config)
      return textResult(JSON.stringify(manifest, null, 2))
    },
  )

  const renderHandler = async (params: RenderViewParams, ctx: unknown) => {
    return renderView({
      input: {
        keys: params.keys,
        steps: params.steps,
        layout: params.layout,
        title: params.title,
      },
      stepRegistry,
      appConfigs,
      ctx: { userId: extractUserId(ctx) },
      builderAvailable,
    })
  }

  server.tool(
    {
      name: "render-view",
      title: "Render View",
      description:
        "Builds a UI from pipeline steps and widgets. IMPORTANT: call get-framework-manifest first to learn which step-ids and widget-ids are available — only use ids listed there. Each widget entry's optional `propsSchema` (JSON Schema) describes the per-instance `props` you can set on a layout cell to scope or configure that widget (e.g. one tab per `processDefinitionKey`).",
      inputSchema: renderViewSchema,
      view: {
        name: RENDER_VIEW_NAME,
        description: "Interactive view composed of pipeline-driven widgets",
        ...(csp ? { csp } : {}),
      },
      // The view envelope is dynamic (steps/layout are call-time arguments);
      // `passthrough` satisfies the view binding's outputSchema requirement
      // without stripping envelope keys on SDK-side validation.
      outputSchema: z.object({}).passthrough(),
      _meta: appsSdkMeta({
        resourceUri: viewResourceUri(RENDER_VIEW_NAME),
        title: "Render View",
        invoking: "Rendering view...",
        invoked: "View rendered",
        widgetDescription: "Interactive view composed of pipeline-driven widgets",
        widgetCSP,
      }),
    },
    renderHandler,
  )

  for (const plugin of plugins) {
    plugin.registerWidgetTools?.(server, { widgetCSP, viewCsp: csp })
  }

  server.tool(
    {
      name: refreshToolName,
      title: "Refresh View",
      description: "Re-runs the pipeline with the stored parameters.",
      inputSchema: renderViewSchema,
      // App-only: called by the already-rendered view, never by the model —
      // and no view binding, since its result replaces state inside the
      // existing iframe rather than rendering a new one.
      visibility: "app",
    },
    renderHandler,
  )
}
