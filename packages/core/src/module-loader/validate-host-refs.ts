import type { AppPlugin } from "../types/app.js"
import type { WidgetRegistry } from "../registry/widget-registry.js"
import { isHostAliasWidget, isRemoteWidget } from "../types/widget.js"

export interface HostRefValidationResult {
  accepted: AppPlugin[]
  rejected: Array<{ plugin: AppPlugin; reason: string }>
}

/**
 * Drops any synthesized module plugin whose host-alias widgets reference a
 * target that is not a registered host-bundled widget. Runs against the
 * registry AFTER first-party plugins loaded but BEFORE module plugins load,
 * so alias targets are, by construction, first-party widgets — a module can
 * never alias another module's (remote or alias) widget, regardless of
 * discovery order. Fail-soft: logs a warning per rejected module, never throws.
 */
export function filterPluginsWithValidHostRefs(
  modulePlugins: AppPlugin[],
  widgetRegistry: WidgetRegistry,
): HostRefValidationResult {
  const accepted: AppPlugin[] = []
  const rejected: HostRefValidationResult["rejected"] = []
  for (const plugin of modulePlugins) {
    const bad = plugin.definition.widgets
      .filter(isHostAliasWidget)
      .map((w) => {
        const target = widgetRegistry.get(w.hostWidget)
        if (!target) {
          return `"${w.id}" references host widget "${w.hostWidget}" which is not registered`
        }
        if (isRemoteWidget(target) || isHostAliasWidget(target)) {
          return `"${w.id}" references "${w.hostWidget}" which is not a host-bundled widget`
        }
        return undefined
      })
      .find((reason) => reason !== undefined)
    if (bad) {
      console.warn(
        `[mcp-toolkit] skipping upstream module "${plugin.definition.name}": ${bad}. ` +
          `Its tools and widgets will not be available.`,
      )
      rejected.push({ plugin, reason: bad })
    } else {
      accepted.push(plugin)
    }
  }
  return { accepted, rejected }
}
