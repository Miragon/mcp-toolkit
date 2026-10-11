import { describe, expect, it, vi } from "vitest"
import {
  classifyHostMessage,
  classifyToolResult,
  createToolResultObserver,
  EMPTY_TOOL_OBSERVATION,
  installToolResultObserver,
  reduceToolObservation,
  type HostLifecycleMessage,
  type ToolObservation,
} from "./tool-result-observer.js"

/**
 * The passive observer behind the stripped-result recovery (toolkit#176 K13,
 * N21): it must tell a stripped result from a structured one and from "not
 * yet", read only the COMPLETE tool input, and never act on foreign traffic.
 */

const rpc = (method: string, params?: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  method,
  ...(params ? { params } : {}),
})

/** The host's answer to `ui/initialize`, as ext-apps sends it. */
const HANDSHAKE = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    protocolVersion: "2026-01-26",
    hostInfo: { name: "host", version: "1" },
    hostCapabilities: { serverTools: {} },
    hostContext: { toolInfo: { tool: { name: "render-view" } } },
  },
}

describe("classifyToolResult (mirrors the mcp-use 2.x latch)", () => {
  it("an isError result is an error, whatever else it carries", () => {
    expect(classifyToolResult({ isError: true })).toBe("error")
    expect(classifyToolResult({ isError: true, structuredContent: { a: 1 } })).toBe("error")
  })

  it("a result with structuredContent — even null — is structured", () => {
    expect(classifyToolResult({ structuredContent: { a: 1 } })).toBe("structured")
    expect(classifyToolResult({ structuredContent: null })).toBe("structured")
  })

  it("a content-only result is the stripped one claude.ai sends", () => {
    expect(classifyToolResult({ content: [{ type: "text", text: "Rendered." }] })).toBe("stripped")
    expect(classifyToolResult({})).toBe("stripped")
    expect(classifyToolResult({ isError: false })).toBe("stripped")
  })
})

describe("classifyHostMessage", () => {
  it("recognises the host's ui/initialize answer by its capabilities or protocol version", () => {
    expect(classifyHostMessage(HANDSHAKE)).toEqual({ kind: "handshake" })
    expect(
      classifyHostMessage({ jsonrpc: "2.0", id: 7, result: { protocolVersion: "x" } }),
    ).toEqual({ kind: "handshake" })
    expect(
      classifyHostMessage({ jsonrpc: "2.0", id: 7, result: { hostCapabilities: {} } }),
    ).toEqual({ kind: "handshake" })
  })

  it("ignores every other response (a tools/call answer, an error, a bare result)", () => {
    expect(
      classifyHostMessage({ jsonrpc: "2.0", id: 2, result: { structuredContent: {} } }),
    ).toBeNull()
    expect(classifyHostMessage({ jsonrpc: "2.0", id: 2, error: { code: 1 } })).toBeNull()
    expect(classifyHostMessage({ jsonrpc: "2.0", id: 2, result: "x" })).toBeNull()
    expect(
      classifyHostMessage({ jsonrpc: "2.0", result: { protocolVersion: "x" } }),
      "a response needs an id",
    ).toBeNull()
    expect(
      classifyHostMessage({ jsonrpc: "2.0", id: 3, result: { protocolVersion: 1 } }),
    ).toBeNull()
  })

  it("reads the complete tool input, never the partial stream", () => {
    expect(
      classifyHostMessage(rpc("ui/notifications/tool-input", { arguments: { id: 1 } })),
    ).toEqual({ kind: "tool-input", arguments: { id: 1 } })
    expect(
      classifyHostMessage(rpc("ui/notifications/tool-input-partial", { arguments: { id: 1 } })),
    ).toBeNull()
  })

  it("a tool input without usable arguments is an empty argument set", () => {
    expect(classifyHostMessage(rpc("ui/notifications/tool-input"))).toEqual({
      kind: "tool-input",
      arguments: {},
    })
    expect(
      classifyHostMessage(rpc("ui/notifications/tool-input", { arguments: ["not", "a", "map"] })),
    ).toEqual({ kind: "tool-input", arguments: {} })
  })

  it("classifies the tool result and the cancellation", () => {
    expect(classifyHostMessage(rpc("ui/notifications/tool-result", { content: [] }))).toEqual({
      kind: "tool-result",
      result: "stripped",
    })
    expect(
      classifyHostMessage(rpc("ui/notifications/tool-result", { structuredContent: {} })),
    ).toEqual({ kind: "tool-result", result: "structured" })
    expect(classifyHostMessage(rpc("ui/notifications/tool-result"))).toEqual({
      kind: "tool-result",
      result: "stripped",
    })
    expect(classifyHostMessage(rpc("ui/notifications/tool-cancelled"))).toEqual({
      kind: "tool-cancelled",
    })
  })

  it("ignores foreign traffic and other methods", () => {
    expect(classifyHostMessage(null)).toBeNull()
    expect(classifyHostMessage("ui/notifications/tool-result")).toBeNull()
    expect(classifyHostMessage([HANDSHAKE])).toBeNull()
    expect(classifyHostMessage({ method: "ui/notifications/tool-result" })).toBeNull()
    expect(classifyHostMessage({ ...HANDSHAKE, jsonrpc: "1.0" })).toBeNull()
    expect(classifyHostMessage(rpc("ui/notifications/host-context-changed", {}))).toBeNull()
    expect(classifyHostMessage(rpc("ui/resource-teardown", {}))).toBeNull()
  })
})

