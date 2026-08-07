import { MCPServer, type ServerConfig } from "mcp-use"
import type { OAuthProvider } from "mcp-use/oauth"
import { loadApps } from "../registry/app-loader.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import { createOrgGateMiddleware } from "../middleware/org-gate.js"
import { createRoleFilterMiddleware } from "../middleware/role-filter.js"
import { createInMemoryDashboardStore, type DashboardStore } from "../framework/dashboard-store.js"
import type { AppConfig, AppPlugin } from "../types/index.js"
import { registerFrameworkTools, type AppResourceCsp } from "./register-framework-tools.js"
import { registerCatalogueTool } from "./register-catalogue-tool.js"
import { registerDashboardTools } from "./register-dashboard-tools.js"
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
  /**
   * Pass-through of the remaining mcp-use {@link ServerConfig} handed to the
   * `MCPServer` constructor. The main use case is wiring session/stream
   * options it does not mirror — `cors`, `instructions`, `allowedOrigins`,
   * `logging`, … — straight through to the `MCPServer` constructor. The
   * toolkit-owned keys
   * (`name`, `version`, `description`, `host`, `oauth`) are excluded via
   * `Omit` because they are first-class options on this interface already;
   * `oauth` additionally stays out because it carries the `TUser` generic.
   */
  serverOptions?: Omit<
    ServerConfig,
    "name" | "version" | "description" | "host" | "oauth"
  >
  plugins: AppPlugin[]
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
}

/**
 * `createFrameworkApp` options when OAuth is enabled. The returned server is
 * typed as `MCPServer<true>`, so tool callbacks receive a non-nullable
 * `ctx.auth`.
 */
export interface CreateFrameworkAppOptionsWithOAuth<TUser = unknown>
  extends CreateFrameworkAppOptionsBase {
  oauth: OAuthProvider<TUser>
}

/**
 * `createFrameworkApp` options with OAuth disabled. The returned server is
 * typed as `MCPServer<false>`, so tool callbacks treat `ctx.auth` as
 * nullable.
 */
export interface CreateFrameworkAppOptionsWithoutOAuth extends CreateFrameworkAppOptionsBase {
  oauth?: undefined
}

export type CreateFrameworkAppOptions<TUser = unknown> =
  | CreateFrameworkAppOptionsWithOAuth<TUser>
  | CreateFrameworkAppOptionsWithoutOAuth

/**
 * Orchestrates a full Miranum-style MCP server: MCPServer construction,
 * org-gate + role-filter middleware, per-plugin tool registration, and the
 * framework-level tool trio (`get-framework-manifest`, `render-view`,
 * `refresh-view`) + mcp-app.html resource.
 *
 * The server is deliberately self-contained: it serves only the first-party
 * plugins passed in. Aggregating several MCP servers into one surface is an
 * external gateway's job (e.g. agentgateway), not this framework's.
 *
 * OAuth is opt-in: pass an `oauth` provider to enable OAuth-gated routes and
 * get an `MCPServer<true>` back, or omit it to boot without OAuth and get an
 * `MCPServer<false>`. `ctx.auth` is still optionally present at runtime in
 * both modes; the generic just reflects what's guaranteed.
 *
 * Returns the booted server before `.listen()` — the caller decides the port
 * and the moment the server starts accepting traffic.
 */
