import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import type { ModuleManifest, ProxyConfigEntry } from "@miragon/mcp-toolkit-proxy-contract"
import { discoverUpstreamModules } from "./discover.js"
import type { UpstreamProxyPlugin } from "../proxy/UpstreamProxyPlugin.js"

const validManifest: ModuleManifest = {
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
  widgets: [],
}

interface StubbedProxy {
  proxy: UpstreamProxyPlugin
  callTool: ReturnType<typeof vi.fn>
}

function stubProxy(name: string, response: unknown, throws = false): StubbedProxy {
  const callTool = vi
    .fn()
    .mockImplementation(() =>
      throws ? Promise.reject(new Error("boom")) : Promise.resolve(response),
    )
  const proxy = { name, callUpstream: callTool } as unknown as UpstreamProxyPlugin
  return { proxy, callTool }
}

const flaggedEntry = (name: string): ProxyConfigEntry => ({
  name,
  label: name,
  upstreamUrl: `https://${name}.example`,
  auth: { mode: "none" },
  upstreamModules: true,
})

describe("discoverUpstreamModules", () => {
  let warn: MockInstance<typeof console.warn>
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it("skips entries not flagged with upstreamModules", async () => {
    const { proxy, callTool } = stubProxy("items", { structuredContent: validManifest })
    const result = await discoverUpstreamModules({
      entries: [{ ...flaggedEntry("items"), upstreamModules: false }],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toEqual([])
    expect(callTool).not.toHaveBeenCalled()
  })

  it("discovers a valid manifest delivered via structuredContent", async () => {
    const { proxy } = stubProxy("items", { structuredContent: validManifest })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.manifest).toEqual(validManifest)
    expect(result[0]?.proxy).toBe(proxy)
  })

  it("discovers a manifest delivered as JSON inside a text content block", async () => {
    const { proxy } = stubProxy("items", {
      content: [{ type: "text", text: JSON.stringify(validManifest) }],
    })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.manifest.moduleId).toBe("items-ui")
  })

  it("fails soft when callUpstream throws", async () => {
    const { proxy } = stubProxy("items", undefined, true)
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it("fails soft on invalid manifest shape", async () => {
    const { proxy } = stubProxy("items", { structuredContent: { moduleId: "Items UI" } })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it("skips a manifest declaring a future schemaVersion", async () => {
    const manifest = { ...validManifest, schemaVersion: 999 }
    const { proxy } = stubProxy("items", { structuredContent: manifest })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it("discovers a manifest with no schemaVersion (defaults to 1)", async () => {
    const withoutVersion: Omit<ModuleManifest, "schemaVersion"> & { schemaVersion?: number } = {
      ...validManifest,
    }
    delete withoutVersion.schemaVersion
    const { proxy } = stubProxy("items", { structuredContent: withoutVersion })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.manifest.schemaVersion).toBe(1)
  })

  it("fails soft on React major mismatch", async () => {
    const manifest = { ...validManifest, runtime: { react: "^18.0.0" } }
    const { proxy } = stubProxy("items", { structuredContent: manifest })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it("accepts caret, tilde, and plain major React ranges", async () => {
    const variants = ["^19.0.0", "~19.2.0", "19", "19.1.2"]
    for (const react of variants) {
      const manifest = { ...validManifest, runtime: { react } }
      const { proxy } = stubProxy("items", { structuredContent: manifest })
      const result = await discoverUpstreamModules({
        entries: [flaggedEntry("items")],
        proxies: [proxy],
        hostReactMajor: 19,
      })
      expect(result, `range ${react}`).toHaveLength(1)
    }
  })

  it("fails soft when response is an error tool result", async () => {
    const { proxy } = stubProxy("items", {
      isError: true,
      content: [{ type: "text", text: "upstream is down" }],
    })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toEqual([])
  })

  it("continues discovery after one proxy fails", async () => {
    const { proxy: bad } = stubProxy("bad", undefined, true)
    const { proxy: good } = stubProxy("good", {
      structuredContent: { ...validManifest, moduleId: "good-mod", steps: [], widgets: [] },
    })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("bad"), flaggedEntry("good")],
      proxies: [bad, good],
      hostReactMajor: 19,
    })
    expect(result.map((r) => r.manifest.moduleId)).toEqual(["good-mod"])
  })
})
