import { MCPServer, type McpServerInstance, type OAuthProvider } from "mcp-use/server"
import type { ProxyConfig } from "@miragon/mcp-toolkit-proxy-contract"
import { loadApps } from "../registry/app-loader.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import { buildProxyAppConfigs } from "../proxy/build-proxy-app-configs.js"
import { createOrgGateMiddleware } from "../middleware/org-gate.js"
import { createRoleFilterMiddleware } from "../middleware/role-filter.js"
import { discoverUpstreamModules, DEFAULT_HOST_REACT_MAJOR } from "../module-loader/discover.js"
import { synthesizeModulePlugin } from "../module-loader/synthesize-plugin.js"
import { createInMemoryDashboardStore, type DashboardStore } from "../framework/dashboard-store.js"
import type { AppConfig, AppPlugin } from "../types/index.js"
import { registerFrameworkTools, type AppResourceCsp } from "./register-framework-tools.js"
import { registerCatalogueTool } from "./register-catalogue-tool.js"
import { registerDashboardTools } from "./register-dashboard-tools.js"
import { registerUpstreamProxies } from "./register-upstream-proxies.js"
import { installToolCallNameCapture } from "./tool-call-name.js"
import { deriveAppResourceUri } from "./app-resource-uri.js"

export interface CreateFrameworkAppOptionsBase {
  name: string
  version?: string
  /**
   * Human-readable description of what the server does. Shown on mcp-use's
   * built-in landing page (a browser `GET` on the MCP endpoint) and in
   * `serverInfo`-adjacent surfaces.
   */
  description?: string
  /** Public base URL the server advertises (resource URIs, oauth callbacks). */
  baseUrl?: string
  host?: string
  plugins: AppPlugin[]
  /** Parsed proxy config (use `parseProxyConfigEnv` or hand-build). */
  proxies: ProxyConfig
  /**
   * Public base URL the OAuth callback routes of `auth.mode === "oauth2"`
   * proxies mount under. Defaults to {@link baseUrl} when omitted — the
   * common single-origin deployment where the server advertises and receives
   * callbacks on the same URL. Set it explicitly only when callbacks arrive on
   * a different origin than the one the server advertises. When neither this
   * nor `baseUrl` is set and an oauth2 proxy is configured, boot still fails
   * fast with the "callbackBaseUrl is required" error.
   */
  callbackBaseUrl?: string
  /**
   * Major React version the host ships. Controls whether an upstream-hosted
   * module's `runtime.react` range is accepted at discovery time. Defaults
   * to the toolkit's own `TOOLKIT_REACT_MAJOR` when omitted. Pass an
   * explicit number if the host's React runtime diverges from the bundled
   * UI package's peer range (rare).
   */
  hostReactMajor?: number
  middleware?: {
    /** When set, every RPC must come from a token with this organization_id. */
    orgGate?: string
    /** role → allowed module prefixes. Empty / missing → no restriction. */
    roleFilter?: Record<string, string[]>
    /**
     * When `true`, a `tools/call` whose tool name can't be resolved is *denied*
     * rather than allowed through the {@link roleFilter} guard. Defaults to
     * `false` for backward compatibility, but production deployments that rely
     * on `roleFilter` for access control should set this to `true` so an
     * unresolved name never slips past the module guard. Only meaningful
     * alongside `roleFilter`.
     */
    roleFilterFailClosed?: boolean
  }
  app: {
    /**
     * MCP UI resource URI that hosts the widget bundle. Optional — when
     * omitted it is derived as `ui://<name>/mcp-app.<hash>.html`, content-
     * hashing the file at {@link htmlPath} so each build yields a distinct,
     * cache-busting URI (see `deriveAppResourceUri`). Pass an explicit value
     * only to pin the URI.
     */
    resourceUri?: string
    /** Absolute path to the bundled `mcp-app.html` served under `resourceUri`. */
    htmlPath: string
    /** Override the refresh tool name (default: `refresh-view`). */
    refreshToolName?: string
    /**
     * Additional CSP origins advertised on the widget resource
     * (`_meta.ui.csp`) and widget tools (`openai/widgetCSP`). The origin of
     * {@link CreateFrameworkAppOptionsBase.baseUrl} is always merged in, so
     * most deployments never need this — set it only when widgets fetch from
     * origins other than the server itself (e.g. a CDN).
     */
    csp?: AppResourceCsp
    /**
     * Opt-in switch for the visual in-iframe builder platform and dashboard
     * persistence. **Defaults to `false` (lean by default).**
     *
     * Widget rendering always works regardless of this flag:
     * `get-framework-manifest`, `render-view`, and `refresh-view` (plus the
     * `mcp-app.html` resource) are registered unconditionally — that is the
     * core surface every MCP server gets.
     *
     * Setting `builder: true` additionally registers:
     *   - `get-builder-catalogue` — the app-only data source the in-iframe
     *     LayoutBuilder calls to populate its palette / key catalogue, and
     *   - `save-dashboard` / `list-dashboards` / `load-dashboard` /
     *     `delete-dashboard` — dashboard CRUD persistence.
     *
     * These belong together: the visual builder reads the catalogue and saves
     * its results as dashboards. Most lean MCP servers don't need either and
     * should leave this off so the builder/dashboard tools never get forced
     * onto their tool surface. The `McpAppView`'s Build/edit affordance hides
     * itself when the catalogue tool isn't present, so the iframe UI degrades
     * gracefully when `builder` is `false`.
     */
    builder?: boolean
    /**
     * Override the catalogue tool name (default: `get-builder-catalogue`).
     * The catalogue tool is app-only — it powers the in-iframe builder
     * and never appears in the LLM's tool surface. Only relevant when
     * {@link builder} is `true`; ignored otherwise.
     */
    catalogueToolName?: string
    /**
     * Persistence backing for `save-dashboard` / `list-dashboards` /
     * `load-dashboard` / `delete-dashboard`. Defaults to an in-memory store
     * (process-local, lost on restart). Inject a filesystem or DB-backed
     * store for real deployments. Only relevant when {@link builder} is
     * `true` — with `builder` off the dashboard tools aren't registered, so
     * this option has no effect.
     */
    dashboardStore?: DashboardStore
  }
  /** Supplies the non-empty set of apps each plugin represents. */
  appConfig?: AppConfig
  /** Swap in a non-env secret resolver (Vault, Doppler, etc.). */
  secretResolver?: (name: string) => string | undefined
}

