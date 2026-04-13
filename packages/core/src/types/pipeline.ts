export interface PipelineConfig {
  steps?: PipelineStepRef[]
}

export interface PipelineStepRef {
  id: string
  step: string
  optional?: boolean
}