export function createFrameworkApp<TUser>(
  options: CreateFrameworkAppOptionsWithOAuth<TUser>,
): Promise<MCPServer<TUser>>
export function createFrameworkApp(
  options: CreateFrameworkAppOptionsWithoutOAuth,
): Promise<MCPServer>
// Async without an internal await today: the boot path became fully
// synchronous when upstream discovery was removed, but the Promise return
// stays — consumers `await` it, and future boot steps may be async again.
// eslint-disable-next-line @typescript-eslint/require-await
export async function createFrameworkApp<TUser>(
  options: CreateFrameworkAppOptions<TUser>,
): Promise<MCPServer<TUser>> {
  // `baseUrl` is deliberately absent: mcp-use 2.x dropped it from
  // `ServerConfig` and resolves the serving origin from the request (or the
  // MCP_URL env var). The toolkit keeps the option because it still feeds the
  // widget resource CSP — see `buildAppResourceCsp` — it just no longer
  // reaches the MCPServer constructor.
  const baseConfig = {
    name: options.name,
    version: options.version ?? "0.1.0",
    description: options.description,
    host: options.host ?? "localhost",
  }
  // `serverOptions` is statically disjoint from `baseConfig` (its type Omits
  // every toolkit-owned key); the spread order is defense-in-depth so the
  // toolkit's first-class options always win at runtime.
  // `ServerConfig<TUser>` is conditional on TUser (`[TUser] extends [never]`
  // selects between `oauth?: undefined` and a required `oauth`). TypeScript
  // cannot evaluate that against a still-generic TUser inside this
  // implementation signature, so the constructor arg is cast here. The two
  // public overloads above are what callers see, and they carry the real
  // guarantee.
  const server = (
    options.oauth
      ? new MCPServer({
          ...options.serverOptions,
          ...baseConfig,
          oauth: options.oauth,
        } as unknown as ServerConfig<TUser>)
      : new MCPServer({ ...options.serverOptions, ...baseConfig } as unknown as ServerConfig<never>)
  ) as MCPServer<TUser>

  const orgGateId = options.middleware?.orgGate
  if (orgGateId) {
    // The middleware is typed structurally on purpose so it stays host-
    // agnostic; mcp-use 2.x types `ctx.auth` as its own `AuthInfo`, which is
    // not mutually assignable with that shape. Only `auth.user` is read.
    server.use("mcp:*", createOrgGateMiddleware(orgGateId) as never)
  }

  const roleFilter = options.middleware?.roleFilter
  if (roleFilter && Object.keys(roleFilter).length > 0) {
    const { toolsList, toolsCall } = createRoleFilterMiddleware(roleFilter, {
      failClosed: options.middleware?.roleFilterFailClosed ?? false,
    })
    // Cast for the same reason as the org gate above.
    server.use("mcp:tools/list", toolsList as never)
    server.use("mcp:tools/call", toolsCall as never)
  }

  // The registrars are typed against the OAuth-less `MCPServer`; a
  // `MCPServer<TUser>` differs only in the `ctx.auth` its callbacks receive,
  // which none of them read. They register tools and one resource.
  const serverForRegistrars = server as unknown as MCPServer

  const stepRegistry = new StepRegistry()
  const widgetRegistry = new WidgetRegistry()

  // Plugin step/widget ids are author-controlled, so a collision is a real
  // bug and must fail loud (hard throw).
  const allPlugins: AppPlugin[] = options.plugins
  loadApps(
    allPlugins.map((p) => p.definition),
    stepRegistry,
    widgetRegistry,
  )

  for (const plugin of allPlugins) {
    plugin.registerTools?.(server)
  }

  // Per-app step configuration: each plugin's `appConfig` keyed by app name.
  // A plugin may inject closures here (e.g. a typed `callTool`) — the pipeline
  // executor pre-binds the per-request user context on any `callTool` it finds
  // (see `pipeline-executor.ts:bindAppConfig`).
  const appConfigs: Record<string, Record<string, unknown>> = Object.fromEntries(
    allPlugins.map((p) => [p.definition.name, p.appConfig ?? {}]),
  )
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

  registerFrameworkTools(serverForRegistrars, {
    stepRegistry,
    widgetRegistry,
    config: appConfig,
    appConfigs,
    plugins: allPlugins,
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
    registerCatalogueTool(serverForRegistrars, {
      stepRegistry,
      widgetRegistry,
      appConfigs,
      toolName: options.app.catalogueToolName,
    })

    const dashboardStore = options.app.dashboardStore ?? createInMemoryDashboardStore()
    registerDashboardTools(serverForRegistrars, { store: dashboardStore, widgetRegistry })
  }

  return server
}
