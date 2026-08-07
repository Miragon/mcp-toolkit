import { type MCPServer } from "mcp-use"
import { loadApps } from "../registry/app-loader.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import { createInMemoryDashboardStore, type DashboardStore } from "../framework/dashboard-store.js"
import type { AppConfig, AppDefinition, AppPlugin } from "../types/index.js"
import type { AppResourceCsp } from "../types/meta.js"
import { registerFrameworkTools } from "./register-framework-tools.js"
import { registerCatalogueTool } from "./register-catalogue-tool.js"
import { registerDashboardTools } from "./register-dashboard-tools.js"

export interface InstallToolkitOptions {
  /**
   * App definitions contributing steps + widgets to the pipeline registries —
   * the lightweight input when all a project wants is `render-view` and the
   * composition features on top of its own tools. For modules that also
   * register tools of their own, use {@link modules}.
   */
  apps?: AppDefinition[]
  /**
   * Full module bundles ({@link AppPlugin}): an app definition plus optional
   * `registerTools` / `registerWidgetTools` hooks and per-app step config.
   * `registerTools` runs before the framework tools, `registerWidgetTools`
   * inside them (receiving the CSP meta defaults).
   */
  modules?: AppPlugin[]
  /** Override the refresh tool name (default: `refresh-view`). */
  refreshToolName?: string
  /**
   * Additional CSP origins advertised on the view resources (`_meta.ui.csp`)
   * and widget tools (`openai/widgetCSP`). The server origin is appended by
   * mcp-use itself at emission time.
   */
  csp?: AppResourceCsp
  /**
   * Opt into the visual in-iframe builder platform: registers
   * `get-builder-catalogue` plus the dashboard CRUD quartet, and advertises
   * `builderAvailable` in every view payload. Defaults to `false` (lean).
   */
  builder?: boolean
  /** Override the catalogue tool name; only relevant with {@link builder}. */
  catalogueToolName?: string
  /**
   * Persistence for the dashboard CRUD tools; defaults to an in-memory store.
   * Only relevant with {@link builder}.
   */
  dashboardStore?: DashboardStore
  /** Overrides the active-apps/pipelines config derived from apps + modules. */
  appConfig?: AppConfig
}

/** The registries {@link installToolkit} built — for advanced composition. */
export interface InstalledToolkit {
  stepRegistry: StepRegistry
  widgetRegistry: WidgetRegistry
}

/**
 * Install the toolkit's composition features on an existing `MCPServer` —
 * the "standard mcp-use project, toolkit on top" entry point.
 *
 * The server stays yours: you construct it, register your own tools and
 * middleware, run it through the mcp-use CLI (`mcp-use dev` / `build` /
 * `start`) or embed it yourself. This call adds the framework surface on
 * top: `get-framework-manifest`, `render-view` (bound to its own view),
 * the app-only `refresh-view`, each module's widget tools, and — with
 * `builder: true` — the catalogue + dashboard tools.
 *
 * View delivery follows however the server is run:
 *
 * - **mcp-use CLI** (the standard path): create `views/render-view/view.tsx`
 *   (plus `views/<tool>/view.tsx` per model-visible widget tool) rendering
 *   `McpToolkitApp` with the widget map — the CLI discovers, builds, and
 *   serves them by convention; nothing to wire here.
 * - **Own process with an own bundle**: use `createFrameworkApp`, the
 *   batteries-included wrapper that composes this function with server
 *   construction and inline bundle priming.
 *
 * A half-wired setup cannot fail silently: mcp-use validates at mount (first
 * request) that every `view`-bound tool has a primed view, and rejects with a
 * message pointing at the CLI otherwise.
 */
export function installToolkit(
  server: MCPServer,
  options: InstallToolkitOptions = {},
): InstalledToolkit {
  const stepRegistry = new StepRegistry()
  const widgetRegistry = new WidgetRegistry()

  const apps = options.apps ?? []
  const modules = options.modules ?? []

  // Step/widget ids are author-controlled, so a collision is a real bug and
  // must fail loud (hard throw).
  loadApps([...apps, ...modules.map((m) => m.definition)], stepRegistry, widgetRegistry)

  for (const module of modules) {
    module.registerTools?.(server)
  }

  // Per-app step configuration: each module's `appConfig` keyed by app name.
  // A module may inject closures here (e.g. a typed `callTool`) — the pipeline
  // executor pre-binds the per-request user context on any `callTool` it finds
  // (see `pipeline-executor.ts:bindAppConfig`).
  const appConfigs: Record<string, Record<string, unknown>> = Object.fromEntries(
    modules.map((m) => [m.definition.name, m.appConfig ?? {}]),
  )
  const appConfig: AppConfig = options.appConfig ?? {
    activeApps: [
      ...apps.map((a) => ({ app: a.name, config: {} })),
      ...modules.map((m) => ({ app: m.definition.name, config: {} })),
    ],
    pipelines: {},
  }

  registerFrameworkTools(server, {
    stepRegistry,
    widgetRegistry,
    config: appConfig,
    appConfigs,
    plugins: modules,
    refreshToolName: options.refreshToolName,
    // Advertise builder availability in the view payload so the iframe shell
    // shows its Build affordance only when the catalogue/dashboard tools below
    // are actually registered.
    builderAvailable: options.builder ?? false,
    csp: options.csp,
  })

  // The visual builder platform is opt-in: the catalogue (its data source)
  // and the dashboard CRUD tools (its persistence) are registered together
  // only when `builder` is true. Lean servers leave it off so render-view /
  // the widget core stay the entire surface.
  if (options.builder) {
    registerCatalogueTool(server, {
      stepRegistry,
      widgetRegistry,
      appConfigs,
      toolName: options.catalogueToolName,
    })

    const dashboardStore = options.dashboardStore ?? createInMemoryDashboardStore()
    registerDashboardTools(server, { store: dashboardStore, widgetRegistry })
  }

  return { stepRegistry, widgetRegistry }
}
