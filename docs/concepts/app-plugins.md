# App plugins

An `AppPlugin` bundles everything one app contributes to the framework. A
server consumes a list of plugins; `createFrameworkApp` wires each one in.

## Shape

```ts
interface AppPlugin<TServer = MCPServer> {
  definition: AppDefinition
  appConfig?: Record<string, unknown>
  proxyBinding?: string
  registerTools?: (server: TServer) => void
  registerWidgetTools?: (server: TServer, resourceUri: string) => void
}

interface AppDefinition {
  name: string
  steps: PipelineStepDefinition[]
  widgets: WidgetDefinition[]
}
```

## What the framework does with it

1. **At boot** — `loadApps(plugin.definition)` registers every step and widget
   into `StepRegistry` + `WidgetRegistry`.
2. **At boot** — `plugin.registerTools?.(server)` registers MCP tools under
   the plugin's prefix. **Optional**: UI-only plugins omit this entirely.
3. **At boot** — `buildProxyAppConfigs(plugins, proxies)` inspects
   `plugin.proxyBinding`. If set and matching an `UpstreamProxyPlugin`,
   a typed `callTool` closure gets injected into `appConfig`. Steps receive
   this via their 2nd argument.
4. **After framework tools** — `plugin.registerWidgetTools?.(server, resourceUri)`
   registers any widget-action tools (optional).

## Two common shapes

### Full module

Registers its own tools (wraps an API, domain logic, etc.), exposes steps
that call into those tools, and ships widgets that render the results.

```ts
export function createPlugin(): AppPlugin {
  return {
    definition,
    registerTools(server) {
      server.tool({ name: "invoice_create", ... }, async (args) => { ... })
    },
    registerWidgetTools(server, resourceUri) {
      server.tool({ name: "invoice_refresh", _meta: { ui: { resourceUri } } }, ...)
    },
  }
}
```

See [building-a-full-module](../guides/building-a-full-module.md).

### UI-only module (typed proxy wrapper)

No `registerTools`. The upstream MCP's tools are already federated by the
proxy; the plugin adds typed steps and widgets on top.

```ts
export function createPlugin(): AppPlugin {
  return {
    definition,
    proxyBinding: "lexoffice", // injects callTool into appConfig
  }
}
```

See [building-a-ui-only-module](../guides/building-a-ui-only-module.md).

## Naming

- `AppDefinition.name` — lower-kebab-case, e.g. `lexoffice`, `articles`,
  `customers`.
- Step ids, widget ids, and the keys they emit all prefix with the app
  name: `articles:article-card`, `articles:articleId`,
  `customers:customer`. The prefix is how `get-framework-manifest`
  groups entries, and how steps find their `appConfig`
  (`ref.step.split(":")[0]`).

## Reference

- `AppPlugin` → `packages/core/src/types/app.ts`
- `AppDefinition` → `packages/core/src/types/app.ts`
- Registration loop → `packages/core/src/tools/create-framework-app.ts`
