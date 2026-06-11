# `@miragon/mcp-toolkit-core` — API reference

Three subpath exports.

## `@miragon/mcp-toolkit-core` (main)

Runtime + types. No dependency on `mcp-use/server` — safe to import from
widget bundles or browser code.

### Types

| Symbol                            | Purpose                                                                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppDefinition`                   | `{ name, steps, widgets }`.                                                                                                                                                                        |
| `AppPlugin<TServer>`              | `{ definition, appConfig?, proxyBinding?, registerTools?, registerWidgetTools? }`.                                                                                                                 |
| `PipelineStepDefinition<TConfig>` | `{ id, description?, dataType, requires, optionalKeys?, produces, execute(ctx, appConfig) }`.                                                                                                      |
| `OptionalKeyDeclaration`          | `{ key, description?, enum? }`. Soft inputs surfaced in `getFrameworkManifest`.                                                                                                                    |
| `PipelineContext`                 | `{ steps, keys, errors }`.                                                                                                                                                                         |
| `StepOutput` / `StepResult`       | Step return value; `StepResult` adds `_dataType`.                                                                                                                                                  |
| `WidgetDefinition`                | Discriminated union `LocalWidgetDefinition \| RemoteWidgetDefinition`. Narrow with `isRemoteWidget`.                                                                                               |
| `LocalWidgetDefinition`           | `{ id, description?, requires, consumes?, size, propsSchema? }` — code lives in the host's app-bundle.                                                                                             |
| `RemoteWidgetDefinition`          | `LocalWidgetDefinition` + `{ bundle: string, moduleId: string }` — bundle is fetched via `read-widget-bundle` at render time.                                                                      |
| `isRemoteWidget`                  | `(widget) → widget is RemoteWidgetDefinition`. Type guard.                                                                                                                                         |
| `WidgetSize`                      | `"quarter"` \| `"third"` \| `"half"` \| `"full"` \| `"header"`.                                                                                                                                    |
| `WidgetProps`                     | `{ keys, context, widgetProps? }`. `widgetProps` carries the layout cell's per-instance `props`.                                                                                                   |
| `PipelineConfig`                  | `{ steps?: PipelineStepRef[] }`.                                                                                                                                                                   |
| `PipelineStepRef`                 | `{ id, step, optional? }`.                                                                                                                                                                         |
| `AppConfig`                       | `{ activeApps: AppConfigEntry[], pipelines: Record<id, PipelineConfig> }`.                                                                                                                         |
| `ValidationResult`                | `{ valid, issues, availableKeys }`.                                                                                                                                                                |
| `ViewStructuredContent`           | The view-tool envelope (`{ context: { stepData, … }, layout, … }`) written into a `*_show_*` tool's `structuredContent`. Built by the view builders under [Framework helpers](#framework-helpers). |
| `uiMeta`                          | `(opts: UiMetaOptions) → { ui: {…} }`. Builds the `_meta.ui` block (`resourceUri`, optional app-only `visibility`) a widget tool emits. `UiMetaOptions` is `{ resourceUri, appOnly? }`.            |
| `APP_ONLY_META`                   | The constant `_meta` marker (`{ ui: { visibility: ["app"] } }`) that hides a tool from the LLM `tools/list` while keeping it widget-callable.                                                      |

### Runtime

| Symbol                     | Signature                                                            |
| -------------------------- | -------------------------------------------------------------------- |
| `executePipeline`          | `(options: ExecutePipelineOptions) → Promise<PipelineContext>`       |
| `ExecutePipelineOptions`   | `{ config, initialKeys, registry, appConfigs?, ctx? }`.              |
| `validatePipeline`         | `(config, registry, availableKeys) → ValidationResult`               |
| `StepRegistry`             | Class. `register(step)`, `get(id)`, `getAll()`, `getKeyContracts()`. |
| `WidgetRegistry`           | Class. `register(w)`, `get(id)`, `getAll()`.                         |
| `loadApps`                 | `(defs, stepRegistry, widgetRegistry) → void`.                       |
| `PipelineExecutionContext` | `{ userId? }`.                                                       |
| `KeyContract`              | `{ key, producedBy[], consumedBy[] }`.                               |

### Framework helpers

| Symbol                                                                                 | Signature                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderView`                                                                           | `(options: RenderViewOptions) → Promise<{ content, structuredContent?, isError? }>`                                                                                                                                                                                                   |
| `RenderViewOptions`                                                                    | `{ input, stepRegistry, widgetRegistry?, appConfigs?, ctx?, builderAvailable? }`. `builderAvailable` is echoed into `structuredContent.builderAvailable` so the shell only shows its Build affordance when the server's builder platform is on.                                       |
| `RenderViewInput`                                                                      | `{ keys?, steps?, layout, title? }`.                                                                                                                                                                                                                                                  |
| `RemoteWidgetInfo`                                                                     | `{ bundle, moduleId }`.                                                                                                                                                                                                                                                               |
| `buildSingleWidgetView`                                                                | `(input: SingleWidgetViewInput) → ViewToolResult`. Build the `*_show_*` view envelope for a single widget — wraps one record as a `ViewStructuredContent` so a widget tool's `structuredContent` is directly renderable by `McpAppView` / decodable by `parseViewToolResult`.         |
| `buildComposedView`                                                                    | `(input: ComposedViewInput) → ViewToolResult`. Build a multi-widget view envelope from several `ComposedViewEntry` rows (each a widget + its data). See [view-builder concept](../concepts/view-builder.md).                                                                          |
| `ViewStructuredContent`                                                                | The view envelope written into a view tool's `structuredContent`: `{ context: { stepData, … }, layout, … }`. Consumed by `McpAppView`.                                                                                                                                                |
| `SingleWidgetViewInput` / `ComposedViewInput` / `ComposedViewEntry` / `ViewToolResult` | Input/return types for the two view builders.                                                                                                                                                                                                                                         |
| `collectLayoutWidgets`                                                                 | `(layout) → string[]`. The widget ids a layout references — used to filter `remoteWidgets` to the layout (and by `save-dashboard` validation).                                                                                                                                        |
| `deriveItemCount` / `defaultSummary`                                                   | Helpers the view builders use to derive a row count / a default model-context summary from a record.                                                                                                                                                                                  |
| `getBuilderCatalogue`                                                                  | `(options: CatalogueOptions) → Promise<{ content, structuredContent: CataloguePayload }>`. Backs the app-only `get-builder-catalogue` tool used by the iframe builder. See [view-builder concept](../concepts/view-builder.md).                                                       |
| `CatalogueOptions`                                                                     | `{ input, stepRegistry, widgetRegistry, appConfigs?, ctx? }`.                                                                                                                                                                                                                         |
| `CatalogueInput`                                                                       | `{ keys?, steps? }` — what the builder is currently working with.                                                                                                                                                                                                                     |
| `CataloguePayload`                                                                     | `{ context, reachableWidgets, unreachableWidgets, availableSteps, keyCatalog, remoteWidgets, validationIssues }`. `validationIssues` mirrors the fail-soft pipeline issues so the builder can warn before a (fail-hard) `render-view`.                                                |
| `ReachableWidget`                                                                      | `{ id, app, requires, size }` — palette entry for the builder UI.                                                                                                                                                                                                                     |
| `UnreachableWidget`                                                                    | `{ id, app, requires, size, missingKeys }` — registered widget not satisfied by the current key set.                                                                                                                                                                                  |
| `AvailableStep`                                                                        | `{ id, app, dataType, requires, produces }` — step picker entry.                                                                                                                                                                                                                      |
| `KeyCatalogEntry`                                                                      | `{ key, producedBySteps, consumedBySteps, consumedByWidgets, inContext }`.                                                                                                                                                                                                            |
| `getFrameworkManifest`                                                                 | `(stepRegistry, widgetRegistry, config) → FrameworkManifest`                                                                                                                                                                                                                          |
| `FrameworkManifest`                                                                    | `{ activeApps, steps[], widgets[], pipelines[], keyContracts[] }`. Each step entry exposes `description?` + `optionalKeys?`; each widget entry exposes `description?`, `consumes?`, `propsSchema?`. Each `keyContracts` entry has `producedBy`, `consumedBy`, `optionallyConsumedBy`. |
| `normalizeLayout`                                                                      | `(layout) → { rows?, tabs? }`.                                                                                                                                                                                                                                                        |
| `LayoutConfig` / `RowDef`                                                              | Static types for the layout shape.                                                                                                                                                                                                                                                    |
| `layoutSchema` / `rowSchema`                                                           | Zod schemas validated by `render-view`.                                                                                                                                                                                                                                               |
| `resolveActiveModules`                                                                 | `(envValue?, known: string[]) → string[]`.                                                                                                                                                                                                                                            |
| `parseActiveModules`                                                                   | `(envValue?) → ActiveModuleSelection`. Lower-level parse of the `ACTIVE_MODULES`-style env value (the `"all"` sentinel + explicit list) that `resolveActiveModules` validates against the `known` set.                                                                                |

