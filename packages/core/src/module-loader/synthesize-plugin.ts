import type { AppPlugin } from "../types/app.js"
import { buildStepFromDeclaration } from "../pipeline/declarative-step.js"
import type { DiscoveredModule } from "./discover.js"

/**
 * Turns a discovered module manifest into an `AppPlugin` the toolkit's
 * existing `loadApps` + `buildProxyAppConfigs` pipeline can ingest as-is.
 *
 * The synthesised plugin:
 * - Sets `definition.name` to the manifest's `moduleId`, so pipeline
 *   executor's `ref.step.split(":")[0]` app-config lookup lands on this
 *   module's `callTool` closure.
 * - Sets `proxyBinding` to the originating proxy's name, so
 *   `buildProxyAppConfigs` injects a `callTool` pre-bound to that
 *   upstream. Cross-module tool routing is structurally impossible.
 * - Compiles each declarative step via `buildStepFromDeclaration`.
 *
 * Widgets from the manifest are attached at the plugin level (to preserve
 * them for Phase 3's remote-widget loader) but are not yet translated
 * into `WidgetDefinition`s here — that wiring lands with the remote
 * loader so we don't register incomplete widgets into the registry in the
 * meantime.
 */
export function synthesizeModulePlugin(discovered: DiscoveredModule): AppPlugin {
  const { manifest, proxy } = discovered
  return {
    definition: {
      name: manifest.moduleId,
      steps: manifest.steps.map((step) => buildStepFromDeclaration(step, manifest.moduleId)),
      widgets: [],
    },
    proxyBinding: proxy.name,
  }
}
