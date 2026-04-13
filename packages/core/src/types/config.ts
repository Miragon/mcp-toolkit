import type { PipelineConfig } from "./pipeline.js"

export interface AppConfigEntry {
  app: string
  config: Record<string, unknown>
}

export interface AppConfig {
  activeApps: AppConfigEntry[]
  pipelines: Record<string, PipelineConfig>
}

export interface ValidationResult {
  valid: boolean
  issues: string[]
  availableKeys: string[]
}
