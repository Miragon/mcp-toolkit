# Building a full module

A "full module" owns its data — it registers MCP tools, pipeline steps, and
widgets in a single plugin. Use this shape when the module wraps an API you
want the host to call directly (no separate upstream MCP).

For the opposite case — wrapping an existing upstream MCP — see
[building-a-ui-only-module](building-a-ui-only-module.md).

## Layout

```
modules/my-module/
├── src/
│   ├── definition.ts   AppDefinition: name, steps, widgets
│   ├── plugin.ts       createPlugin() → AppPlugin
│   ├── steps/*.ts      PipelineStepDefinition
│   ├── widgets/*.tsx   React components
│   ├── widgets.ts      widgetComponents map for the Vite bundle
│   └── tools/*.ts      tool handlers (domain logic)
├── package.json
└── tsconfig.json
```

The [`hello-full`](../../examples/modules/hello-full/) example is a
minimal runnable version.

## Wire

```ts
// definition.ts
import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { greetStep } from "./steps/greet.js"

export const definition: AppDefinition = {
  name: "hello",
  steps: [greetStep],
  widgets: [{ id: "hello:greeting-card", requires: ["hello:greeting"], size: "half" }],
}
```

```ts
// plugin.ts
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { text } from "mcp-use/server"
import { z } from "zod"
import { definition } from "./definition.js"

export function createPlugin(): AppPlugin {
  return {
    definition,
    registerTools(server) {
      server.tool(
        {
          name: "hello_say-hi",
          description: "Returns a greeting.",
          schema: z.object({ name: z.string() }),
        },
        async ({ name }) => text(JSON.stringify({ greeting: `Hello, ${name}!` })),
      )
    },
  }
}
```

## Step

```ts
// steps/greet.ts
import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"

export const greetStep: PipelineStepDefinition = {
  id: "hello:greet",
  dataType: "hello:greeting",
  requires: ["hello:name"],
  produces: ["hello:greeting"],
  async execute(ctx) {
    const greeting = `Hello, ${ctx.keys["hello:name"] ?? "world"}!`
    return {
      _app: "hello",
      _step: "greet",
      data: { greeting },
      keys: { "hello:greeting": greeting },
    }
  },
}
```

## Widget

```tsx
// widgets/GreetingCard.tsx
import type { WidgetProps } from "@miragon/mcp-toolkit-core"

export function GreetingCard({ keys }: WidgetProps) {
  return <p>{String(keys["hello:greeting"])}</p>
}
```

## Register

In the host:

```ts
import { createPlugin as createHelloPlugin } from "./modules/hello/plugin.js"

await createFrameworkApp({
  ...,
  plugins: [createHelloPlugin()],
  ...
})
```

## Verify end-to-end

```sh
# examples/ runs both terminals already
cd vendor/mcp-toolkit
pnpm --filter @miragon/mcp-toolkit-examples dev:host
# elsewhere: call render-view with { keys: { "hello:name": "Ada" }, ... }
```

See `examples/layouts/hello-layout.yaml` for the render-view input.

## See also

- [Pipelines and steps](../concepts/pipelines-and-steps.md)
- [Widgets](../concepts/widgets.md)
- [Layout and rendering](layout-and-rendering.md)
