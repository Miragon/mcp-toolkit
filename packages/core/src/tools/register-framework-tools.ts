import fs from "node:fs/promises"
import { type MCPServer, text } from "mcp-use"

/**
 * MIME type MCP Apps hosts key off when deciding to render a resource as a
 * sandboxed view. mcp-use 2.x keeps this behind an internal `views/` module
 * (`UI_MIME_TYPE`) instead of exporting it, so the toolkit pins the spec value
 * itself — it is an MCP Apps wire constant, not an implementation detail.
 */
const UI_MIME_TYPE = "text/html;profile=mcp-app"
import { z } from "zod"
import { getFrameworkManifest } from "../framework/manifest.js"
import { layoutInputSchema } from "../framework/layout-schemas.js"
import { renderView } from "../framework/render-view.js"
import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppConfig, AppPlugin } from "../types/index.js"
import { uiMeta, type WidgetCspMeta } from "../types/meta.js"

/**
 * CSP advertised on the widget resource, in the SEP-1865 camelCase shape
 * (`_meta.ui.csp`). All entries are full origins (e.g. `https://server.example`).
 * The Apps SDK tool-meta variant (`openai/widgetCSP`, snake_cased) is derived
 * from the same value.
 */
export interface AppResourceCsp {
  /** Origins allowed for fetch/XHR/WebSocket from inside the widget iframe. */
  connectDomains?: string[]
  /** Origins allowed for images, scripts, stylesheets, fonts. */
  resourceDomains?: string[]
  /** Allowed iframe origins. */
  frameDomains?: string[]
  /** Allowed `base-uri` origins. */
  baseUriDomains?: string[]
}

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
   * Public base URL the server advertises. Its origin is auto-injected into
   * the resource CSP's connect/resource/baseUri domains — mirroring native
   * mcp-use's server-origin enrichment — so widgets can reach the server
   * origin without CSP violations. Without it (and without {@link csp}) the
   * resource advertises no CSP, which ext-apps hosts treat as the secure
   * "no network" default; fine for a fully inlined bundle.
   */
  baseUrl?: string
  /**
   * Additional CSP origins advertised on the widget resource
   * (`_meta.ui.csp`) and, snake_cased, on widget tools (`openai/widgetCSP`).
   * Merged with the origin derived from {@link baseUrl}.
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

function withOrigin(list: string[] | undefined, origin: string): string[] {
  if (!list) return [origin]
  return list.includes(origin) ? list : [...list, origin]
}

/**
 * Merges the configured CSP with the server origin derived from `baseUrl`
 * (injected into connect/resource/baseUri domains, deduplicated) — the same
 * enrichment native mcp-use applies to its widget definitions. Returns
 * `undefined` when there is nothing to advertise.
 */
export function buildAppResourceCsp(
  baseUrl: string | undefined,
  csp: AppResourceCsp | undefined,
): AppResourceCsp | undefined {
  let origin: string | undefined
  if (baseUrl) {
    try {
      origin = new URL(baseUrl).origin
    } catch {
      // Invalid baseUrl — skip origin injection rather than failing boot.
    }
  }
  if (!origin) return csp
  return {
    ...csp,
    connectDomains: withOrigin(csp?.connectDomains, origin),
    resourceDomains: withOrigin(csp?.resourceDomains, origin),
    baseUriDomains: withOrigin(csp?.baseUriDomains, origin),
  }
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
    builderAvailable = false,
    baseUrl,
    csp,
  } = options

  const resourceCsp = buildAppResourceCsp(baseUrl, csp)
  const widgetCSP = resourceCsp ? toWidgetCspMeta(resourceCsp) : undefined

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
      return text(JSON.stringify(manifest, null, 2))
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
      schema: renderViewSchema,
      _meta: uiMeta({
        resourceUri,
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
    plugin.registerWidgetTools?.(server, resourceUri, { widgetCSP })
  }

  server.tool(
    {
      name: refreshToolName,
      title: "Refresh View",
      description: "Re-runs the pipeline with the stored parameters.",
      schema: renderViewSchema,
      _meta: uiMeta({ resourceUri, appOnly: true }),
    },
    renderHandler,
  )

  // The resource `_meta.ui.csp` must appear on the LISTING (resources/list)
  // and on the READ contents — ext-apps hosts read it from the contents when
  // sandboxing the iframe.
  const resourceMeta = resourceCsp ? { ui: { csp: resourceCsp } } : undefined
  server.resource(
    {
      name: "mcp-app-html",
      uri: resourceUri,
      mimeType: UI_MIME_TYPE,
      ...(resourceMeta ? { _meta: resourceMeta } : {}),
    },
    async () => {
      // Read lazily per request so dev servers pick up a rebuilt bundle
      // without a restart (same behaviour as before).
      const html = await fs.readFile(htmlPath, "utf-8")
      // mcp-use 2.x dropped `createMcpAppsResource`; shaping this envelope was
      // its whole job, so emit it directly. `_meta.ui` must stay on the
      // contents and not just the listing — ext-apps hosts read the CSP from
      // here when sandboxing the iframe.
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: UI_MIME_TYPE,
            text: html,
            ...(resourceCsp ? { _meta: { ui: { csp: resourceCsp } } } : {}),
          },
        ],
      }
    },
  )
}
