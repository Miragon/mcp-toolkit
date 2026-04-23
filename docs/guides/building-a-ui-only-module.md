# Building a UI-only module

Use this when an external MCP server already exists and you want to add
typed widgets + pipeline steps on top of it — without re-implementing its
tools.

The external MCP's tools get federated by an `UpstreamProxyPlugin`
(e.g. `items_echo`, `items_get-item`). The UI-only plugin then ships
widgets that read from the context, and steps that dispatch tool calls
through a typed `callTool` closure the toolkit injects.

## Prerequisites

- An `UpstreamProxyPlugin` registered for the upstream (either directly or
  via `MCP_PROXIES`).
- `@miragon/mcp-toolkit-tool-codegen` installed for build-time types.

## Layout

```
modules/items-ui/
├── src/
│   ├── definition.ts       AppDefinition: name, steps, widgets
│   ├── plugin.ts           createPlugin() → { definition, proxyBinding }
│   ├── steps/*.ts          typed steps using <TypedCallTool>
│   ├── widgets/*.tsx       React components using generated hooks
│   └── generated/          codegen output — committed
│       ├── tools.ts
│       └── hooks.tsx
├── codegen.config.ts
└── package.json
```

Runnable version: [`examples/modules/items-ui/`](../../examples/modules/items-ui/).

## Generate the types

```ts
// codegen.config.ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

export default {
  proxyName: "items",
  upstreamUrl: process.env.UPSTREAM_MOCK_URL ?? "http://localhost:4000/mcp",
  auth: { mode: "none" },
  out: "./src/generated",
} satisfies CodegenConfig
```

```sh
pnpm mcp-tool-codegen generate
```

Outputs `tools.ts` (typed `<Proxy>ToolMap`, `<Proxy>CallTool`) and
`hooks.tsx` (typed React Query hooks like `useItemsGetItem`). Commit both
so contributors don't need the upstream reachable just to compile.

## Plugin

```ts
// plugin.ts
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { definition } from "./definition.js"

export function createPlugin(): AppPlugin {
  return {
    definition,
    proxyBinding: "items", // must match the proxy `name` in MCP_PROXIES
  }
}
```

No `registerTools`. The proxy already federates the upstream's tools; the
`proxyBinding` tells `buildProxyAppConfigs` to inject a typed `callTool`
into this plugin's `appConfig` at boot.

## Step using the typed `callTool`

```ts
// steps/resolve-item.ts
import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { ItemsCallTool } from "../generated/tools.js"

export const resolveItemStep: PipelineStepDefinition<{ callTool: ItemsCallTool }> = {
  id: "items-ui:resolve-item",
  dataType: "items-ui:item",
  requires: ["items-ui:itemId"],
  produces: ["items-ui:item"],
  async execute(ctx, { callTool }) {
    const id = String(ctx.keys["items-ui:itemId"])
    const item = await callTool("items_get-item", { id })
    return {
      _app: "items-ui",
      _step: "resolve-item",
      data: item,
      keys: { "items-ui:item": item },
    }
  },
}
```

Full auto-completion on tool name, args, and return type.

## Widget using the typed hook

```tsx
// widgets/ItemCard.tsx
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { useItemsGetItem } from "../generated/hooks.js"

export function ItemCard({ keys }: WidgetProps) {
  const id = String(keys["items-ui:itemId"] ?? "")
  const { data, isLoading } = useItemsGetItem({ id }, { enabled: !!id })
  if (isLoading) return <p>Loading…</p>
  if (!data) return null
  return (
    <div>
      <strong>{data.name}</strong>
    </div>
  )
}
```

## Register

```ts
import { createPlugin as createItemsPlugin } from "./modules/items-ui/plugin.js"

await createFrameworkApp({
  ...,
  plugins: [createItemsPlugin()],
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES), // must include "items"
  ...
})
```

## Verify end-to-end

```sh
cd vendor/mcp-toolkit
pnpm --filter @miragon/mcp-toolkit-examples dev:upstream  # term 1
pnpm --filter @miragon/mcp-toolkit-examples dev:host      # term 2
# tools/call render-view with examples/layouts/items-layout.yaml shape
```

## See also

- [Using tool-codegen](using-tool-codegen.md)
- [Typed callTool in steps](typed-call-tool-in-steps.md)
- [Upstream proxies concept](../concepts/upstream-proxies.md)
