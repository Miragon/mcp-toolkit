import type { PipelineContext, StepOutput } from "./context.js"

/**
 * Soft input declaration — a key the step reads from `context.keys` if present
 * but does not strictly need to run. Surfaced in `getFrameworkManifest` so an
 * LLM constructing `render-view` knows the step accepts these scoping keys
 * even though they don't appear in `requires`.
 */
export interface OptionalKeyDeclaration {
  /** Namespaced key (e.g. `analytics:processDefinitionKey`). */
  key: string
  /** One-line description of what the key controls. */
  description?: string
  /**
   * Allowed values when the input is constrained to an enum. Useful for the LLM
   * to construct valid `keys` without guessing (e.g. period: 1d|7d|30d|90d).
   */
  enum?: readonly (string | number)[]
}

export interface PipelineStepDefinition<TConfig = unknown> {
  id: string

  /**
   * One-line human description of what the step does. Surfaced in
   * `getFrameworkManifest` so an LLM picks the right step for a widget without
   * having to guess from the id.
   */
  description?: string

  /**
   * The data type this step produces.
   * e.g. "lexoffice:invoice", "camunda7:processInstance", "analytics:kpis"
   * Widgets that accept the same dataType can render this data.
   */
  dataType: string

  /**
   * Keys that must already exist in the pipeline context before this step can run.
   * e.g. ["lexoffice:invoiceNumber"] or ["camunda7:processInstanceId"]
   */
  requires: string[]

  /**
   * Keys the step reads from `context.keys` if present but tolerates absence
   * of. The step still runs without them (typically with a default or aggregated
   * scope). Distinct from `requires`, which gates execution.
   */
  optionalKeys?: OptionalKeyDeclaration[]

  /**
   * Keys this step produces into the context.
   * Prefix with the app name to avoid collisions, e.g. ["lexoffice:invoice", "lexoffice:lines"].
   */
  produces: string[]

  execute: (context: PipelineContext, appConfig: TConfig) => Promise<StepOutput>
}
