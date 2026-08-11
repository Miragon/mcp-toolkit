export type {
  StepOutput,
  StepResult,
  PipelineContext,
  PipelineStepDefinition,
  OptionalKeyDeclaration,
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
  ViewStructuredContent,
  StepDataEntry,
  RefreshParams,
} from "./types/index.js"
export { appsSdkMeta, viewResourceUri, VIEW_RESOURCE_URI_PREFIX } from "./types/index.js"
export type { AppsSdkMetaOptions, AppResourceCsp } from "./types/index.js"

// Localization engine — a dependency-free translator shared by the server (tool
// summaries) and the UI (widget strings). Browser-safe, so it belongs in the
// root barrel; ships no catalogs (the consuming app provides its own). The UI
// `LocaleProvider`/`useLocale` (in `@miragon/mcp-toolkit-ui`) consume a
// `Translate` from here.
export { createTranslator } from "./i18n/index.js"
export type {
  Message,
  MessageCatalog,
  Catalogs,
  Translate,
  CreateTranslatorOptions,
} from "./i18n/index.js"

export { executePipeline } from "./engine/pipeline-executor.js"
export type {
  PipelineExecutionContext,
  ExecutePipelineOptions,
} from "./engine/pipeline-executor.js"
export { validatePipeline } from "./engine/context-builder.js"
export { StepRegistry } from "./registry/step-registry.js"
export type { KeyContract } from "./registry/step-registry.js"
export { WidgetRegistry } from "./registry/widget-registry.js"
export { loadApps } from "./registry/app-loader.js"

export { renderView } from "./framework/render-view.js"
export type { RenderViewInput, RenderViewOptions } from "./framework/render-view.js"
export {
  buildSingleWidgetView,
  buildComposedView,
  deriveItemCount,
  defaultSummary,
  collectLayoutWidgets,
} from "./framework/view-builders.js"
export type {
  SingleWidgetViewInput,
  ComposedViewInput,
  ComposedViewEntry,
  ViewToolResult,
} from "./framework/view-builders.js"
export { getBuilderCatalogue } from "./framework/catalogue.js"
export type {
  CatalogueInput,
  CatalogueOptions,
  CataloguePayload,
  ReachableWidget,
  UnreachableWidget,
  AvailableStep,
  KeyCatalogEntry,
} from "./framework/catalogue.js"
// Dashboard store *implementations* live in the `./tools` subpath because
// the filesystem impl imports `node:fs`. Types are safe to re-export here
// for consumers typing their own stores; runtime values
// (`DashboardOwnershipError`, `resolveSavedRecord`) are NOT, since importing
// them pulls the whole module — including its `node:fs` import — into the
// browser graph. They're exported from the `./tools` subpath instead.
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
export { layoutInputSchema, layoutSchema, rowSchema } from "./framework/layout-schemas.js"

export { resolveActiveModules, parseActiveModules } from "./framework/active-modules.js"
export type { ActiveModuleSelection } from "./framework/active-modules.js"

export { createOrgGateMiddleware } from "./middleware/org-gate.js"
export type { OrgGateMiddleware } from "./middleware/org-gate.js"
export { createRoleFilterMiddleware } from "./middleware/role-filter.js"
export type {
  RoleFilterMiddleware,
  RoleFilterMiddlewares,
  RoleFilterOptions,
  RoleFilterContext,
} from "./middleware/role-filter.js"

// NOTE: Tool registrars (`createToolRegistrar`, `createWidgetToolRegistrar`)
// live in the `./tools` subpath export because they import from
// `mcp-use` at runtime. Keeping them out of the main barrel prevents
// consumers that only need the framework types and runtime (e.g. a React UI
// bundle) from pulling the mcp-use server runtime into their browser graph.
