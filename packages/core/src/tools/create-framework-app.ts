import fs from "node:fs/promises"
import {
  MCPServer,
  registerViews,
  type ServerConfig,
  type ToolDefinition,
  type ViewsManifest,
} from "mcp-use"
import type { OAuthProvider } from "mcp-use/oauth"
import { createOrgGateMiddleware } from "../middleware/org-gate.js"
import { createRoleFilterMiddleware } from "../middleware/role-filter.js"
import type { DashboardStore } from "../framework/dashboard-store.js"
import type { AppConfig, AppPlugin } from "../types/index.js"
import type { AppResourceCsp } from "../types/meta.js"
import { installToolkit } from "./install-toolkit.js"

export interface CreateFrameworkAppOptionsBase {
  name: string
  version?: string
  /**
   * Human-readable description of what the server does. Shown on mcp-use's
   * built-in landing page (a browser `GET` on the MCP endpoint) and in
   * `serverInfo`-adjacent surfaces.
   */
  description?: string
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
  serverOptions?: Omit<ServerConfig, "name" | "version" | "description" | "host" | "oauth">
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
     * The compiled widget bundle backing every view this server binds. Views
     * are registered natively with mcp-use (which owns the view resources,
     * their `ui://views/<name>.html` URIs, and the `_meta.ui` wire keys);
     * every tool-bound view name resolves to this one bundle — the bundle's
     * widget map decides what actually renders.
     */
    bundle: {
      /** Absolute path to the bundle's ES module (e.g. `dist/mcp-app.js`). */
      jsPath: string
      /** Absolute path to the bundle's stylesheet, when the build emits one. */
      cssPath?: string
    }
    /** Override the refresh tool name (default: `refresh-view`). */
    refreshToolName?: string
    /**
     * Additional CSP origins advertised on the view resources
     * (`_meta.ui.csp`) and widget tools (`openai/widgetCSP`). The server
     * origin is appended by mcp-use itself at emission time, so most
     * deployments never need this — set it only when widgets fetch from
     * origins other than the server (e.g. a CDN).
     */
    csp?: AppResourceCsp
    /**
     * Opt-in switch for the visual in-iframe builder platform and dashboard
     * persistence. **Defaults to `false` (lean by default).**
     *
     * Widget rendering always works regardless of this flag:
     * `get-framework-manifest`, `render-view`, and `refresh-view` (plus the
     * natively registered view resources) are registered unconditionally —
     * that is the core surface every MCP server gets.
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
export interface CreateFrameworkAppOptionsWithOAuth<
  TUser = unknown,
> extends CreateFrameworkAppOptionsBase {
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
  CreateFrameworkAppOptionsWithOAuth<TUser> | CreateFrameworkAppOptionsWithoutOAuth

/**
 * Read a bundle file, failing soft: a missing file logs a warning and yields
 * an empty string so a dev server can boot before the first bundle build —
 * matching the old missing-`htmlPath` behaviour. Views then render an empty
 * document until the server restarts with a built bundle.
 */
async function readBundleFile(filePath: string, label: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    console.warn(
      `[createFrameworkApp] could not read the app bundle ${label} at ${filePath}; ` +
        `views will render empty until the bundle is built and the server restarts.`,
    )
    return ""
  }
}

/**
 * The batteries-included wrapper — the toolkit's **Node adapter**: MCPServer
 * construction, org-gate + role-filter middleware, `installToolkit` (the
 * framework tool surface), and native view registration from a self-built
 * bundle. Reach for it when the server must run in your own process (embedded
 * in existing infrastructure, custom entrypoints) or ship the views inline in
 * the MCP resources (gateways that only forward the JSON-RPC endpoint).
 *
 * The standard path for new projects is the other way around: a plain
 * mcp-use project (own `MCPServer`, `views/` convention, `mcp-use dev` /
 * `build` / `start`) with {@link installToolkit} on top — the CLI then owns
 * view building and serving, and this wrapper is not involved.
 *
 * Views are mcp-use-native either way: every tool registered with a `view`
 * binding (render-view, plus each plugin's model-visible widget tools) is
 * collected during boot, and the view registry is then primed once with the
 * compiled app bundle from `app.bundle` — one bundle, many view names,
 * mcp-use owns the resources and the `_meta.ui` wire keys.
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
export async function createFrameworkApp<TUser>(
  options: CreateFrameworkAppOptions<TUser>,
): Promise<MCPServer<TUser>> {
  // `baseUrl` is deliberately absent: mcp-use 2.x resolves the serving origin
  // from the request (or the MCP_URL env var) and injects it into the view
  // resource CSP itself.
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
  const server = options.oauth
    ? new MCPServer({
        ...options.serverOptions,
        ...baseConfig,
        oauth: options.oauth,
      } as unknown as ServerConfig<TUser>)
    : new MCPServer({ ...options.serverOptions, ...baseConfig })

  // The registrars are typed against the OAuth-less `MCPServer`; a
  // `MCPServer<TUser>` differs only in the `ctx.auth` its callbacks receive,
  // which none of them read.
  const serverForRegistrars = server as unknown as MCPServer

  // Collect every view name bound during boot so the registry can be primed
  // once at the end (mcp-use accepts `view` bindings before priming — they
  // are validated lazily — but priming itself is one-shot and must happen
  // before the first request). Every bound name resolves to the shared app
  // bundle: that IS the toolkit's architecture — one bundle whose widget map
  // decides what renders. Wrapping `server.tool` covers plugin registrations
  // without an API change; `never` keeps the checked assignment sound under
  // parameter contravariance (the wrapper only forwards the callback).
  const boundViews = new Set<string>()
  const originalTool: (definition: ToolDefinition, callback: never) => unknown =
    serverForRegistrars.tool.bind(serverForRegistrars)
  const wrappedTool = (definition: ToolDefinition, callback: never): unknown => {
    if (definition.view?.name) boundViews.add(definition.view.name)
    return originalTool(definition, callback)
  }
  serverForRegistrars.tool = wrappedTool as typeof serverForRegistrars.tool

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

  // Everything toolkit-owned goes through the same core `installToolkit`
  // uses standalone — this wrapper only adds server construction, middleware
  // wiring, and the inline bundle priming below. Anything the wrapper can do
  // must work through `installToolkit` on a user-owned server too.
  installToolkit(serverForRegistrars, {
    modules: options.plugins,
    refreshToolName: options.app.refreshToolName,
    csp: options.app.csp,
    builder: options.app.builder,
    catalogueToolName: options.app.catalogueToolName,
    dashboardStore: options.app.dashboardStore,
    appConfig: options.appConfig,
  })

  // Prime the view registry LAST, once every registrar and plugin has bound
  // its views. One inline entry per bound name, all sharing the same bundle
  // strings — mcp-use synthesizes the view document, serves the resource, and
  // emits the `_meta.ui` wire keys (CSP included) from here on.
  if (boundViews.size > 0) {
    const js = await readBundleFile(options.app.bundle.jsPath, "module")
    const css = options.app.bundle.cssPath
      ? await readBundleFile(options.app.bundle.cssPath, "stylesheet")
      : ""
    const entry = { kind: "inline", js, css } as const
    const manifest: ViewsManifest = Object.fromEntries([...boundViews].map((name) => [name, entry]))
    serverForRegistrars[registerViews](manifest)
  }

  return server
}
