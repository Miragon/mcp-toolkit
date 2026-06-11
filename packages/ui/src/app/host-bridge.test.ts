import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createChatGptHostBridge,
  createStandaloneHostBridge,
  type OpenAiAppsSdk,
} from "./host-bridge.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createChatGptHostBridge — no window.openai (defensive guards)", () => {
  // Passing `null` exercises the fully-absent SDK path without touching window.
  it("rejects callTool with a clear error instead of throwing synchronously", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bridge = createChatGptHostBridge(null)

    await expect(bridge.callTool("do_thing", {})).rejects.toThrow(
      /OpenAI Apps SDK callTool is unavailable.*do_thing/,
    )
    expect(warn).toHaveBeenCalled()
  })

  it("sendFollowup is a logged no-op (no throw) when the SDK is absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bridge = createChatGptHostBridge(null)

    expect(() => bridge.sendFollowup("hello")).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("sendFollowUpMessage unavailable"))
  })

  it("setModelContext is a logged no-op (no throw) when the SDK is absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bridge = createChatGptHostBridge(null)

    expect(() => bridge.setModelContext?.("ctx")).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("setWidgetState unavailable"))
  })

  it("getWidgetData returns null when the SDK is absent", () => {
    const bridge = createChatGptHostBridge(null)
    expect(bridge.getWidgetData()).toBeNull()
  })

  it("leaves theme undefined when the SDK reports none", () => {
    const bridge = createChatGptHostBridge(null)
    expect(bridge.theme).toBeUndefined()
  })
})

describe("createChatGptHostBridge — with a stubbed SDK", () => {
  it("routes callTool through window.openai.callTool", async () => {
    const sdk: OpenAiAppsSdk = {
      callTool: vi.fn().mockResolvedValue({ structuredContent: { ok: true } }),
    }
    const bridge = createChatGptHostBridge(sdk)

    const res = await bridge.callTool("get_thing", { id: 1 })

    expect(sdk.callTool).toHaveBeenCalledWith("get_thing", { id: 1 })
    expect(res).toEqual({ structuredContent: { ok: true } })
  })

  it("calls sendFollowUpMessage with the { prompt } shape", () => {
    const sendFollowUpMessage = vi.fn().mockReturnValue(undefined)
    const bridge = createChatGptHostBridge({ sendFollowUpMessage })

    bridge.sendFollowup("show details")

    expect(sendFollowUpMessage).toHaveBeenCalledWith({ prompt: "show details" })
  })

  it("falls back to the bare-string signature when { prompt } throws", () => {
    const calls: unknown[] = []
    const sendFollowUpMessage = vi.fn((arg: { prompt: string } | string) => {
      calls.push(arg)
      // Reject the object form to force the string fallback.
      if (typeof arg !== "string") throw new Error("object form unsupported")
    })
    const bridge = createChatGptHostBridge({ sendFollowUpMessage })

    bridge.sendFollowup("hi")

    expect(calls).toEqual([{ prompt: "hi" }, "hi"])
  })

  it("accepts the alternate sendFollowupMessage spelling", () => {
    const sendFollowupMessage = vi.fn()
    const bridge = createChatGptHostBridge({ sendFollowupMessage })

    bridge.sendFollowup("hi")

    expect(sendFollowupMessage).toHaveBeenCalledWith({ prompt: "hi" })
  })

  it("opens external links via openExternal with the { href } shape", () => {
    const openExternal = vi.fn()
    const bridge = createChatGptHostBridge({ openExternal })

    bridge.openExternal("https://example.com")

    expect(openExternal).toHaveBeenCalledWith({ href: "https://example.com" })
  })

  it("prefers toolOutput over toolResponseMetadata for widget data", () => {
    const bridge = createChatGptHostBridge({
      toolOutput: { a: 1 },
      toolResponseMetadata: { b: 2 },
    })
    expect(bridge.getWidgetData()).toEqual({ a: 1 })
  })

  it("falls back to toolResponseMetadata when toolOutput is absent", () => {
    const bridge = createChatGptHostBridge({ toolResponseMetadata: { b: 2 } })
    expect(bridge.getWidgetData()).toEqual({ b: 2 })
  })

  it("normalizes the theme to light | dark | undefined", () => {
    expect(createChatGptHostBridge({ theme: "dark" }).theme).toBe("dark")
    expect(createChatGptHostBridge({ theme: "light" }).theme).toBe("light")
    expect(createChatGptHostBridge({ theme: "sepia" }).theme).toBeUndefined()
  })
})

describe("createStandaloneHostBridge", () => {
  it("routes callTool through the injected function", async () => {
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { id: "x" } })
    const bridge = createStandaloneHostBridge({ callTool })

    const res = await bridge.callTool("find", { q: "a" })

    expect(callTool).toHaveBeenCalledWith("find", { q: "a" })
    expect(res).toEqual({ structuredContent: { id: "x" } })
  })

  it("reads static getData", () => {
    const bridge = createStandaloneHostBridge({
      callTool: vi.fn(),
      getData: { name: "Acme" },
    })
    expect(bridge.getWidgetData()).toEqual({ name: "Acme" })
  })

  it("re-reads getData when it is a getter", () => {
    let n = 0
    const bridge = createStandaloneHostBridge({
      callTool: vi.fn(),
      getData: () => ({ n: ++n }),
    })
    expect(bridge.getWidgetData()).toEqual({ n: 1 })
    expect(bridge.getWidgetData()).toEqual({ n: 2 })
  })

  it("returns null from getWidgetData when no getData is supplied", () => {
    const bridge = createStandaloneHostBridge({ callTool: vi.fn() })
    expect(bridge.getWidgetData()).toBeNull()
  })

  it("invokes onFollowup when supplied", () => {
    const onFollowup = vi.fn()
    const bridge = createStandaloneHostBridge({ callTool: vi.fn(), onFollowup })

    bridge.sendFollowup("analyse this")

    expect(onFollowup).toHaveBeenCalledWith("analyse this")
  })

  it("logs and drops the prompt when no onFollowup is supplied", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bridge = createStandaloneHostBridge({ callTool: vi.fn() })

    expect(() => bridge.sendFollowup("dropped")).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no onFollowup handler"))
  })

  it("invokes onOpenExternal when supplied", () => {
    const onOpenExternal = vi.fn()
    const bridge = createStandaloneHostBridge({ callTool: vi.fn(), onOpenExternal })

    bridge.openExternal("https://x.test")

    expect(onOpenExternal).toHaveBeenCalledWith("https://x.test")
  })

  it("routes setModelContext to onModelContext when supplied", () => {
    const onModelContext = vi.fn()
    const bridge = createStandaloneHostBridge({ callTool: vi.fn(), onModelContext })

    bridge.setModelContext?.("selected row 3")

    expect(onModelContext).toHaveBeenCalledWith("selected row 3")
  })

  it("logs and drops model context when no onModelContext is supplied", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bridge = createStandaloneHostBridge({ callTool: vi.fn() })

    expect(() => bridge.setModelContext?.("ctx")).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no onModelContext handler"))
  })

  it("passes through the configured theme", () => {
    expect(createStandaloneHostBridge({ callTool: vi.fn(), theme: "dark" }).theme).toBe("dark")
    expect(createStandaloneHostBridge({ callTool: vi.fn() }).theme).toBeUndefined()
  })
})
