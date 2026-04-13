export interface StepOutput {
  data: unknown
  keys: Record<string, unknown>
  _app: string
  _step: string
}

export interface StepResult extends StepOutput {
  _dataType: string
}

export interface PipelineContext {
  steps: Record<string, StepResult>
  keys: Record<string, unknown>
  errors: {
    stepId: string
    reason: string
  }[]
}