/**
 * `createFrameworkApp` options when OAuth is enabled. The returned server is
 * typed as `MCPServer<true>`, so tool callbacks receive a non-nullable
 * `ctx.auth`.
 */
export interface CreateFrameworkAppOptionsWithOAuth extends CreateFrameworkAppOptionsBase {
  oauth: OAuthProvider
}

/**
 * `createFrameworkApp` options with OAuth disabled. The returned server is
 * typed as `MCPServer<false>`, so tool callbacks treat `ctx.auth` as
 * nullable.
 */
export interface CreateFrameworkAppOptionsWithoutOAuth extends CreateFrameworkAppOptionsBase {
  oauth?: undefined
}

export type CreateFrameworkAppOptions =
  CreateFrameworkAppOptionsWithOAuth | CreateFrameworkAppOptionsWithoutOAuth

/**
 * Orchestrates a full Miranum-style MCP server: MCPServer construction,
 * org-gate + role-filter middleware, upstream-proxy federation,
 * per-plugin tool registration, and the framework-level tool trio
 * (`get-framework-manifest`, `render-view`, `refresh-view`) + mcp-app.html
 * resource.
 *
 * OAuth is opt-in: pass an `oauth` provider to enable OAuth-gated routes and
 * get an `MCPServer<true>` back, or omit it to boot without OAuth and get an
 * `MCPServer<false>`. `ctx.auth` is still optionally present at runtime in
 * both modes; the generic just reflects what's guaranteed.
 *
 * Returns the booted server before `.listen()` — the caller decides the port
 * and the moment the server starts accepting traffic.
 */
