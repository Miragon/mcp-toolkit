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
import { registerFrameworkTools } from "./register-framework-tools.js"
import { registerCatalogueTool } from "./register-catalogue-tool.js"
import { registerDashboardTools } from "./register-dashboard-tools.js"
import { registerUpstreamProxies } from "./register-upstream-proxies.js"
import { installToolCallNameCapture } from "./tool-call-name.js"

export interface CreateFrameworkAppOptionsBase {
  name: string
  version?: string
  /** Public base URL the server advertises (resource URIs, oauth callbacks). */
  baseUrl?: string
  host?: string
  plugins: AppPlugin[]
  /** Parsed proxy config (use `parseProxyConfigEnv` or hand-build). */
  proxies: ProxyConfig
  /** Required when any proxy entry uses `auth.mode === "oauth2"`. */
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
  }
  app: {
    /** MCP UI resource URI that hosts the widget bundle. */
    resourceUri: string
    /** Absolute path to the bundled `mcp-app.html` served under `resourceUri`. */
    htmlPath: string
    /** Override the refresh tool name (default: `refresh-view`). */
    refreshToolName?: string
    /**
     * Override the catalogue tool name (default: `get-builder-catalogue`).
     * The catalogue tool is app-only — it powers the in-iframe builder
     * and never appears in the LLM's tool surface.
     */
    catalogueToolName?: string
    /**
     * Persistence backing for `save-dashboard` / `list-dashboards` /
     * `load-dashboard` / `delete-dashboard`. Defaults to an in-memory store
     * (process-local, lost on restart). Inject a filesystem or DB-backed
     * store for real deployments.
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
  | CreateFrameworkAppOptionsWithOAuth
  | CreateFrameworkAppOptionsWithoutOAuth

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
    const { toolsList, toolsCall } = createRoleFilterMiddleware(roleFilter, { resolveToolName })
    server.use("mcp:tools/list", toolsList)
    server.use("mcp:tools/call", toolsCall)
  }

  const proxies = await registerUpstreamProxies(server, {
    entries: options.proxies,
    callbackBaseUrl: options.callbackBaseUrl,
    secretResolver: options.secretResolver,
  })

  const discoveredModules = await discoverUpstreamModules({
    entries: options.proxies,
    proxies,
    hostReactMajor: options.hostReactMajor ?? DEFAULT_HOST_REACT_MAJOR,
  })
  const modulePlugins = discoveredModules.map(synthesizeModulePlugin)
  const allPlugins: AppPlugin[] = [...options.plugins, ...modulePlugins]

  const stepRegistry = new StepRegistry()
  const widgetRegistry = new WidgetRegistry()
  loadApps(
    allPlugins.map((p) => p.definition),
    stepRegistry,
    widgetRegistry,
  )

  for (const plugin of allPlugins) {
    plugin.registerTools?.(server)
  }

  const appConfigs = buildProxyAppConfigs(allPlugins, proxies)
  const appConfig: AppConfig = options.appConfig ?? {
    activeApps: allPlugins.map((p) => ({ app: p.definition.name, config: {} })),
    pipelines: {},
  }

  registerFrameworkTools(server, {
    stepRegistry,
    widgetRegistry,
    config: appConfig,
    appConfigs,
    plugins: allPlugins,
    proxies,
    resourceUri: options.app.resourceUri,
    htmlPath: options.app.htmlPath,
    refreshToolName: options.app.refreshToolName,
  })

  registerCatalogueTool(server, {
    stepRegistry,
    widgetRegistry,
    appConfigs,
    toolName: options.app.catalogueToolName,
  })

  const dashboardStore = options.app.dashboardStore ?? createInMemoryDashboardStore()
  registerDashboardTools(server, { store: dashboardStore })

  return server
}
