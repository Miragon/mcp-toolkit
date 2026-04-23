# Typed `callTool` in steps

Pipeline steps dispatch to upstream MCP tools through a typed `callTool`
closure on their `appConfig`. This guide covers how the closure gets there,
what the executor does with it, and how to type it.

## What gets injected, where

During boot, `createFrameworkApp` calls:

```ts
const appConfigs = buildProxyAppConfigs(plugins, proxies)
```

For each plugin:

- No `proxyBinding` → `appConfigs[plugin.definition.name] = plugin.appConfig ?? {}`.
- `proxyBinding` matches a known `UpstreamProxyPlugin` →
  `appConfigs[name] = { ...plugin.appConfig, callTool }` where `callTool`
  is a 3-arg closure `(toolName, args, ctx?) → proxy.callUpstream(…)`.

`executePipeline` picks a step's entry by `ref.step.split(":")[0]` (the app
name) and runs it through `bindAppConfig(ctx)`, which converts the 3-arg
closure into the 2-arg shape steps see — with the caller's `userId` already
bound.

Source: `packages/core/src/proxy/build-proxy-app-configs.ts`,
`packages/core/src/engine/pipeline-executor.ts`.

## Declaring the step's type

Pull in the generated `<Proxy>CallTool` type:

```ts
import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { LexofficeCallTool } from "../generated/tools.js"

export const step: PipelineStepDefinition<{ callTool: LexofficeCallTool }> = {
  id: "lexoffice:resolve-invoice",
  dataType: "lexoffice:invoice",
  requires: ["lexoffice:invoiceNumber"],
  produces: ["lexoffice:invoice"],
  async execute(ctx, { callTool }) {
    const inv = await callTool("lexoffice_retrieve-invoice", {
      invoiceNumber: String(ctx.keys["lexoffice:invoiceNumber"]),
    })
    // inv is typed from the upstream's outputSchema (or `unknown` if absent)
    return {
      _app: "lexoffice",
      _step: "resolve-invoice",
      data: inv,
      keys: { "lexoffice:invoice": inv },
    }
  },
}
```

`TypedCallTool<LexofficeToolMap>` is a 2-arg signature — the pipeline
executor pre-binds `userId` so steps don't touch it.

## Plugin-side wiring

```ts
export function createPlugin(): AppPlugin {
  return {
    definition, // contains `steps: [step]`
    proxyBinding: "lexoffice", // must equal the proxy `name` in MCP_PROXIES
  }
}
```

## Edge cases

**Proxy missing / misnamed.** If `proxyBinding` names a proxy that doesn't
exist in `proxies`, `buildProxyAppConfigs` logs a warning and skips the
injection. The step will then find `appConfig.callTool === undefined` and
crash on first use — fix the mismatch and restart.

**oauth2 without a user session.** `callUpstream` throws:
`no active session for user "<userId>". User must complete
<name>_authenticate first.` Catch it in the step if you want a nicer
user-facing error.

**Static modes before `init`.** `callUpstream` also throws if `init(server)`
never ran. `createFrameworkApp` awaits init for you, so this is only a
concern if you wire a server by hand.

**Role-filter middleware does not apply here.** Step dispatch bypasses the
public RPC surface. If your step path needs a role check, add it explicitly.
See [middleware](../concepts/middleware.md).

## Without codegen

If you're wrapping a tiny upstream and don't want codegen, type the closure
by hand:

```ts
import type { TypedCallTool } from "@miragon/mcp-toolkit-tool-codegen/runtime"

type MyToolMap = {
  "items_get-item": { input: { id: string }; output: { id: string; name: string } }
}

const step: PipelineStepDefinition<{ callTool: TypedCallTool<MyToolMap> }> = { ... }
```

## Reference

- `TypedCallTool<TMap>` → `packages/tool-codegen/src/runtime.ts`
- `buildProxyAppConfigs` → `packages/core/src/proxy/build-proxy-app-configs.ts`
- `bindAppConfig` → `packages/core/src/engine/pipeline-executor.ts`