describe("reduceToolObservation", () => {
  const fold = (...messages: HostLifecycleMessage[]): ToolObservation =>
    messages.reduce(reduceToolObservation, EMPTY_TOOL_OBSERVATION)

  it("starts empty", () => {
    expect(EMPTY_TOOL_OBSERVATION).toEqual({
      sawHandshake: false,
      completeInput: undefined,
      result: "none",
      cancelled: false,
    })
  })

  it("records the handshake, the latest complete input and the result", () => {
    expect(
      fold(
        { kind: "handshake" },
        { kind: "tool-input", arguments: { a: 1 } },
        { kind: "tool-input", arguments: { a: 2 } },
        { kind: "tool-result", result: "stripped" },
      ),
    ).toEqual({ sawHandshake: true, completeInput: { a: 2 }, result: "stripped", cancelled: false })
  })

  it("settles once, like the mcp-use latch: nothing changes a delivered call", () => {
    const settled = fold(
      { kind: "tool-input", arguments: { a: 1 } },
      { kind: "tool-result", result: "structured" },
    )
    expect(reduceToolObservation(settled, { kind: "tool-input", arguments: { a: 9 } })).toBe(
      settled,
    )
    expect(reduceToolObservation(settled, { kind: "tool-result", result: "stripped" })).toBe(
      settled,
    )
    expect(reduceToolObservation(settled, { kind: "tool-cancelled" })).toBe(settled)
  })

  it("a cancellation settles the call too", () => {
    const cancelled = fold({ kind: "tool-cancelled" })
    expect(cancelled.cancelled).toBe(true)
    expect(reduceToolObservation(cancelled, { kind: "tool-result", result: "stripped" })).toBe(
      cancelled,
    )
  })

  it("a repeated handshake is the same state; a late one still counts after a result", () => {
    const shaken = fold({ kind: "handshake" })
    expect(reduceToolObservation(shaken, { kind: "handshake" })).toBe(shaken)
    const late = fold({ kind: "tool-result", result: "stripped" }, { kind: "handshake" })
    expect(late).toMatchObject({ sawHandshake: true, result: "stripped" })
  })
})

