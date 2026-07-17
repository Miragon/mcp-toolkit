import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import { filterPluginsWithValidHostRefs } from "./validate-host-refs.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppPlugin } from "../types/app.js"
import type { WidgetDefinition } from "../types/widget.js"

function pluginWith(name: string, widgets: WidgetDefinition[]): AppPlugin {
  return {
    definition: { name, steps: [], widgets },
    proxyBinding: name,
  }
}

const aliasWidget = (id: string, hostWidget: string): WidgetDefinition => ({
  id,
  requires: [],
  size: "full",
  moduleId: id.split(":")[0] ?? id,
  hostWidget,
})

const bundleWidget = (id: string): WidgetDefinition => ({
  id,
  requires: [],
  size: "full",
  bundle: `ui://${id.replace(":", "/")}.js`,
  moduleId: id.split(":")[0] ?? id,
})

function hostRegistry(): WidgetRegistry {
  const registry = new WidgetRegistry()
  // A first-party (local) widget — the only valid alias target.
  registry.register({ id: "shell:kpi-grid", requires: [], size: "quarter" })
  return registry
}

describe("filterPluginsWithValidHostRefs", () => {
  let warn: MockInstance<typeof console.warn>
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it("accepts a module whose alias targets a registered local widget", () => {
    const plugin = pluginWith("items-ui", [aliasWidget("items-ui:kpi", "shell:kpi-grid")])
    const result = filterPluginsWithValidHostRefs([plugin], hostRegistry())
    expect(result.accepted).toEqual([plugin])
    expect(result.rejected).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it("rejects a module whose alias target is not registered, without throwing, and keeps siblings", () => {
    const dangling = pluginWith("items-ui", [aliasWidget("items-ui:kpi", "shell:nope")])
    const sibling = pluginWith("orders-ui", [bundleWidget("orders-ui:card")])
    let result: ReturnType<typeof filterPluginsWithValidHostRefs> | undefined
    // Fail-soft boundary: the documented contract is "logs a warning, never
    // throws" — pin the no-throw part explicitly.
    expect(() => {
      result = filterPluginsWithValidHostRefs([dangling, sibling], hostRegistry())
    }).not.toThrow()
    expect(result?.accepted).toEqual([sibling])
    expect(result?.rejected).toHaveLength(1)
    expect(result?.rejected[0]?.plugin).toBe(dangling)
    expect(result?.rejected[0]?.reason).toContain('"shell:nope"')
    expect(result?.rejected[0]?.reason).toContain("not registered")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('skipping upstream module "items-ui"')
  })

  it("rejects a module whose alias targets a remote (upstream-hosted) widget", () => {
    const registry = hostRegistry()
    registry.register(bundleWidget("other:remote-card"))
    const plugin = pluginWith("items-ui", [aliasWidget("items-ui:kpi", "other:remote-card")])
    const result = filterPluginsWithValidHostRefs([plugin], registry)
    expect(result.accepted).toEqual([])
    expect(result.rejected[0]?.reason).toContain("not a host-bundled widget")
  })

  it("rejects a module whose alias targets another alias", () => {
    const registry = hostRegistry()
    registry.register(aliasWidget("other:alias", "shell:kpi-grid"))
    const plugin = pluginWith("items-ui", [aliasWidget("items-ui:kpi", "other:alias")])
    const result = filterPluginsWithValidHostRefs([plugin], registry)
    expect(result.accepted).toEqual([])
    expect(result.rejected[0]?.reason).toContain("not a host-bundled widget")
  })

  it("passes through modules with only bundle widgets untouched", () => {
    const plugin = pluginWith("orders-ui", [bundleWidget("orders-ui:card")])
    const result = filterPluginsWithValidHostRefs([plugin], hostRegistry())
    expect(result.accepted).toEqual([plugin])
    expect(result.rejected).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })
})
