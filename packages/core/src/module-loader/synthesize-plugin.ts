import { isHostWidgetRef } from "@miragon/mcp-toolkit-proxy-contract"
import type { AppPlugin } from "../types/app.js"
import type { WidgetDefinition } from "../types/widget.js"
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
 * - Compiles each remote widget into a `WidgetDefinition` carrying the
 *   bundle URI + originating `moduleId`. `render-view` relays the bundle
 *   metadata to the browser-side loader.
 * - Compiles each host-widget reference into a `HostAliasWidgetDefinition`:
 *   no bundle, no resource read — `render-view` advertises the alias via
 *   `aliasWidgets` and the browser shell renders the host component named
 *   by `hostWidget` with the manifest's `props` as `presetProps` (merged
 *   under each layout cell's own props).
 *
 * Widget size defaults to `"full"` when the manifest omits it — matches
 * the pre-size-field contract.
 */
export function synthesizeModulePlugin(discovered: DiscoveredModule): AppPlugin {
  const { manifest, proxy } = discovered
  const widgets: WidgetDefinition[] = manifest.widgets.map((w) => {
    const base = {
      id: w.id,
      requires: [...w.requires],
      size: w.size ?? "full",
      ...(w.propsSchema ? { propsSchema: w.propsSchema } : {}),
      moduleId: manifest.moduleId,
    }
    if (isHostWidgetRef(w)) {
      return { ...base, hostWidget: w.hostWidget, ...(w.props ? { presetProps: w.props } : {}) }
    }
    return { ...base, bundle: w.bundle }
  })
  return {
    definition: {
      name: manifest.moduleId,
      steps: manifest.steps.map((step) => buildStepFromDeclaration(step, manifest.moduleId)),
      widgets,
    },
    proxyBinding: proxy.name,
  }
}