### Dashboard types (types only — impls in `/tools`)

| Symbol                            | Shape                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DashboardStore`                  | `{ save(input), list(filter), get(id, filter), delete(id, filter) }`. Pluggable persistence for `save-/list-/load-/delete-dashboard`.                                                                                                                                    |
| `DashboardRecord`                 | `{ id, name, description?, userId?, keys?, steps?, layout, title?, schemaVersion?, createdAt, updatedAt }`. The `{ keys, steps, layout, title }` slice is directly assignable to `render-view`'s input; `schemaVersion` is stamped on save (`DASHBOARD_SCHEMA_VERSION`). |
| `DashboardSaveInput`              | `{ id?, name, description?, userId?, keys?, steps?, layout, title? }`.                                                                                                                                                                                                   |
| `DashboardSummary`                | `{ id, name, description?, title?, updatedAt }`. Returned by `list`.                                                                                                                                                                                                     |
| `DashboardListFilter`             | `{ userId? }`.                                                                                                                                                                                                                                                           |
| `FileSystemDashboardStoreOptions` | `{ dir }`. Directory for per-record `<id>.json` files.                                                                                                                                                                                                                   |

### Middleware

| Symbol                                           | Signature                                     |
| ------------------------------------------------ | --------------------------------------------- |
| `createOrgGateMiddleware`                        | `(orgId?: string) → OrgGateMiddleware`.       |
| `createRoleFilterMiddleware`                     | `(roleToModules) → { toolsList, toolsCall }`. |
| `OrgGateMiddleware`                              | `(ctx, next) → Promise<unknown>`.             |
| `RoleFilterMiddleware` / `RoleFilterMiddlewares` | Same shape.                                   |

### Proxy helpers

| Symbol                 | Signature                                                    |
| ---------------------- | ------------------------------------------------------------ |
| `buildProxyAppConfigs` | `(plugins, proxies) → Record<app, Record<string, unknown>>`. |

### Module loader (upstream-hosted modules)

| Symbol                           | Signature                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `discoverUpstreamModules`        | `(opts: DiscoverUpstreamModulesOptions) → Promise<DiscoveredModule[]>`. Calls `get-module-manifest` on every proxy flagged `upstreamModules: true`, fail-soft.           |
| `DiscoverUpstreamModulesOptions` | `{ entries: ProxyConfigEntry[], proxies: UpstreamProxyPlugin[], hostReactMajor: number }`.                                                                               |
| `DiscoveredModule`               | `{ manifest: ModuleManifest, proxy: UpstreamProxyPlugin }`.                                                                                                              |
| `DEFAULT_HOST_REACT_MAJOR`       | Constant `19`. Default React major used by `discoverUpstreamModules` when none is passed. Kept in lockstep with the UI package's React peer.                             |
| `synthesizeModulePlugin`         | `(discovered: DiscoveredModule) → AppPlugin`. Turns a discovered manifest into an `AppPlugin` the toolkit's regular `loadApps` + `buildProxyAppConfigs` can ingest.      |
| `buildStepFromDeclaration`       | `(step: DeclarativeStep, moduleId: string) → PipelineStepDefinition<DeclarativeAppConfig>`. Compiles one declarative step from a module manifest.                        |
| `DeclarativeAppConfig`           | `{ callTool?: (name, args) => Promise<unknown> }`. `appConfig` shape an upstream-synthesised plugin's declarative steps see at runtime.                                  |
| `dotPath`                        | `(root, path: string) → unknown`. Resolves a dot-separated path against an arbitrary value; bails to `undefined` on missing segments. Used by declarative-step mappings. |

## `@miragon/mcp-toolkit-core/tools`

Server-side registrars — imports `mcp-use/server`. Keep out of browser bundles.

| Symbol                           | Signature                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createFrameworkApp`             | `(opts: CreateFrameworkAppOptions) → Promise<MCPServer>`. Always wires the framework tools (`get-framework-manifest`, `render-view`, `refresh-view` + the UI resource). Adds `get-builder-catalogue` + the four dashboard CRUD tools **only when `app.builder` is `true`** (opt-in; default off).                                                                                            |
| `CreateFrameworkAppOptions`      | `{ name, version?, baseUrl?, host?, oauth?, plugins, proxies, callbackBaseUrl?, middleware?, app, appConfig?, secretResolver? }`. `app` accepts `{ resourceUri, htmlPath, refreshToolName?, builder?, catalogueToolName?, dashboardStore? }`. `builder` (default `false`) gates the catalogue + dashboard tools; `catalogueToolName` / `dashboardStore` apply only when `builder` is `true`. |
| `registerFrameworkTools`         | `(server, opts: RegisterFrameworkToolsOptions) → void`.                                                                                                                                                                                                                                                                                                                                      |
| `RegisterFrameworkToolsOptions`  | `{ stepRegistry, widgetRegistry, config, appConfigs, plugins, proxies?, resourceUri, htmlPath, refreshToolName? }`.                                                                                                                                                                                                                                                                          |
| `registerCatalogueTool`          | `(server, opts: RegisterCatalogueToolOptions) → void`. Registers `get-builder-catalogue` with `visibility: ["app"]` — the iframe builder's data source. Never appears in the LLM's tools/list.                                                                                                                                                                                               |
| `RegisterCatalogueToolOptions`   | `{ stepRegistry, widgetRegistry, appConfigs, toolName? }`.                                                                                                                                                                                                                                                                                                                                   |
| `registerDashboardTools`         | `(server, opts: RegisterDashboardToolsOptions) → void`. Registers `save-/list-/load-/delete-dashboard`.                                                                                                                                                                                                                                                                                      |
| `RegisterDashboardToolsOptions`  | `{ store: DashboardStore, widgetRegistry? }`. With a registry, `save-dashboard` warns (never rejects) on layout widget ids it doesn't know.                                                                                                                                                                                                                                                  |
| `createInMemoryDashboardStore`   | `() → DashboardStore`. Process-local, lost on restart. Default when `app.builder` is `true` and `app.dashboardStore` is omitted.                                                                                                                                                                                                                                                             |
| `createFileSystemDashboardStore` | `(opts: FileSystemDashboardStoreOptions) → DashboardStore`. JSON-per-record under `opts.dir`.                                                                                                                                                                                                                                                                                                |
| `DASHBOARD_SCHEMA_VERSION`       | `number` (`1`). Stamped onto `DashboardRecord.schemaVersion` on every save.                                                                                                                                                                                                                                                                                                                  |
| `registerUpstreamProxies`        | `(server, opts: RegisterUpstreamProxiesOptions) → Promise<UpstreamProxyPlugin[]>`.                                                                                                                                                                                                                                                                                                           |
| `RegisterUpstreamProxiesOptions` | `{ entries, callbackBaseUrl?, secretResolver? }`.                                                                                                                                                                                                                                                                                                                                            |
| `createToolRegistrar`            | `(ToolConfig) → RegisteredToolMeta`. Helper for scripts.                                                                                                                                                                                                                                                                                                                                     |
| `createWidgetToolRegistrar`      | `(server, client, resourceUri) → (config: WidgetToolConfig) → void`. Registers a widget tool whose result carries the `_meta.ui.resourceUri`. `WidgetToolConfig` adds `visibility` (default `"app"`), `annotations` (MCP `ToolAnnotations`), and `meta` (extra flat `_meta`, the `ui` key reserved) to the usual `{ name, title?, description, inputSchema?, handler }`.                     |
| `WidgetToolVisibility`           | `"app" \| "model" \| ("app" \| "model")[]`. SEP-1865 `_meta.ui.visibility`: `"app"` hides the tool from the LLM (callable only from a widget), `"model"` exposes it; an array advertises both.                                                                                                                                                                                               |
| `withToolErrors`                 | `(handler) → handler`. Wraps a tool handler so thrown errors map to an `isError` MCP result instead of surfacing as a transport failure.                                                                                                                                                                                                                                                     |
| `deriveAppResourceUri`           | `(input: DeriveAppResourceUriInput) → string`. Derives the canonical `ui://<app>/mcp-app.html` resource URI used by `createFrameworkApp` and the widget-tool registrar.                                                                                                                                                                                                                      |
| `createBackendRegistry`          | `(opts: CreateBackendRegistryOptions) → BackendRegistry`. Per-session backend selection (`withBackend`) for tools that target one of several configured backends. `BackendEntry` / `ResolvedBackend` describe an entry / a resolved selection; `BackendNotSelectedError` / `UnknownBackendError` are the failure modes; `DEFAULT_BACKEND_SESSION_TTL_MS` is the default selection TTL.       |
| `withBackend`                    | `(registry, handler) → handler`. Resolves the session's selected backend and passes it to the wrapped handler.                                                                                                                                                                                                                                                                               |
| `installToolCallNameCapture`     | `(server) → ToolNameResolver`. Captures the in-flight tool name on the server so middleware (e.g. role-filter) can read it; `extractToolCallName` reads it off a request.                                                                                                                                                                                                                    |

