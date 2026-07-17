import type { AppDefinition } from "../types/app.js"
import type { StepRegistry } from "./step-registry.js"
import type { WidgetRegistry } from "./widget-registry.js"

export interface LoadAppsOptions {
  /**
   * When `true`, an app whose step/widget ids collide with an already-loaded
   * app is skipped (with a `console.warn`) instead of throwing — and any ids it
   * did register before the collision are rolled back, so the registries never
   * hold a half-loaded module. Use this for *untrusted* module sources, where
   * one bad third-party definition must not brick the whole host boot. Defaults
   * to `false` (throw), which is correct for first-party plugins whose ids the
   * app author controls — there a collision is a real bug that should fail loud.
   */
  isolateFailures?: boolean
}

export interface LoadAppsResult {
  /** Apps whose steps and widgets were fully registered. */
  loaded: AppDefinition[]
  /** Apps skipped due to a collision (only possible with `isolateFailures`). */
  skipped: Array<{ app: AppDefinition; reason: string }>
}

/**
 * Registers each app's steps and widgets into the shared registries.
 *
 * By default a collision throws (the registry's own error), which is the right
 * behaviour for first-party plugins. Pass `isolateFailures: true` for
 * untrusted module sources so a single colliding third-party module is
 * skipped — with its partial registrations rolled back — rather than aborting
 * the entire boot.
 */
export function loadApps(
  apps: AppDefinition[],
  stepRegistry: StepRegistry,
  widgetRegistry: WidgetRegistry,
  options: LoadAppsOptions = {},
): LoadAppsResult {
  const { isolateFailures = false } = options
  const loaded: AppDefinition[] = []
  const skipped: Array<{ app: AppDefinition; reason: string }> = []

  for (const app of apps) {
    if (!isolateFailures) {
      // First-party path: register directly and let a collision throw, exactly
      // as before.
      for (const step of app.steps) stepRegistry.register(step)
      for (const widget of app.widgets) widgetRegistry.register(widget)
      loaded.push(app)
      continue
    }

    // Isolated path: track what this app registers so we can roll back cleanly
    // if any of its ids collide with an already-loaded app. `register` throws
    // only on ids that already exist — i.e. never on the ones we just added —
    // so rollback only removes this app's own registrations.
    const registeredSteps: string[] = []
    const registeredWidgets: string[] = []
    try {
      for (const step of app.steps) {
        stepRegistry.register(step)
        registeredSteps.push(step.id)
      }
      for (const widget of app.widgets) {
        widgetRegistry.register(widget)
        registeredWidgets.push(widget.id)
      }
      loaded.push(app)
    } catch (err) {
      for (const id of registeredSteps) stepRegistry.unregister(id)
      for (const id of registeredWidgets) widgetRegistry.unregister(id)
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(
        `[app-loader] Skipping module "${app.name}": ${reason}. ` +
          `Its tools and widgets will not be available.`,
      )
      skipped.push({ app, reason })
    }
  }

  return { loaded, skipped }
}
