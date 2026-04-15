import type { StepRegistry } from "../registry/step-registry.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppConfig } from "../types/config.js"

export interface FrameworkManifest {
  activeApps: string[]
  steps: {
    id: string
    app: string
    dataType: string
    requires: string[]
    produces: string[]
  }[]
  widgets: {
    id: string
    app: string
    requires: string[]
    size: string
  }[]
  pipelines: {
    id: string
    steps: { id: string; step: string; optional?: boolean }[]
  }[]
  keyContracts: {
    key: string
    producedBy: string[]
    consumedBy: string[]
  }[]
}

/**
 * Produces a JSON-serializable manifest of everything the framework currently
 * knows about: active apps, registered pipeline steps, available widgets, and
 * the key contracts derived from step `requires`/`produces`. Consumers expose
 * this via a `get-framework-manifest` tool so the LLM can learn what is
 * composable via `render-view`.
 */
export function getFrameworkManifest(
  stepRegistry: StepRegistry,
  widgetRegistry: WidgetRegistry,
  config: AppConfig,
): FrameworkManifest {
  return {
    activeApps: config.activeApps.map((a) => a.app),

    steps: stepRegistry.getAll().map((step) => ({
      id: step.id,
      app: step.id.split(":")[0] ?? step.id,
      dataType: step.dataType,
      requires: step.requires,
      produces: step.produces,
    })),

    widgets: widgetRegistry.getAll().map((widget) => ({
      id: widget.id,
      app: widget.id.split(":")[0] ?? widget.id,
      requires: widget.requires,
      size: widget.size,
    })),

    pipelines: Object.entries(config.pipelines).map(([id, pipeline]) => ({
      id,
      steps: pipeline.steps ?? [],
    })),

    keyContracts: stepRegistry.getKeyContracts(),
  }
}
