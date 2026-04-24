# `@miragon/mcp-toolkit-core` — API reference

Three subpath exports.

## `@miragon/mcp-toolkit-core` (main)

Runtime + types. No dependency on `mcp-use/server` — safe to import from
widget bundles or browser code.

### Types

| Symbol                            | Purpose                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `AppDefinition`                   | `{ name, steps, widgets }`.                                                        |
| `AppPlugin<TServer>`              | `{ definition, appConfig?, proxyBinding?, registerTools?, registerWidgetTools? }`. |
| `PipelineStepDefinition<TConfig>` | `{ id, dataType, requires, produces, execute(ctx, appConfig) }`.                   |
| `PipelineContext`                 | `{ steps, keys, errors }`.                                                         |
| `StepOutput` / `StepResult`       | Step return value; `StepResult` adds `_dataType`.                                  |
| `WidgetDefinition`                | `{ id, requires, size }`.                                                          |
| `WidgetSize`                      | `"quarter"` \| `"third"` \| `"half"` \| `"full"` \| `"header"`.                    |
| `WidgetProps`                     | `{ keys, context }`.                                                               |
| `PipelineConfig`                  | `{ steps?: PipelineStepRef[] }`.                                                   |
| `PipelineStepRef`                 | `{ id, step, optional? }`.                                                         |
| `AppConfig`                       | `{ activeApps: AppConfigEntry[], pipelines: Record<id, PipelineConfig> }`.         |
| `ValidationResult`                | `{ valid, issues, availableKeys }`.                                                |

### Runtime

| Symbol                     | Signature                                                                       |
| -------------------------- | ------------------------------------------------------------------------------- |
| `executePipeline`          | `(config, initialKeys, registry, appConfigs?, ctx?) → Promise<PipelineContext>` |
| `validatePipeline`         | `(config, registry, availableKeys) → ValidationResult`                          |
| `StepRegistry`             | Class. `register(step)`, `get(id)`, `getAll()`, `getKeyContracts()`.            |
| `WidgetRegistry`           | Class. `register(w)`, `get(id)`, `getAll()`.                                    |
| `loadApps`                 | `(defs, stepRegistry, widgetRegistry) → void`.                                  |
| `PipelineExecutionContext` | `{ userId? }`.                                                                  |
| `KeyContract`              | `{ key, producedBy[], consumedBy[] }`.                                          |

### Framework helpers

| Symbol                       | Signature                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `renderView`                 | `(input: RenderViewInput, stepRegistry, appConfigs?, ctx?) → Promise<{ content, structuredContent?, isError? }>` |
| `RenderViewInput`            | `{ keys?, steps?, layout, title? }`.                                                                             |
| `getFrameworkManifest`       | `(stepRegistry, widgetRegistry, config) → FrameworkManifest`                                                     |
| `FrameworkManifest`          | `{ activeApps, steps, widgets, pipelines, keyContracts }`.                                                       |
| `normalizeLayout`            | `(layout) → { rows?, tabs? }`.                                                                                   |
| `LayoutConfig` / `RowDef`    | Static types for the layout shape.                                                                               |
| `layoutSchema` / `rowSchema` | Zod schemas validated by `render-view`.                                                                          |
| `resolveActiveModules`       | `(envValue?, known: string[]) → string[]`.                                                                       |

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

## `@miragon/mcp-toolkit-core/tools`

Server-side registrars — imports `mcp-use/server`. Keep out of browser bundles.

| Symbol                           | Signature                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `createFrameworkApp`             | `(opts: CreateFrameworkAppOptions) → Promise<MCPServer>`                                                                         |
| `CreateFrameworkAppOptions`      | `{ name, version?, baseUrl?, host?, oauth?, plugins, proxies, callbackBaseUrl?, middleware?, app, appConfig?, secretResolver? }` |
| `registerFrameworkTools`         | `(server, opts: RegisterFrameworkToolsOptions) → void`.                                                                          |
| `RegisterFrameworkToolsOptions`  | `{ stepRegistry, widgetRegistry, config, appConfigs, plugins, resourceUri, htmlPath, refreshToolName? }`.                        |
| `registerUpstreamProxies`        | `(server, opts: RegisterUpstreamProxiesOptions) → Promise<UpstreamProxyPlugin[]>`.                                               |
| `RegisterUpstreamProxiesOptions` | `{ entries, callbackBaseUrl?, secretResolver? }`.                                                                                |
| `createToolRegistrar`            | `(ToolConfig) → RegisteredToolMeta`. Helper for scripts.                                                                         |
| `createWidgetToolRegistrar`      | `(WidgetToolConfig) → …`.                                                                                                        |

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
| `UserUpstreamSession`            | `{ client, session }`.                                                                                                                                        |
| `PendingAuth`                    | `{ userId, serverName, provider, inboundSessionId }`.                                                                                                         |
| `PROXY_NAME_PATTERN`             | `RegExp` — `/^[a-z][a-z0-9-]*$/`.                                                                                                                             |
| `buildProxyAppConfigs`           | Re-exported from the main entry for convenience.                                                                                                              |

## Source map

```
packages/core/src/
├── types/            runtime-safe types
├── engine/           pipeline-executor, context-builder
├── registry/         step-registry, widget-registry, app-loader
├── framework/        render-view, manifest, layout-*, active-modules
├── middleware/       org-gate, role-filter
├── proxy/            UpstreamProxyPlugin + SessionStore + ServerSideOAuthProvider
└── tools/            registrars — import mcp-use/server
```
