import { describe, it, expect } from "vitest"
import type { ModuleManifest } from "@miragon/mcp-toolkit-proxy-contract"
import { synthesizeModulePlugin } from "./synthesize-plugin.js"
import { isHostAliasWidget, isRemoteWidget } from "../types/widget.js"
import type { UpstreamProxyPlugin } from "../proxy/UpstreamProxyPlugin.js"

const manifest: ModuleManifest = {
  schemaVersion: 1,
  moduleId: "items-ui",
  runtime: { react: "^19.0.0" },
  steps: [
    {
      id: "items-ui:resolve-item",
      dataType: "items-ui:item",
      requires: ["items-ui:itemId"],
      produces: ["items-ui:item"],
      tool: "get-item",
      inputMapping: { id: "keys.items-ui:itemId" },
      outputMapping: { "items-ui:item": "result" },
    },
  ],
  widgets: [
    {
      id: "items-ui:item-card",
      requires: ["items-ui:item"],
      bundle: "ui://items-ui/widgets/item-card.js",
    },
    {
      id: "items-ui:item-summary",
      requires: ["items-ui:item"],
      bundle: "ui://items-ui/widgets/item-summary.js",
      size: "half",
    },
  ],
}

const proxy = { name: "items" } as unknown as UpstreamProxyPlugin

describe("synthesizeModulePlugin", () => {
  it("sets definition name + proxyBinding to route back to the originating upstream", () => {
    const plugin = synthesizeModulePlugin({ manifest, proxy })
    expect(plugin.definition.name).toBe("items-ui")
    expect(plugin.proxyBinding).toBe("items")
  })

  it("compiles each declarative step into a PipelineStepDefinition", () => {
    const plugin = synthesizeModulePlugin({ manifest, proxy })
    expect(plugin.definition.steps).toHaveLength(1)
    expect(plugin.definition.steps[0]?.id).toBe("items-ui:resolve-item")
    expect(plugin.definition.steps[0]?.requires).toEqual(["items-ui:itemId"])
  })

  it("projects remote widgets with bundle + moduleId, defaulting size to 'full'", () => {
    const plugin = synthesizeModulePlugin({ manifest, proxy })
    expect(plugin.definition.widgets).toEqual([
      {
        id: "items-ui:item-card",
        requires: ["items-ui:item"],
        size: "full",
        bundle: "ui://items-ui/widgets/item-card.js",
        moduleId: "items-ui",
      },
      {
        id: "items-ui:item-summary",
        requires: ["items-ui:item"],
        size: "half",
        bundle: "ui://items-ui/widgets/item-summary.js",
        moduleId: "items-ui",
      },
    ])
  })

  it("compiles a hostWidget reference into a HostAliasWidgetDefinition", () => {
    const plugin = synthesizeModulePlugin({
      manifest: {
        ...manifest,
        schemaVersion: 2,
        widgets: [
          {
            id: "items-ui:orders-kpi",
            requires: [],
            hostWidget: "shell:kpi-grid",
            props: { title: "Items", limit: 5 },
            size: "quarter",
          },
        ],
      },
      proxy,
    })
    const widget = plugin.definition.widgets[0]
    expect(widget).toEqual({
      id: "items-ui:orders-kpi",
      requires: [],
      size: "quarter",
      moduleId: "items-ui",
      hostWidget: "shell:kpi-grid",
      presetProps: { title: "Items", limit: 5 },
    })
    // No bundle key: the browser loader must never try to fetch an alias.
    expect(widget).not.toHaveProperty("bundle")
    if (!widget) throw new Error("test fixture invariant: plugin must carry a widget")
    expect(isRemoteWidget(widget)).toBe(false)
    expect(isHostAliasWidget(widget)).toBe(true)
  })

  it("defaults alias size to 'full' and omits presetProps when the manifest has no props", () => {
    const plugin = synthesizeModulePlugin({
      manifest: {
        ...manifest,
        schemaVersion: 2,
        widgets: [{ id: "items-ui:orders-kpi", requires: [], hostWidget: "shell:kpi-grid" }],
      },
      proxy,
    })
    expect(plugin.definition.widgets[0]).toEqual({
      id: "items-ui:orders-kpi",
      requires: [],
      size: "full",
      moduleId: "items-ui",
      hostWidget: "shell:kpi-grid",
    })
    expect(plugin.definition.widgets[0]).not.toHaveProperty("presetProps")
  })

  it("projects a mixed manifest: bundle widgets stay remote, refs become aliases", () => {
    const firstWidget = manifest.widgets[0]
    if (!firstWidget) throw new Error("test fixture invariant: manifest must declare a widget")
    const plugin = synthesizeModulePlugin({
      manifest: {
        ...manifest,
        schemaVersion: 2,
        widgets: [
          firstWidget,
          { id: "items-ui:orders-kpi", requires: [], hostWidget: "shell:kpi-grid" },
        ],
      },
      proxy,
    })
    expect(plugin.definition.widgets.map((w) => isHostAliasWidget(w))).toEqual([false, true])
    expect(plugin.definition.widgets[0]).toMatchObject({
      bundle: "ui://items-ui/widgets/item-card.js",
      moduleId: "items-ui",
    })
  })

  it("preserves propsSchema on remote widgets that advertise one", () => {
    const propsSchema = {
      type: "object",
      properties: { itemId: { type: "string" } },
    }
    const firstWidget = manifest.widgets[0]
    if (!firstWidget) throw new Error("test fixture invariant: manifest must declare a widget")
    const plugin = synthesizeModulePlugin({
      manifest: {
        ...manifest,
        widgets: [{ ...firstWidget, propsSchema }],
      },
      proxy,
    })
    expect(plugin.definition.widgets[0]?.propsSchema).toEqual(propsSchema)
  })
})
