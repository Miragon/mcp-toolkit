import type { PipelineStepDefinition } from "../types/step.js"

export interface KeyContract {
  key: string
  producedBy: string[]
  /** Steps that hard-require this key (gate execution on it). */
  consumedBy: string[]
  /**
   * Steps that read this key from `context.keys` opportunistically — e.g. for
   * scoping or filtering — but still run without it. Mirrors
   * `PipelineStepDefinition.optionalKeys`.
   */
  optionallyConsumedBy: string[]
}

export class StepRegistry {
  private steps = new Map<string, PipelineStepDefinition>()

  register(step: PipelineStepDefinition): void {
    if (this.steps.has(step.id)) {
      throw new Error(`Step ID collision: "${step.id}" is already registered`)
    }
    this.steps.set(step.id, step)
  }

  get(stepId: string): PipelineStepDefinition | undefined {
    return this.steps.get(stepId)
  }

  /**
   * Remove a previously-registered step. Used to roll back a partially loaded
   * module when isolating an upstream collision (see `loadApps`); a no-op for
   * unknown ids.
   */
  unregister(stepId: string): void {
    this.steps.delete(stepId)
  }

  getAll(): PipelineStepDefinition[] {
    return [...this.steps.values()]
  }

  getKeyContracts(): KeyContract[] {
    const producers = new Map<string, string[]>()
    const consumers = new Map<string, string[]>()
    const optionalConsumers = new Map<string, string[]>()

    for (const step of this.steps.values()) {
      for (const key of step.produces) {
        if (!producers.has(key)) producers.set(key, [])
        producers.get(key)!.push(step.id)
      }
      for (const key of step.requires) {
        if (!consumers.has(key)) consumers.set(key, [])
        consumers.get(key)!.push(step.id)
      }
      for (const decl of step.optionalKeys ?? []) {
        if (!optionalConsumers.has(decl.key)) optionalConsumers.set(decl.key, [])
        optionalConsumers.get(decl.key)!.push(step.id)
      }
    }

    const allKeys = new Set([...producers.keys(), ...consumers.keys(), ...optionalConsumers.keys()])
    return [...allKeys].map((key) => ({
      key,
      producedBy: producers.get(key) ?? [],
      consumedBy: consumers.get(key) ?? [],
      optionallyConsumedBy: optionalConsumers.get(key) ?? [],
    }))
  }
}
