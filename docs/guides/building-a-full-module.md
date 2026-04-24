# Building a full module

A "full module" owns its data — it registers MCP tools, pipeline steps,
and widgets in a single plugin. Use this shape when the module wraps an
API you want the host to call directly (no separate upstream MCP).

For the opposite cases see:

- [Building a UI-only module](building-a-ui-only-module.md) — wrap an
  existing upstream MCP by binding a plugin to a proxy.
- [Registering upstream proxies](registering-upstream-proxies.md) —
  federate an external MCP under the host's namespace.

The repo's `examples/` directory focuses on the UI-only + upstream-hosted
paths, so there is no runnable "full module" in `examples/modules/`
today. The pattern below still holds; drop it next to any of the other
plugins in a consumer project.

## Layout

```
modules/my-module/
├── definition.ts      AppDefinition: name, steps, widgets
├── plugin.ts          createPlugin() → AppPlugin
├── steps/*.ts         PipelineStepDefinition
├── widgets/*.tsx      React components
├── tools/*.ts         tool handlers (domain logic)
├── package.json
└── tsconfig.json
```

## Wire

```ts
// definition.ts
import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { greetStep } from "./steps/greet.js"

export const definition: AppDefinition = {
  name: "greeter",
  steps: [greetStep],
  widgets: [{ id: "greeter:greeting-card", requires: ["greeter:greeting"], size: "half" }],
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
          name: "greeter_say-hi",
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
  id: "greeter:greet",
  dataType: "greeter:greeting",
  requires: ["greeter:name"],
  produces: ["greeter:greeting"],
  async execute(ctx) {
    const greeting = `Hello, ${ctx.keys["greeter:name"] ?? "world"}!`
    return {
      _app: "greeter",
      _step: "greet",
      data: { greeting },
      keys: { "greeter:greeting": greeting },
    }
  },
}
```

## Widget

```tsx
// widgets/GreetingCard.tsx
import type { WidgetProps } from "@miragon/mcp-toolkit-core"

export function GreetingCard({ keys }: WidgetProps) {
  return <p>{String(keys["greeter:greeting"])}</p>
}
```

## Register

In the host:

```ts
import { createPlugin as createGreeterPlugin } from "./modules/greeter/plugin.js"

await createFrameworkApp({
  ...,
  plugins: [createGreeterPlugin()],
  ...
})
```

## Verify end-to-end

Call `render-view` with the module's keys + layout:

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{
    "name":"render-view",
    "arguments":{
      "keys":{"greeter:name":"Ada"},
      "steps":[{"id":"greeting","step":"greeter:greet"}],
      "layout":{"rows":[{"row":[{"widget":"greeter:greeting-card","span":6}]}]}
    }
  }
}
JSON
```

The host-bundled UI path in
[`examples/modules/articles/`](../../examples/modules/articles/) is the
closest runnable reference in the repo — same plugin/definition/step
shape, the only difference is that its tools live on an upstream MCP
instead of being registered in-plugin.

## See also

- [Pipelines and steps](../concepts/pipelines-and-steps.md)
- [Widgets](../concepts/widgets.md)
- [Layout and rendering](layout-and-rendering.md)
