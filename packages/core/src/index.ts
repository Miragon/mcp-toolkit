export type {
  StepOutput,
  StepResult,
  PipelineContext,
  PipelineStepDefinition,
  WidgetProps,
  WidgetSize,
  WidgetDefinition,
  AppDefinition,
  AppPlugin,
  PipelineConfig,
  PipelineStepRef,
  AppConfig,
  AppConfigEntry,
  ValidationResult,
} from "./types/index.js"

export { executePipeline } from "./engine/pipeline-executor.js"
export type { PipelineExecutionContext } from "./engine/pipeline-executor.js"
export { validatePipeline } from "./engine/context-builder.js"
export { StepRegistry } from "./registry/step-registry.js"
export type { KeyContract } from "./registry/step-registry.js"
export { WidgetRegistry } from "./registry/widget-registry.js"
export { loadApps } from "./registry/app-loader.js"

export { renderView } from "./framework/render-view.js"
export type { RenderViewInput, RemoteWidgetInfo } from "./framework/render-view.js"
export { getBuilderCatalogue } from "./framework/catalogue.js"
export type {
  CatalogueInput,
  CataloguePayload,
  ReachableWidget,
  UnreachableWidget,
  AvailableStep,
  KeyCatalogEntry,
} from "./framework/catalogue.js"
// Dashboard store *implementations* live in the `./tools` subpath because
// the filesystem impl imports `node:fs`. Types are safe to re-export here
// for consumers typing their own stores.
export type {
  DashboardStore,
  DashboardRecord,
  DashboardSaveInput,
  DashboardSummary,
  DashboardListFilter,
  FileSystemDashboardStoreOptions,
} from "./framework/dashboard-store.js"
export { getFrameworkManifest } from "./framework/manifest.js"
export type { FrameworkManifest } from "./framework/manifest.js"
export { normalizeLayout } from "./framework/layout-types.js"
export type { LayoutConfig, RowDef } from "./framework/layout-types.js"
export { layoutSchema, rowSchema } from "./framework/layout-schemas.js"

export { resolveActiveModules } from "./framework/active-modules.js"
export { buildProxyAppConfigs } from "./proxy/build-proxy-app-configs.js"

export { buildStepFromDeclaration, dotPath } from "./pipeline/declarative-step.js"
export type { DeclarativeAppConfig } from "./pipeline/declarative-step.js"
export { discoverUpstreamModules, DEFAULT_HOST_REACT_MAJOR } from "./module-loader/discover.js"
export type { DiscoveredModule, DiscoverUpstreamModulesOptions } from "./module-loader/discover.js"
export { synthesizeModulePlugin } from "./module-loader/synthesize-plugin.js"

export { createOrgGateMiddleware } from "./middleware/org-gate.js"
export type { OrgGateMiddleware } from "./middleware/org-gate.js"
export { createRoleFilterMiddleware } from "./middleware/role-filter.js"
export type { RoleFilterMiddleware, RoleFilterMiddlewares } from "./middleware/role-filter.js"

// NOTE: Tool registrars (`createToolRegistrar`, `createWidgetToolRegistrar`)
// live in the `./tools` subpath export because they import from
// `mcp-use/server` at runtime. Keeping them out of the main barrel prevents
// consumers that only need the framework types and runtime (e.g. a React UI
// bundle) from pulling `mcp-use/server` into their browser graph.
