import type { PipelineContext } from "../types/context.js"
import type { PipelineConfig } from "../types/pipeline.js"
import type { StepRegistry } from "../registry/step-registry.js"

/**
 * Per-request context threaded into steps. Currently only carries the
 * calling user's id, which the executor uses to pre-bind a user-scoped
 * `callTool` closure on the step's `appConfig` so step code stays
 * synchronous and userId-free.
 */
export interface PipelineExecutionContext {
  userId?: string
}

/**
 * If the step's appConfig contains a `callTool` function (injected by
 * `buildProxyAppConfigs` from the tool-codegen package), rewrap it so the
 * step-facing call signature is `(name, args)` while the underlying
 * closure receives the current `{ userId }` via a hidden 3rd argument.
 * All other keys pass through untouched.
 */
function bindAppConfig(appConfig: unknown, ctx: PipelineExecutionContext | undefined): unknown {
  if (!appConfig || typeof appConfig !== "object") return appConfig
  const cfg = appConfig as Record<string, unknown>
  const callTool = cfg.callTool
  if (typeof callTool !== "function") return appConfig
  const raw = callTool as (
    name: string,
    args: unknown,
    ctx?: { userId?: string },
  ) => Promise<unknown>
  return {
    ...cfg,
    callTool: (name: string, args: unknown) => raw(name, args, ctx),
  }
}

export interface ExecutePipelineOptions {
  config: PipelineConfig
  initialKeys: Record<string, unknown>
  registry: StepRegistry
  appConfigs?: Record<string, unknown>
  ctx?: PipelineExecutionContext
}

export async function executePipeline(options: ExecutePipelineOptions): Promise<PipelineContext> {
  const { config, initialKeys, registry, appConfigs, ctx } = options
  const context: PipelineContext = {
    steps: {},
    keys: { ...initialKeys },
    errors: [],
  }

  for (const ref of config.steps ?? []) {
    const stepDef = registry.get(ref.step)

    if (!stepDef) {
      if (ref.optional) continue
      context.errors.push({ stepId: ref.id, reason: `Step "${ref.step}" not registered` })
      continue
    }

    const missingKeys = stepDef.requires.filter((key) => !(key in context.keys))
    if (missingKeys.length > 0) {
      if (ref.optional) continue
      context.errors.push({
        stepId: ref.id,
        reason: `Missing required keys: ${missingKeys.join(", ")}`,
      })
      continue
    }

    try {
      const colon = ref.step.indexOf(":")
      const appName = colon >= 0 ? ref.step.slice(0, colon) : ref.step
      const rawConfig = appConfigs?.[appName] ?? {}
      const appConfig = bindAppConfig(rawConfig, ctx)
      const output = await stepDef.execute(context, appConfig)
      const result = { ...output, _dataType: stepDef.dataType }
      context.steps[ref.id] = result
      Object.assign(context.keys, result.keys)
    } catch (err) {
      if (ref.optional) continue
      context.errors.push({
        stepId: ref.id,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return context
}
