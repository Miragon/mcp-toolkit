import { MCPServer, type McpServerInstance, type OAuthProvider } from "mcp-use/server"
import type { ProxyConfig } from "@miragon/mcp-toolkit-proxy-contract"
import { loadApps } from "../registry/app-loader.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import { buildProxyAppConfigs } from "../proxy/build-proxy-app-configs.js"
import { createOrgGateMiddleware } from "../middleware/org-gate.js"
import { createRoleFilterMiddleware } from "../middleware/role-filter.js"
import type { AppConfig, AppPlugin } from "../types/index.js"
import { registerFrameworkTools } from "./register-framework-tools.js"
import { registerUpstreamProxies } from "./register-upstream-proxies.js"

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
    host: options.host ?? "0.0.0.0",
    baseUrl: options.baseUrl,
  }
  const server: McpServerInstance<boolean> = options.oauth
    ? new MCPServer({ ...baseConfig, oauth: options.oauth })
    : new MCPServer(baseConfig)

  const orgGateId = options.middleware?.orgGate
  if (orgGateId) {
    server.use("mcp:*", createOrgGateMiddleware(orgGateId))
  }

  const roleFilter = options.middleware?.roleFilter
  if (roleFilter && Object.keys(roleFilter).length > 0) {
    const { toolsList, toolsCall } = createRoleFilterMiddleware(roleFilter)
    server.use("mcp:tools/list", toolsList)
    server.use("mcp:tools/call", toolsCall)
  }

  const proxies = await registerUpstreamProxies(server, {
    entries: options.proxies,
    callbackBaseUrl: options.callbackBaseUrl,
    secretResolver: options.secretResolver,
  })

  const stepRegistry = new StepRegistry()
  const widgetRegistry = new WidgetRegistry()
  loadApps(
    options.plugins.map((p) => p.definition),
    stepRegistry,
    widgetRegistry,
  )

  for (const plugin of options.plugins) {
    plugin.registerTools?.(server)
  }

  const appConfigs = buildProxyAppConfigs(options.plugins, proxies)
  const appConfig: AppConfig = options.appConfig ?? {
    activeApps: options.plugins.map((p) => ({ app: p.definition.name, config: {} })),
    pipelines: {},
  }

  registerFrameworkTools(server, {
    stepRegistry,
    widgetRegistry,
    config: appConfig,
    appConfigs,
    plugins: options.plugins,
    resourceUri: options.app.resourceUri,
    htmlPath: options.app.htmlPath,
    refreshToolName: options.app.refreshToolName,
  })

  return server
}
