# Pipelines and steps

A **step** is a unit of data resolution. A **pipeline** is an ordered list
of steps; each one can publish keys that downstream steps consume. Widgets
render from the final key map.

## Step shape

```ts
interface PipelineStepDefinition<TConfig = unknown> {
  id: string // "<app>:<slug>", e.g. "lexoffice:load-invoice"
  description?: string // one-line; surfaced in get-framework-manifest
  dataType: string // what this step emits, e.g. "lexoffice:invoice"
  requires: string[] // keys that must exist before running
  optionalKeys?: OptionalKeyDeclaration[] // soft inputs (scoping/filter keys)
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

## Optional inputs (scoping keys)

Keys a step _reads_ from `ctx.keys` if present but does not strictly
need are declared via `optionalKeys`, separately from the hard `requires`
contract. The step still runs without them (typically with a default or
aggregated scope), so they don't gate execution — but they show up in
`get-framework-manifest` so an LLM constructing a `render-view` knows
which scoping keys are accepted.

```ts
interface OptionalKeyDeclaration {
  key: string // namespaced key, e.g. "analytics:processDefinitionKey"
  description?: string // one-line; what does this scoping key control
  enum?: readonly (string | number)[] // restrict to a fixed set, e.g. period: 1d|7d|30d|90d
}
```

Use `enum` when the input is a closed set so the LLM can construct valid
inputs without guessing.

## Executor contract

`executePipeline({ config, initialKeys, registry, appConfigs?, ctx? })`:

- Runs each step in declaration order.
- Skips a step if `ref.optional` is true and either the step isn't registered
  or required keys are missing.
- Records the error (not a throw) otherwise.
- Merges each step's `keys` into the running context; later steps see them.
- **Pre-binds `userId`**: if the step's `appConfig` has a `callTool(name, args, ctx?)`
  function, wraps it so the step sees a clean 2-arg `callTool(name, args)`.

See `packages/core/src/engine/pipeline-executor.ts`.

## Where `appConfig` comes from

Per-app, provided by the plugin itself via `AppPlugin.appConfig`:

- The plugin injects any closures its steps need — typically a typed
  `callTool` (see the articles module's in-process implementation).
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
  a typed `callTool` into a plugin's `appConfig`.
- [layout-and-rendering](../guides/layout-and-rendering.md) — how `render-view`
  consumes the pipeline output.
- [debugging-pipeline-steps](../recipes/debugging-pipeline-steps.md).
