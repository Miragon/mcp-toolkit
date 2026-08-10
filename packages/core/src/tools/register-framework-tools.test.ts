import type { MCPServer } from "mcp-use"
import { describe, expect, it } from "vitest"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppPlugin } from "../types/index.js"
import type { WidgetToolMetaDefaults } from "../types/meta.js"
import {
  registerFrameworkTools,
  type RegisterFrameworkToolsOptions,
} from "./register-framework-tools.js"

interface CapturedRegistration {
  definition: Record<string, unknown>
  cb: (...args: unknown[]) => unknown
}

function createStubServer() {
  const tools = new Map<string, CapturedRegistration>()
  const server = {
    tool(definition: { name: string }, cb: (...args: unknown[]) => unknown) {
      tools.set(definition.name, { definition, cb })
    },
  }
  return { server: server as unknown as MCPServer, tools }
}

const CSP = { connectDomains: ["https://api.example"] }

function baseOptions(
  overrides?: Partial<RegisterFrameworkToolsOptions>,
): RegisterFrameworkToolsOptions {
  return {
    stepRegistry: new StepRegistry(),
    widgetRegistry: new WidgetRegistry(),
    config: { activeApps: [], pipelines: {} },
    appConfigs: {},
    plugins: [],
    ...overrides,
  }
}

describe("registerFrameworkTools widget contract", () => {
  it("binds render-view to its own view with the configured CSP", () => {
    const { server, tools } = createStubServer()
    registerFrameworkTools(server, baseOptions({ csp: CSP }))

    const def = tools.get("render-view")?.definition
    expect(def?.view).toEqual({
      name: "render-view",
      description: "Interactive view composed of pipeline-driven widgets",
      csp: CSP,
    })
    // The view binding requires an outputSchema; the envelope is dynamic, so
    // a passthrough object stands in.
    expect(def?.outputSchema).toBeDefined()
  })

  it("stamps the Apps SDK keys on render-view pointing at its view resource", () => {
    const { server, tools } = createStubServer()
    registerFrameworkTools(server, baseOptions({ csp: CSP }))

    const meta = tools.get("render-view")?.definition._meta as Record<string, unknown>
    expect(meta["openai/outputTemplate"]).toBe("ui://views/render-view.html")
    expect(meta["openai/toolInvocation/invoking"]).toBe("Rendering view...")
    expect(meta["openai/toolInvocation/invoked"]).toBe("View rendered")
    expect(meta["openai/widgetAccessible"]).toBe(true)
    expect(meta["openai/resultCanProduceWidget"]).toBe(true)
    expect(meta["openai/widgetDescription"]).toEqual(expect.any(String))
    expect(meta["openai/widgetCSP"]).toEqual({ connect_domains: ["https://api.example"] })
  })

  it("keeps refresh-view app-only with neither view binding nor Apps SDK keys", () => {
    const { server, tools } = createStubServer()
    registerFrameworkTools(server, baseOptions({ csp: CSP }))

    const def = tools.get("refresh-view")?.definition
    expect(def?.visibility).toBe("app")
    expect(def?.view).toBeUndefined()
    expect(def?._meta).toBeUndefined()
  })

  it("omits the CSP everywhere when none is configured", () => {
    const { server, tools } = createStubServer()
    registerFrameworkTools(server, baseOptions())

    const def = tools.get("render-view")?.definition
    expect(def?.view).toEqual({
      name: "render-view",
      description: "Interactive view composed of pipeline-driven widgets",
    })
    expect(def?._meta).not.toHaveProperty("openai/widgetCSP")
  })

  it("threads both CSP shapes into each plugin's registerWidgetTools", () => {
    const { server } = createStubServer()
    const received: (WidgetToolMetaDefaults | undefined)[] = []
    const plugin: AppPlugin<MCPServer> = {
      definition: { name: "test-plugin", steps: [], widgets: [] },
      registerWidgetTools: (_server, metaDefaults) => {
        received.push(metaDefaults)
      },
    }
    registerFrameworkTools(server, baseOptions({ csp: CSP, plugins: [plugin as AppPlugin] }))

    expect(received).toEqual([
      {
        widgetCSP: { connect_domains: ["https://api.example"] },
        viewCsp: CSP,
      },
    ])
  })
})
