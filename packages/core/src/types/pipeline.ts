export interface PipelineConfig {
  steps?: PipelineStepRef[]
}

export interface PipelineStepRef {
  id: string
  /** Must follow "appName:stepName" format. */
  step: string
  optional?: boolean
}
