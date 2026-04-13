import type { PipelineContext, StepOutput } from "./context.js"

export interface PipelineStepDefinition<TConfig = unknown> {
  id: string

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
   * Keys this step produces into the context.
   * Prefix with the app name to avoid collisions, e.g. ["lexoffice:invoice", "lexoffice:lines"].
   */
  produces: string[]

  execute: (context: PipelineContext, appConfig: TConfig) => Promise<StepOutput>
}
