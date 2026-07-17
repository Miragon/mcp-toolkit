# Typed `callTool` in steps

Pipeline steps can dispatch tool-style calls through a typed `callTool`
closure on their `appConfig`. This guide covers how the closure gets there,
what the executor does with it, and how to type it.

## What gets injected, where

The plugin itself owns the closure: it puts a `callTool` function into its
`appConfig`, and `createFrameworkApp` hands that `appConfig` to the
plugin's steps at execution time (keyed by app name — `executePipeline`
picks a step's entry by `ref.step.split(":")[0]`).

Before the step runs, the executor's `bindAppConfig` rewraps any
`callTool` it finds: the step-facing signature stays 2-arg
`(toolName, args)`, while the underlying closure receives the current
per-request context (`{ userId }`) as a hidden 3rd argument. Steps stay
synchronous and userId-free; the closure can still scope data per user.

Source: `packages/core/src/engine/pipeline-executor.ts`.

## Declaring the step's type

Pull in the generated namespace-specific `CallTool` type (e.g.
`ArticlesCallTool` from [tool-codegen](using-tool-codegen.md)):

```ts
import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { ArticlesCallTool } from "../generated/tools.js"

export const step: PipelineStepDefinition<{ callTool: ArticlesCallTool }> = {
  id: "articles:resolve-article",
  dataType: "articles:article",
  requires: ["articles:articleId"],
  produces: ["articles:article"],
  async execute(ctx, { callTool }) {
    const article = await callTool("articles_get-article", {
      id: String(ctx.keys["articles:articleId"]),
    })
    // article is typed from the source's outputSchema (or `unknown` if absent)
    return {
      _app: "articles",
      _step: "resolve-article",
      data: article,
      keys: { "articles:article": article },
    }
  },
}
```

`TypedCallTool` (with `ArticlesToolMap` as its generic argument) collapses
to a 2-arg signature — the pipeline executor pre-binds `userId` so steps
don't touch it.

## Plugin-side wiring

The plugin injects the implementation. In the examples' articles module it
is an in-process closure over the module's own store; in your project it
can be anything with the same typed surface — a REST client, a DB call, or
an MCP client session:

```ts
export function createPlugin(): AppPlugin {
  const store = createArticleStore()
  return {
    definition, // contains `steps: [step]`
    appConfig: { callTool: createArticlesCallTool(store) },
    registerTools: (server) => registerArticleTools(server as MCPServer, store),
  }
}
```

See `examples/modules/articles/plugin.ts` for the full implementation
including the documented cast a switch-based `TypedCallTool` needs.

## Edge cases

**Missing closure.** If the plugin forgets to put `callTool` into its
`appConfig`, the step finds `appConfig.callTool === undefined` and crashes
on first use — wire the closure in `createPlugin()`.

**Role-filter middleware does not apply here.** Step dispatch bypasses the
public RPC surface. If your step path needs a role check, add it explicitly.
See [middleware](../concepts/middleware.md).

## Without codegen

If the tool surface is tiny and you don't want codegen, type the closure
by hand:

```ts
import type { TypedCallTool } from "@miragon/mcp-toolkit-tool-codegen/runtime"

type MyToolMap = {
  "articles_get-article": {
    input: { id: string }
    output: { id: string; title: string; author: string }
  }
}

const step: PipelineStepDefinition<{ callTool: TypedCallTool<MyToolMap> }> = { ... }
```

## Reference

- `TypedCallTool` → `packages/tool-codegen/src/runtime.ts`
- `bindAppConfig` → `packages/core/src/engine/pipeline-executor.ts`
- Worked example → `examples/modules/articles/`
