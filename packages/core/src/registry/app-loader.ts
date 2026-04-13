import type { AppDefinition } from "../types/app.js"
import type { StepRegistry } from "./step-registry.js"
import type { WidgetRegistry } from "./widget-registry.js"

export function loadApps(
  apps: AppDefinition[],
  stepRegistry: StepRegistry,
  widgetRegistry: WidgetRegistry,
): void {
  for (const app of apps) {
    for (const step of app.steps) {
      stepRegistry.register(step)
    }
    for (const widget of app.widgets) {
      widgetRegistry.register(widget)
    }
  }
}
