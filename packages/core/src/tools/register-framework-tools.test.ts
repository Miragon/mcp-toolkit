import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { MCPServer } from "mcp-use/server"
import { afterAll, describe, expect, it } from "vitest"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppPlugin } from "../types/index.js"
import type { WidgetToolMetaDefaults } from "../types/meta.js"
import {
  buildAppResourceCsp,
  registerFrameworkTools,
  type RegisterFrameworkToolsOptions,
} from "./register-framework-tools.js"

interface CapturedRegistration {
  definition: Record<string, unknown>
  cb: (...args: unknown[]) => unknown
}

function createStubServer() {
  const tools = new Map<string, CapturedRegistration>()
  const resources = new Map<string, CapturedRegistration>()
  const server = {
    tool(definition: { name: string }, cb: (...args: unknown[]) => unknown) {
      tools.set(definition.name, { definition, cb })
    },
    resource(definition: { name: string }, cb: (...args: unknown[]) => unknown) {
      resources.set(definition.name, { definition, cb })
    },
  }
  return { server: server as unknown as MCPServer, tools, resources }
}

const RESOURCE_URI = "ui://test-app/mcp-app.hash.html"
const BASE_URL = "http://localhost:8400/mcp"
const ORIGIN = "http://localhost:8400"

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "framework-tools-"))
const htmlPath = path.join(tmpDir, "mcp-app.html")
fs.writeFileSync(htmlPath, "<div id='root'></div>")

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function baseOptions(
  overrides?: Partial<RegisterFrameworkToolsOptions>,
): RegisterFrameworkToolsOptions {
  return {
    stepRegistry: new StepRegistry(),
    widgetRegistry: new WidgetRegistry(),
    config: { activeApps: [], pipelines: {} },
    appConfigs: {},
    plugins: [],
    resourceUri: RESOURCE_URI,
    htmlPath,
    ...overrides,
  }
}

describe("buildAppResourceCsp", () => {
  it("injects the baseUrl origin into connect/resource/baseUri domains", () => {
    expect(buildAppResourceCsp(BASE_URL, undefined)).toEqual({
      connectDomains: [ORIGIN],
      resourceDomains: [ORIGIN],
      baseUriDomains: [ORIGIN],
    })
  })

  it("merges with explicit csp and deduplicates the origin", () => {
    expect(
      buildAppResourceCsp(BASE_URL, {
        connectDomains: [ORIGIN, "https://cdn.example"],
        frameDomains: ["https://frames.example"],
      }),
    ).toEqual({
      connectDomains: [ORIGIN, "https://cdn.example"],
      resourceDomains: [ORIGIN],
      baseUriDomains: [ORIGIN],
      frameDomains: ["https://frames.example"],
    })
  })

  it("returns the explicit csp untouched when baseUrl is missing or invalid", () => {
    const csp = { connectDomains: ["https://cdn.example"] }
    expect(buildAppResourceCsp(undefined, csp)).toBe(csp)
    expect(buildAppResourceCsp("not a url", csp)).toBe(csp)
    expect(buildAppResourceCsp(undefined, undefined)).toBeUndefined()
  })
})

describe("registerFrameworkTools widget contract", () => {
  it("emits the full dual-protocol _meta on render-view", () => {
    const { server, tools } = createStubServer()
    registerFrameworkTools(server, baseOptions({ baseUrl: BASE_URL }))

    const meta = tools.get("render-view")?.definition._meta as Record<string, unknown>
    expect(meta.ui).toEqual({ resourceUri: RESOURCE_URI })
    expect(meta["ui/resourceUri"]).toBe(RESOURCE_URI)
    expect(meta["openai/outputTemplate"]).toBe(RESOURCE_URI)
    expect(meta["openai/toolInvocation/invoking"]).toBe("Rendering view...")
    expect(meta["openai/toolInvocation/invoked"]).toBe("View rendered")
    expect(meta["openai/widgetAccessible"]).toBe(true)
    expect(meta["openai/resultCanProduceWidget"]).toBe(true)
    expect(meta["openai/widgetDescription"]).toEqual(expect.any(String))
    expect(meta["openai/widgetCSP"]).toEqual({
      connect_domains: [ORIGIN],
      resource_domains: [ORIGIN],
      base_uri_domains: [ORIGIN],
    })
  })

  it("keeps refresh-view app-only without the dual-protocol keys", () => {
    const { server, tools } = createStubServer()
    registerFrameworkTools(server, baseOptions({ baseUrl: BASE_URL }))

    expect(tools.get("refresh-view")?.definition._meta).toEqual({
      ui: { resourceUri: RESOURCE_URI, visibility: ["app"] },
    })
  })

  it("omits widgetCSP everywhere when neither baseUrl nor csp is configured", () => {
    const { server, tools, resources } = createStubServer()
    registerFrameworkTools(server, baseOptions())

    const meta = tools.get("render-view")?.definition._meta as Record<string, unknown>
    expect(meta["ui/resourceUri"]).toBe(RESOURCE_URI)
    expect(meta).not.toHaveProperty("openai/widgetCSP")
    expect(resources.get("mcp-app-html")?.definition).not.toHaveProperty("_meta")
  })

  it("advertises _meta.ui.csp on the resource listing", () => {
    const { server, resources } = createStubServer()
    registerFrameworkTools(server, baseOptions({ baseUrl: BASE_URL }))

    expect(resources.get("mcp-app-html")?.definition._meta).toEqual({
      ui: {
        csp: {
          connectDomains: [ORIGIN],
          resourceDomains: [ORIGIN],
          baseUriDomains: [ORIGIN],
        },
      },
    })
  })

  it("returns the html with mcp-app mimeType and _meta.ui.csp from resources/read", async () => {
    const { server, resources } = createStubServer()
    registerFrameworkTools(server, baseOptions({ baseUrl: BASE_URL }))

    const read = resources.get("mcp-app-html")
    const result = (await read?.cb()) as {
      contents: { uri: string; mimeType: string; text: string; _meta?: Record<string, unknown> }[]
    }
    const content = result.contents[0]
    expect(content?.uri).toBe(RESOURCE_URI)
    expect(content?.mimeType).toBe("text/html;profile=mcp-app")
    expect(content?.text).toBe("<div id='root'></div>")
    expect(content?._meta).toEqual({
      ui: {
        csp: {
          connectDomains: [ORIGIN],
          resourceDomains: [ORIGIN],
          baseUriDomains: [ORIGIN],
        },
      },
    })
  })

  it("threads the widgetCSP defaults into each plugin's registerWidgetTools", () => {
    const { server } = createStubServer()
    const received: (WidgetToolMetaDefaults | undefined)[] = []
    const plugin: AppPlugin<MCPServer> = {
      definition: { name: "test-plugin", steps: [], widgets: [] },
      registerWidgetTools: (_server, uri, metaDefaults) => {
        expect(uri).toBe(RESOURCE_URI)
        received.push(metaDefaults)
      },
    }
    registerFrameworkTools(
      server,
      baseOptions({ baseUrl: BASE_URL, plugins: [plugin as AppPlugin] }),
    )

    expect(received).toEqual([
      {
        widgetCSP: {
          connect_domains: [ORIGIN],
          resource_domains: [ORIGIN],
          base_uri_domains: [ORIGIN],
        },
      },
    ])
  })
})
