export { createToolRegistrar } from "./register-tool.js"
export type { ToolConfig, RegisteredToolMeta } from "./register-tool.js"
export { createWidgetToolRegistrar } from "./register-widget-tool.js"
export type { WidgetToolConfig, WidgetToolVisibility } from "./register-widget-tool.js"
export { withToolErrors } from "./with-tool-errors.js"
export { textResult, objectResult, errorResult } from "./tool-results.js"
export { registerFrameworkTools, RENDER_VIEW_NAME } from "./register-framework-tools.js"
export type { RegisterFrameworkToolsOptions, AppResourceCsp } from "./register-framework-tools.js"
export { registerCatalogueTool } from "./register-catalogue-tool.js"
export type { RegisterCatalogueToolOptions } from "./register-catalogue-tool.js"
export { registerDashboardTools } from "./register-dashboard-tools.js"
export type { RegisterDashboardToolsOptions } from "./register-dashboard-tools.js"
export { installToolkit } from "./install-toolkit.js"
export type { InstallToolkitOptions, InstalledToolkit } from "./install-toolkit.js"
export { createFrameworkApp } from "./create-framework-app.js"
export type { CreateFrameworkAppOptions } from "./create-framework-app.js"
export {
  createBackendRegistry,
  withBackend,
  BackendNotSelectedError,
  UnknownBackendError,
} from "./backend-registry.js"
export type {
  BackendRegistry,
  BackendEntry,
  ResolvedBackend,
  CreateBackendRegistryOptions,
} from "./backend-registry.js"

// Dashboard-store implementations are server-side (the filesystem impl
// imports `node:fs`). Consumers wire them through `createFrameworkApp`'s
// `app.dashboardStore`.
export {
  createInMemoryDashboardStore,
  createFileSystemDashboardStore,
  DashboardOwnershipError,
  resolveSavedRecord,
  parseDashboardRecord,
  DASHBOARD_SCHEMA_VERSION,
} from "./dashboard-store.js"
export type {
  DashboardStore,
  DashboardRecord,
  DashboardSaveInput,
  DashboardSummary,
  DashboardListFilter,
  FileSystemDashboardStoreOptions,
} from "./dashboard-store.js"