## `@miragon/mcp-toolkit-core/proxy`

Upstream-proxy runtime.

| Symbol                           | Signature                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UpstreamProxyPlugin`            | Class implementing `AppPlugin<MCPServer>`. Key methods: `registerTools(server)`, `init(server)`, `callUpstream(toolName, args, userId?)`, `getCallbackUrl()`. |
| `UpstreamProxyPluginOptions`     | `{ name, label?, upstreamUrl, auth, sessionStore?, callbackBaseUrl? }`.                                                                                       |
| `InMemorySessionStore`           | Class. Default session store.                                                                                                                                 |
| `SessionStore`                   | Interface. `getSession`, `setSession`, `hasSession`, `getPending`, `setPending`, `deletePending`.                                                             |
| `ServerSideOAuthProvider`        | Class implementing `OAuthClientProvider` for mcp-sdk.                                                                                                         |
| `ServerSideOAuthProviderOptions` | `{ callbackUrl, clientName }`.                                                                                                                                |
| `jsonSchemaToZod`                | `(schema) → ZodSchema`. Internal, exported for advanced users.                                                                                                |
| `UpstreamAuthConfig`             | Discriminated union: `none` / `bearer` / `header` / `oauth2`.                                                                                                 |
| `UpstreamSession`                | `{ listTools, callTool, readResource }`. Minimal mcp-use session shape the proxy uses; reused by `UserUpstreamSession`.                                       |
| `UserUpstreamSession`            | `{ client, session: UpstreamSession }`.                                                                                                                       |
| `ToolHandlerContext`             | `{ auth?: { user?: { userId? } }, session?: { sessionId? } }`. Subset of mcp-use's tool-handler `ctx` the toolkit reads.                                      |
| `PendingAuth`                    | `{ userId, serverName, provider, inboundSessionId, expiresAt, nonce, authorizationUrl }`.                                                                     |
| `PROXY_NAME_PATTERN`             | `RegExp` — `/^[a-z][a-z0-9-]*$/`.                                                                                                                             |
| `buildProxyAppConfigs`           | Re-exported from the main entry for convenience.                                                                                                              |

## `@miragon/mcp-toolkit-core/rest`

A small REST client + tool helper for plugins that wrap a plain HTTP API
(no separate upstream MCP). Pair `createRestClient` with the standard
`createToolRegistrar` so REST tools share the same registration path,
error mapping, and result formatting as hand-written tools.

| Symbol               | Signature                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createRestClient`   | `(config: RestClientConfig) → RestClient`. Builds a `fetch`-backed client with URL-template expansion, query encoding, auth header stamping, JSON serialization, and `RestError` mapping for non-2xx responses.                                              |
| `createRestTool`     | `(config: RestToolConfig) → ToolConfig<RestClient>`. Produces a tool config the standard `createToolRegistrar` can register. Default `buildRequest` puts path placeholders into `pathParams`, the rest into `query` (GET/DELETE) or `body` (POST/PUT/PATCH). |
| `RestError`          | Class. `{ status, statusText, body }`. Thrown by `request()` on non-2xx; `createToolRegistrar`'s error handler renders it as `[<status>] <message>` in the MCP tool response.                                                                                |
| `RestClientConfig`   | `{ baseUrl, auth?, defaultHeaders?, fetch? }`.                                                                                                                                                                                                               |
| `RestRequestOptions` | `{ method, path, pathParams?, query?, body?, headers? }`.                                                                                                                                                                                                    |
| `RestClient`         | `{ request<T>(options), baseUrl }`.                                                                                                                                                                                                                          |
| `RestAuthConfig`     | Discriminated union: `none` / `bearer` / `header`. Mirrors `UpstreamProxyPlugin` minus oauth2 (per-user flow not yet plumbed for REST tools).                                                                                                                |
| `HttpMethod`         | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"`.                                                                                                                                                                                                           |
| `QueryValue`         | `string \| number \| boolean \| null \| undefined`. Arrays of these are also accepted on `query`.                                                                                                                                                            |
| `RestToolConfig`     | `{ name, description, category?, method, path, inputSchema?, buildRequest?, projection?, annotations?, formatResult? }`. `projection` is the main context-hygiene lever — trim raw response shape before handing it to the LLM.                              |
| `RequestParts`       | `Pick<RestRequestOptions, "pathParams" \| "query" \| "body" \| "headers">`. Return type of `buildRequest`.                                                                                                                                                   |

## Source map

```
packages/core/src/
├── types/            runtime-safe types
├── engine/           pipeline-executor, context-builder
├── registry/         step-registry, widget-registry, app-loader
├── framework/        render-view, catalogue, manifest, layout-*, dashboard-store, active-modules
├── middleware/       org-gate, role-filter
├── proxy/            UpstreamProxyPlugin + SessionStore + ServerSideOAuthProvider
├── rest/             createRestClient + createRestTool + RestError
└── tools/            registrars — import mcp-use/server
```

## See also

- [View builder concept](../concepts/view-builder.md)
- [Building dashboards end-to-end](../guides/building-dashboards.md)
