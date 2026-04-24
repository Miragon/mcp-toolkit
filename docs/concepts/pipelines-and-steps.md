# Pipelines and steps

A **step** is a unit of data resolution. A **pipeline** is an ordered list
of steps; each one can publish keys that downstream steps consume. Widgets
render from the final key map.

## Step shape

```ts
interface PipelineStepDefinition<TConfig = unknown> {
  id: string // "<app>:<slug>", e.g. "lexoffice:load-invoice"
  dataType: string // what this step emits, e.g. "lexoffice:invoice"
  requires: string[] // keys that must exist before running
  produces: string[] // keys this step writes into context
  execute: (context: PipelineContext, appConfig: TConfig) => Promise<StepOutput>
}

interface StepOutput {
  data: unknown
  keys: Record<string, unknown>
  _app: string
  _step: string
}
```

The executor appends `_dataType` to produce the stored `StepResult`.

## Executor contract

`executePipeline(config, initialKeys, registry, appConfigs?, ctx?)`:

- Runs each step in declaration order.
- Skips a step if `ref.optional` is true and either the step isn't registered
  or required keys are missing.
- Records the error (not a throw) otherwise.
- Merges each step's `keys` into the running context; later steps see them.
- **Pre-binds `userId`**: if the step's `appConfig` has a `callTool(name, args, ctx?)`
  function, wraps it so the step sees a clean 2-arg `callTool(name, args)`.

See `packages/core/src/engine/pipeline-executor.ts`.

## Where `appConfig` comes from

Per-app, built once at boot by `buildProxyAppConfigs(plugins, proxies)`:

- Starts from `plugin.appConfig ?? {}`.
- If `plugin.proxyBinding` matches a registered `UpstreamProxyPlugin`,
  injects a `callTool` that dispatches through that proxy.
- Keyed by `plugin.definition.name`; the executor picks the entry via
  `ref.step.split(":")[0]`.

## Writing a step

```ts
import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { LexofficeCallTool } from "../generated/tools.js"

export const resolveInvoice: PipelineStepDefinition<{ callTool: LexofficeCallTool }> = {
  id: "lexoffice:resolve-invoice",
  dataType: "lexoffice:invoice",
  requires: ["lexoffice:invoiceNumber"],
  produces: ["lexoffice:invoice"],
  async execute(ctx, { callTool }) {
    const invoiceNumber = ctx.keys["lexoffice:invoiceNumber"] as string
    const result = await callTool("lexoffice_retrieve-invoice", { invoiceNumber })
    return {
      _app: "lexoffice",
      _step: "resolve-invoice",
      data: result,
      keys: { "lexoffice:invoice": result },
    }
  },
}
```

## Driving steps from `render-view`

```jsonc
{
  "keys": { "lexoffice:invoiceNumber": "RE-0001" },
  "steps": [{ "id": "invoice", "step": "lexoffice:resolve-invoice" }],
  "layout": { "rows": [{ "row": [{ "widget": "lexoffice:invoice-header" }] }] },
}
```

`ref.id` is the key where the step's full `StepResult` is stored under
`context.stepData[ref.id]`. `ref.step` is the registered step id.

## See also

- [typed-call-tool-in-steps](../guides/typed-call-tool-in-steps.md) — injecting
  a typed `callTool` from an upstream proxy.
- [layout-and-rendering](../guides/layout-and-rendering.md) — how `render-view`
  consumes the pipeline output.
- [debugging-pipeline-steps](../recipes/debugging-pipeline-steps.md).
