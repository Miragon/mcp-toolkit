import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import type { ModuleManifest, ProxyConfigEntry } from "@miragon/mcp-toolkit-proxy-contract"
import { discoverUpstreamModules, findRuntimeIssue, runtimeRangeSatisfied } from "./discover.js"
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

  it("skips a module requiring a runtime extra the host does not declare, and keeps siblings", async () => {
    const needy = {
      ...validManifest,
      schemaVersion: 2,
      runtime: { react: "^19.0.0", toolkitUi: "^0.9.0" },
    }
    const plain = { ...validManifest, moduleId: "plain-mod", steps: [], widgets: [] }
    const { proxy: needyProxy } = stubProxy("needy", { structuredContent: needy })
    const { proxy: plainProxy } = stubProxy("plain", { structuredContent: plain })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("needy"), flaggedEntry("plain")],
      proxies: [needyProxy, plainProxy],
      hostReactMajor: 19,
      // hostRuntime omitted entirely — nothing beyond React is exposed.
    })
    expect(result.map((r) => r.manifest.moduleId)).toEqual(["plain-mod"])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("@miragon/mcp-toolkit-ui")
    expect(warn.mock.calls[0]?.[0]).toContain("does not expose")
  })

  it("skips a module on a 0.x minor mismatch and accepts an exact 0.x minor match", async () => {
    const manifestWith = (toolkitUi: string) => ({
      ...validManifest,
      schemaVersion: 2,
      runtime: { react: "^19.0.0", toolkitUi },
    })

    const { proxy: mismatch } = stubProxy("items", {
      structuredContent: manifestWith("~0.8.0"),
    })
    const rejected = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [mismatch],
      hostReactMajor: 19,
      hostRuntime: { toolkitUi: "0.9.0" },
    })
    expect(rejected).toEqual([])
    expect(warn.mock.calls[0]?.[0]).toContain('requires @miragon/mcp-toolkit-ui "~0.8.0"')

    const { proxy: match } = stubProxy("items", {
      structuredContent: manifestWith("^0.9.0"),
    })
    const accepted = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [match],
      hostReactMajor: 19,
      hostRuntime: { toolkitUi: "0.9.0" },
    })
    expect(accepted).toHaveLength(1)
  })

  it("accepts a module declaring all three runtime extras when the host satisfies them", async () => {
    const manifest = {
      ...validManifest,
      schemaVersion: 2,
      runtime: {
        react: "^19.0.0",
        mcpUseReact: "^1.0.0",
        toolkitUi: "^0.9.0",
        reactQuery: "^5.0.0",
      },
    }
    const { proxy } = stubProxy("items", { structuredContent: manifest })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
      hostRuntime: { mcpUseReact: "1.34.3", toolkitUi: "0.9.0", reactQuery: "5.62.1" },
    })
    expect(result).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it("skips a future-version manifest via the schemaVersion probe, not the parse error", async () => {
    // A hypothetical v3 manifest with a new *required* field and without
    // fields v2 requires — the full parse would fail, but the pre-parse
    // version probe must catch it first and report the accurate reason.
    const { proxy } = stubProxy("items", {
      structuredContent: { schemaVersion: 3, someRequiredNewField: { shape: "unknown" } },
    })
    const result = await discoverUpstreamModules({
      entries: [flaggedEntry("items")],
      proxies: [proxy],
      hostReactMajor: 19,
    })
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("declares schemaVersion 3")
    expect(warn.mock.calls[0]?.[0]).not.toContain("invalid module manifest")
  })
})

describe("runtimeRangeSatisfied", () => {
  it.each<[string, string, boolean]>([
    ["19", "19", true],
    ["^19.0.0", "19", true],
    ["~19.1.2", "19", true],
    ["18", "19", false],
    ["^0.9.0", "0.9.0", true],
    ["^0.8.0", "0.9.0", false],
    // 0.x requires an explicit minor: the minor is the breaking axis, so a
    // bare "0" cannot be verified and is rejected rather than guessed.
    ["0", "0.9.0", false],
    [">=19 <20", "19", false],
    ["garbage", "19", false],
  ])("(%s, %s) -> %s", (range, hostVersion, expected) => {
    expect(runtimeRangeSatisfied(range, hostVersion)).toBe(expected)
  })
})

describe("findRuntimeIssue", () => {
  it("returns undefined when every declared runtime is satisfiable", () => {
    const issue = findRuntimeIssue(
      { react: "^19.0.0", toolkitUi: "^0.9.0", reactQuery: "^5.0.0" },
      19,
      { toolkitUi: "0.9.0", reactQuery: "5.62.1" },
    )
    expect(issue).toBeUndefined()
  })

  it("names React and the range on a React mismatch", () => {
    const issue = findRuntimeIssue({ react: "^18.0.0" }, 19)
    expect(issue).toContain('React "^18.0.0"')
    expect(issue).toContain("host ships React 19")
  })

  it("names the library and range when the host does not expose a required extra", () => {
    const issue = findRuntimeIssue({ react: "^19.0.0", mcpUseReact: "^1.0.0" }, 19, {})
    expect(issue).toContain('mcp-use/react "^1.0.0"')
    expect(issue).toContain("does not expose mcp-use/react")
  })

  it("names the library, range, and host version on an extra version mismatch", () => {
    const issue = findRuntimeIssue({ react: "^19.0.0", reactQuery: "^4.0.0" }, 19, {
      reactQuery: "5.62.1",
    })
    expect(issue).toContain('@tanstack/react-query "^4.0.0"')
    expect(issue).toContain("host exposes @tanstack/react-query 5.62.1")
  })
})
