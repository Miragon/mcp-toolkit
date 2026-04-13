import type { PipelineContext } from "../types/context.js"
import type { PipelineConfig } from "../types/pipeline.js"
import type { StepRegistry } from "../registry/step-registry.js"

export async function executePipeline(
  config: PipelineConfig,
  initialKeys: Record<string, unknown>,
  registry: StepRegistry,
  appConfigs?: Record<string, unknown>,
): Promise<PipelineContext> {
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
      const appName = ref.step.split(":")[0]
      const appConfig = appConfigs?.[appName] ?? {}
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