export function createFrameworkApp(
  options: CreateFrameworkAppOptionsWithOAuth,
): Promise<McpServerInstance<true>>
export function createFrameworkApp(
  options: CreateFrameworkAppOptionsWithoutOAuth,
): Promise<McpServerInstance<false>>
export async function createFrameworkApp(
  options: CreateFrameworkAppOptions,
): Promise<McpServerInstance<boolean>> {
  const baseConfig = {
    name: options.name,
    version: options.version ?? "0.1.0",
    description: options.description,
    host: options.host ?? "localhost",
    baseUrl: options.baseUrl,
  }
  const server: McpServerInstance<boolean> = options.oauth
    ? new MCPServer({ ...baseConfig, oauth: options.oauth })
    : new MCPServer(baseConfig)

  const orgGateId = options.middleware?.orgGate
  if (orgGateId) {
    server.use("mcp:*", createOrgGateMiddleware(orgGateId))
  }

  // Capture the `tools/call` tool name from the JSON-RPC envelope at the HTTP
  // layer. mcp-use 1.28 populates `mcp:tools/call` middleware's `ctx.params`
  // with the tool *arguments*, not `{ name, arguments }`, so the role filter
  // can't read the name from there. The resolver is request-scoped via
  // `getRequestContext()` and is safe to install unconditionally.
  const resolveToolName = installToolCallNameCapture(server)

  const roleFilter = options.middleware?.roleFilter
  if (roleFilter && Object.keys(roleFilter).length > 0) {
    const { toolsList, toolsCall } = createRoleFilterMiddleware(roleFilter, {
      resolveToolName,
      // Batch-aware: a JSON-RPC batch envelope can carry several tools/call
      // requests; the guard must check all of them, not just the first.
      resolveToolNames: resolveToolName.all,
      failClosed: options.middleware?.roleFilterFailClosed ?? false,
    })
    server.use("mcp:tools/list", toolsList)
    server.use("mcp:tools/call", toolsCall)
  }

  const proxies = await registerUpstreamProxies(server, {
    entries: options.proxies,
    // Default to the advertised base URL — the common single-origin
    // deployment where the server receives OAuth callbacks on the same URL it
    // advertises. An explicit `callbackBaseUrl` still wins when callbacks
    // arrive on a different origin.
    callbackBaseUrl: options.callbackBaseUrl ?? options.baseUrl,
    secretResolver: options.secretResolver,
  })

  const discoveredModules = await discoverUpstreamModules({
    entries: options.proxies,
    proxies,
    hostReactMajor: options.hostReactMajor ?? DEFAULT_HOST_REACT_MAJOR,
  })
  const modulePlugins = discoveredModules.map(synthesizeModulePlugin)

  const stepRegistry = new StepRegistry()
  const widgetRegistry = new WidgetRegistry()

  // First-party plugins first: their step/widget ids are author-controlled, so
  // a collision is a real bug and must fail loud (hard throw).
  loadApps(
    options.plugins.map((p) => p.definition),
    stepRegistry,
    widgetRegistry,
  )

  // Discovered upstream modules next, in isolation: an untrusted third-party
  // module that ships a colliding id must not brick the whole host boot. A
  // conflicting module is skipped (with a warning) and dropped from the active
  // plugin set so its tools/widgets/appConfig are never half-registered.
  const { skipped } = loadApps(
    modulePlugins.map((p) => p.definition),
    stepRegistry,
    widgetRegistry,
    { isolateFailures: true },
  )
  const skippedModuleNames = new Set(skipped.map((s) => s.app.name))
  const activeModulePlugins = modulePlugins.filter(
    (p) => !skippedModuleNames.has(p.definition.name),
  )
  const allPlugins: AppPlugin[] = [...options.plugins, ...activeModulePlugins]

  for (const plugin of allPlugins) {
    plugin.registerTools?.(server)
  }

  const appConfigs = buildProxyAppConfigs(allPlugins, proxies)
  const appConfig: AppConfig = options.appConfig ?? {
    activeApps: allPlugins.map((p) => ({ app: p.definition.name, config: {} })),
    pipelines: {},
  }

  // Derive a content-hashed resource URI when one isn't pinned, so each build
  // busts the host's widget-bundle cache (a fixed URI would keep serving a
  // stale bundle across restarts). `deriveAppResourceUri` warns and falls back
  // to a stable dev URI when the bundle file is missing.
  const resourceUri =
    options.app.resourceUri ??
    deriveAppResourceUri({ appName: options.name, htmlPath: options.app.htmlPath })

  registerFrameworkTools(server, {
    stepRegistry,
    widgetRegistry,
    config: appConfig,
    appConfigs,
    plugins: allPlugins,
    proxies,
    resourceUri,
    htmlPath: options.app.htmlPath,
    refreshToolName: options.app.refreshToolName,
    // Advertise builder availability in the view payload so the iframe shell
    // shows its Build affordance only when the catalogue/dashboard tools below
    // are actually registered.
    builderAvailable: options.app.builder ?? false,
    // Feeds the widget-resource CSP (`_meta.ui.csp` + `openai/widgetCSP`):
    // the baseUrl origin is auto-injected next to any explicit `app.csp`.
    baseUrl: options.baseUrl,
    csp: options.app.csp,
  })

  // The visual builder platform is opt-in: the catalogue (its data source)
  // and the dashboard CRUD tools (its persistence) are registered together
  // only when `app.builder` is true. Lean servers leave it off so render-view
  // / the widget core stay the entire surface. See the `app.builder` TSDoc.
  if (options.app.builder) {
    registerCatalogueTool(server, {
      stepRegistry,
      widgetRegistry,
      appConfigs,
      toolName: options.app.catalogueToolName,
    })

    const dashboardStore = options.app.dashboardStore ?? createInMemoryDashboardStore()
    registerDashboardTools(server, { store: dashboardStore, widgetRegistry })
  }

  return server
}
