export { createToolRegistrar } from "./register-tool.js"
export type { ToolConfig, RegisteredToolMeta } from "./register-tool.js"
export { createWidgetToolRegistrar } from "./register-widget-tool.js"
export type { WidgetToolConfig, WidgetToolVisibility } from "./register-widget-tool.js"
export { withToolErrors } from "./with-tool-errors.js"
export { registerFrameworkTools } from "./register-framework-tools.js"
export type { RegisterFrameworkToolsOptions } from "./register-framework-tools.js"
export { registerCatalogueTool } from "./register-catalogue-tool.js"
export type { RegisterCatalogueToolOptions } from "./register-catalogue-tool.js"
export { registerDashboardTools } from "./register-dashboard-tools.js"
export type { RegisterDashboardToolsOptions } from "./register-dashboard-tools.js"
export { registerUpstreamProxies } from "./register-upstream-proxies.js"
export type { RegisterUpstreamProxiesOptions } from "./register-upstream-proxies.js"
export { createFrameworkApp } from "./create-framework-app.js"
export type { CreateFrameworkAppOptions } from "./create-framework-app.js"
export { deriveAppResourceUri } from "./app-resource-uri.js"
export type { DeriveAppResourceUriInput } from "./app-resource-uri.js"
export {
  createBackendRegistry,
  withBackend,
  BackendNotSelectedError,
  UnknownBackendError,
  DEFAULT_BACKEND_SESSION_TTL_MS,
} from "./backend-registry.js"
export type {
  BackendRegistry,
  BackendEntry,
  ResolvedBackend,
  CreateBackendRegistryOptions,
} from "./backend-registry.js"
export { installToolCallNameCapture, extractToolCallName } from "./tool-call-name.js"
export type { ToolNameResolver } from "./tool-call-name.js"

// Dashboard-store implementations are server-side (the filesystem impl
// imports `node:fs`). Consumers wire them through `createFrameworkApp`'s
// `app.dashboardStore`.
export {
  createInMemoryDashboardStore,
  createFileSystemDashboardStore,
  DashboardOwnershipError,
  resolveSavedRecord,
} from "../framework/dashboard-store.js"
export type {
  DashboardStore,
  DashboardRecord,
  DashboardSaveInput,
  DashboardSummary,
  DashboardListFilter,
  FileSystemDashboardStoreOptions,
} from "../framework/dashboard-store.js"
