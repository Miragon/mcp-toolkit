import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import { buildProxyAppConfigs } from "./build-proxy-app-configs.js"
import type { AppPlugin } from "../types/app.js"
import type { UpstreamProxyPlugin } from "./UpstreamProxyPlugin.js"

interface FakeProxy {
  name: string
  callUpstream: ReturnType<typeof vi.fn>
}

const makeProxy = (name: string): FakeProxy => ({
  name,
  callUpstream: vi.fn().mockResolvedValue({ ok: true }),
})

const makePlugin = (overrides: Partial<AppPlugin> = {}): AppPlugin => ({
  definition: { name: overrides.definition?.name ?? "demo", steps: [], widgets: [] },
  ...overrides,
})

describe("buildProxyAppConfigs", () => {
  let warnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("passes through appConfig for plugins without proxyBinding", () => {
    const plugin = makePlugin({
      definition: { name: "local", steps: [], widgets: [] },
      appConfig: { label: "Local" },
    })
    const out = buildProxyAppConfigs([plugin], [])
    expect(out).toEqual({ local: { label: "Local" } })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("defaults missing appConfig to an empty object", () => {
    const plugin = makePlugin({ definition: { name: "bare", steps: [], widgets: [] } })
    expect(buildProxyAppConfigs([plugin], [])).toEqual({ bare: {} })
  })

  it("injects a callTool closure when proxyBinding matches a registered proxy", async () => {
    const proxy = makeProxy("lexoffice")
    const plugin = makePlugin({
      definition: { name: "invoices", steps: [], widgets: [] },
      proxyBinding: "lexoffice",
      appConfig: { label: "Invoices" },
    })

    const out = buildProxyAppConfigs([plugin], [proxy as unknown as UpstreamProxyPlugin])

    expect(out.invoices?.label).toBe("Invoices")
    const callTool = out.invoices?.callTool as (
      name: string,
      args: unknown,
      ctx?: { userId?: string },
    ) => Promise<unknown>
    expect(typeof callTool).toBe("function")

    await callTool("get-invoice", { id: "INV-1" }, { userId: "alice" })
    expect(proxy.callUpstream).toHaveBeenCalledWith("get-invoice", { id: "INV-1" }, "alice")
  })

  it("forwards a callTool call without a ctx as undefined userId", async () => {
    const proxy = makeProxy("lexoffice")
    const plugin = makePlugin({
      definition: { name: "invoices", steps: [], widgets: [] },
      proxyBinding: "lexoffice",
    })

    const out = buildProxyAppConfigs([plugin], [proxy as unknown as UpstreamProxyPlugin])
    const callTool = out.invoices?.callTool as (
      name: string,
      args: unknown,
      ctx?: { userId?: string },
    ) => Promise<unknown>
    await callTool("ping", {})
    expect(proxy.callUpstream).toHaveBeenCalledWith("ping", {}, undefined)
  })

  it("warns and falls through when proxyBinding references an unknown proxy", () => {
    const plugin = makePlugin({
      definition: { name: "orphan", steps: [], widgets: [] },
      proxyBinding: "missing",
      appConfig: { label: "Orphan" },
    })

    const out = buildProxyAppConfigs([plugin], [])
    expect(out.orphan).toEqual({ label: "Orphan" })
    expect(out.orphan?.callTool).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/proxyBinding "missing"/)
  })

  it("does not throw when every plugin binding is unknown — fail-soft", () => {
    const plugins = [
      makePlugin({
        definition: { name: "a", steps: [], widgets: [] },
        proxyBinding: "missing-1",
      }),
      makePlugin({
        definition: { name: "b", steps: [], widgets: [] },
        proxyBinding: "missing-2",
      }),
    ]
    expect(() => buildProxyAppConfigs(plugins, [])).not.toThrow()
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it("handles multiple plugins binding to different proxies independently", async () => {
    const lex = makeProxy("lexoffice")
    const cam = makeProxy("camunda")
    const lexPlugin = makePlugin({
      definition: { name: "invoices", steps: [], widgets: [] },
      proxyBinding: "lexoffice",
    })
    const camPlugin = makePlugin({
      definition: { name: "processes", steps: [], widgets: [] },
      proxyBinding: "camunda",
    })

    const out = buildProxyAppConfigs([lexPlugin, camPlugin], [
      lex,
      cam,
    ] as unknown as UpstreamProxyPlugin[])

    const lexCall = out.invoices?.callTool as (n: string, a: unknown) => Promise<unknown>
    const camCall = out.processes?.callTool as (n: string, a: unknown) => Promise<unknown>
    await lexCall("get", {})
    await camCall("start", {})
    expect(lex.callUpstream).toHaveBeenCalledTimes(1)
    expect(cam.callUpstream).toHaveBeenCalledTimes(1)
  })
})