describe("createToolResultObserver", () => {
  const post = (target: EventTarget, data: unknown, source: unknown = null) => {
    const event = new MessageEvent("message", { data })
    Object.defineProperty(event, "source", { value: source })
    target.dispatchEvent(event)
  }

  it("folds the messages it accepts and notifies only on a change", () => {
    const target = new EventTarget()
    const observer = createToolResultObserver(target)
    const listener = vi.fn()
    observer.subscribe(listener)
    post(target, HANDSHAKE)
    post(target, rpc("ui/notifications/tool-input", { arguments: { id: 7 } }))
    post(target, rpc("ui/notifications/tool-input-partial", { arguments: { id: 8 } }))
    post(target, { unrelated: true })
    post(target, rpc("ui/notifications/tool-result", { content: [] }))
    post(target, rpc("ui/notifications/tool-result", { structuredContent: {} }))
    expect(observer.getSnapshot()).toEqual({
      sawHandshake: true,
      completeInput: { id: 7 },
      result: "stripped",
      cancelled: false,
    })
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it("drops what the filter refuses (another frame's traffic)", () => {
    const target = new EventTarget()
    const host = { name: "host" }
    const observer = createToolResultObserver(target, (event) => event.source === host)
    post(target, HANDSHAKE, { name: "intruder" })
    post(target, rpc("ui/notifications/tool-result", { content: [] }), null)
    expect(observer.getSnapshot()).toBe(EMPTY_TOOL_OBSERVATION)
    post(target, HANDSHAKE, host)
    expect(observer.getSnapshot().sawHandshake).toBe(true)
  })

  it("unsubscribes a listener, and dispose stops listening but keeps the last snapshot", () => {
    const target = new EventTarget()
    const observer = createToolResultObserver(target)
    const kept = vi.fn()
    const dropped = vi.fn()
    observer.subscribe(kept)
    const unsubscribe = observer.subscribe(dropped)
    unsubscribe()
    post(target, HANDSHAKE)
    expect(kept).toHaveBeenCalledTimes(1)
    expect(dropped).not.toHaveBeenCalled()
    observer.dispose()
    post(target, rpc("ui/notifications/tool-result", { content: [] }))
    expect(observer.getSnapshot()).toMatchObject({ sawHandshake: true, result: "none" })
    expect(kept).toHaveBeenCalledTimes(1)
  })
})

describe("installToolResultObserver", () => {
  it("is null outside a framed browser document (no host to observe)", () => {
    expect(installToolResultObserver()).toBeNull()
  })

  it("is null in a top-level window (no host frames the view)", async () => {
    vi.resetModules()
    const target = new EventTarget()
    vi.stubGlobal("window", Object.assign(target, { parent: target }))
    try {
      const fresh = await import("./tool-result-observer.js")
      expect(fresh.installToolResultObserver()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })

  it("listens from the moment the bundle evaluates, before any explicit install", async () => {
    vi.resetModules()
    const target = new EventTarget()
    const parent = { name: "host" }
    vi.stubGlobal("window", Object.assign(target, { parent }))
    try {
      const fresh = await import("./tool-result-observer.js")
      post(target, HANDSHAKE, parent)
      expect(fresh.installToolResultObserver()?.getSnapshot().sawHandshake).toBe(true)
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })

  it("installs once in a framed document and listens to the parent only", async () => {
    vi.resetModules()
    const target = new EventTarget()
    const parent = { name: "host" }
    vi.stubGlobal("window", Object.assign(target, { parent }))
    try {
      const fresh = await import("./tool-result-observer.js")
      const observer = fresh.installToolResultObserver()
      expect(observer).not.toBeNull()
      expect(fresh.installToolResultObserver(), "idempotent").toBe(observer)
      post(target, HANDSHAKE, { name: "other" })
      expect(observer?.getSnapshot().sawHandshake).toBe(false)
      post(target, HANDSHAKE, parent)
      expect(observer?.getSnapshot().sawHandshake).toBe(true)
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })

  function post(target: EventTarget, data: unknown, source: unknown) {
    const event = new MessageEvent("message", { data })
    Object.defineProperty(event, "source", { value: source })
    target.dispatchEvent(event)
  }
})
