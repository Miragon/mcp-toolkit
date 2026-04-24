import { describe, it, expect } from "vitest"
import type { ModuleManifest } from "@miragon/mcp-toolkit-proxy-contract"
import { synthesizeModulePlugin } from "./synthesize-plugin.js"
import type { UpstreamProxyPlugin } from "../proxy/UpstreamProxyPlugin.js"

const manifest: ModuleManifest = {
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
    expect(plugin.definition.steps[0].id).toBe("items-ui:resolve-item")
    expect(plugin.definition.steps[0].requires).toEqual(["items-ui:itemId"])
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
})
