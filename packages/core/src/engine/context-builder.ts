import type { PipelineConfig } from "../types/pipeline.js"
import type { ValidationResult } from "../types/config.js"
import type { StepRegistry } from "../registry/step-registry.js"

export function validatePipeline(
  config: PipelineConfig,
  registry: StepRegistry,
  initialKeys?: string[],
): ValidationResult {
  const availableKeys = new Set<string>(initialKeys ?? [])
  const issues: string[] = []

  for (const ref of config.steps ?? []) {
    const stepDef = registry.get(ref.step)

    if (!stepDef) {
      if (!ref.optional) issues.push(`Step "${ref.step}" not registered`)
      continue
    }

    for (const key of stepDef.requires) {
      if (!availableKeys.has(key)) {
        issues.push(
          `Step "${ref.id}" requires key "${key}" but no earlier step produces it`,
        )
      }
    }

    for (const key of stepDef.produces) {
      availableKeys.add(key)
    }
  }

  return { valid: issues.length === 0, issues, availableKeys: [...availableKeys] }
}
