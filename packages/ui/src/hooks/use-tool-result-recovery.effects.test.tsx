// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import type { ToolResultObserver } from "../lib/tool-result-observer.js"
import { createToolResultObserver } from "../lib/tool-result-observer.js"
import { advanceTimers, hookProbe, inAct, renderWithEffects } from "../render-effects.js"
import {
  DEFAULT_ASSUME_STRIPPED_AFTER_MS,
  useToolResultRecovery,
  type ToolResultRecoveryOptions,
} from "./use-tool-result-recovery.js"

/**
 * The hook's wiring with its effects running (toolkit#176 K13): the default
 * observer is the document's (`installToolResultObserver`), the controller
 * subscribes to it on mount, and a stripped result re-runs the tool from the
 * observer's notification alone, while a slow tool on a compliant host is
 * never re-run. The decision itself is pinned in the recovery model's tests.
 */

const installed = vi.hoisted(() => ({ observer: null as ToolResultObserver | null }))

// The document's observer, as a framed view would install it; the tests drive
// a fake host channel instead of window.parent.
vi.mock(import("../lib/tool-result-observer.js"), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, installToolResultObserver: () => installed.observer }
})

/** A host channel the observer listens on, with the SEP-1865 messages a host sends. */
function fakeHost() {
  const channel = new EventTarget()
  const observer = createToolResultObserver(channel)
  const send = (data: unknown) =>
    inAct(() => channel.dispatchEvent(new MessageEvent("message", { data })))
  const notify = (method: string, params: Record<string, unknown>) =>
    send({ jsonrpc: "2.0", method, params })
  return {
    observer,
    handshake: () =>
      send({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: "2026-01-26", hostCapabilities: {} },
      }),
    toolInput: (args: Record<string, unknown>) =>
      notify("ui/notifications/tool-input", { arguments: args }),
    strippedResult: () =>
      notify("ui/notifications/tool-result", { content: [{ type: "text", text: "Rendered." }] }),
    structuredResult: (structuredContent: unknown) =>
      notify("ui/notifications/tool-result", { content: [], structuredContent }),
  }
}

type CallTool = ToolResultRecoveryOptions["callTool"]

const PAYLOAD = { ok: true, rows: 3 }
const isValid = (value: unknown) => (value as { ok?: unknown } | null)?.ok === true

let callTool: Mock<CallTool>

/** Mount the hook with the view's inputs; the probe keeps its latest state. */
async function mount(over: Partial<ToolResultRecoveryOptions> = {}) {
  const options: ToolResultRecoveryOptions = {
    resultReady: false,
    props: undefined,
    isValid,
    // The view runtime's input: a partial stream may have merged into it.
    toolInput: { id: 7 },
    hostContext: { toolInfo: { tool: { name: "show_list" } } },
    callTool,
    ...over,
  }
  const probe = hookProbe(() => useToolResultRecovery<typeof PAYLOAD>(options))
  const view = await renderWithEffects(<probe.Probe />)
  return { ...view, state: probe.current }
}

beforeEach(() => {
  vi.useFakeTimers()
  callTool = vi.fn<CallTool>(() => Promise.resolve({ structuredContent: PAYLOAD }))
})

afterEach(() => {
  vi.useRealTimers()
  installed.observer = null
})

describe("useToolResultRecovery with its effects (K13)", () => {
  it("keep: a structured result the latch delivered is never re-run", async () => {
    const host = fakeHost()
    installed.observer = host.observer
    await host.handshake()
    await host.toolInput({ id: 7 })
    await host.structuredResult(PAYLOAD)
    const view = await mount({ resultReady: true, props: PAYLOAD })
    await advanceTimers(vi.advanceTimersByTime, DEFAULT_ASSUME_STRIPPED_AFTER_MS * 4)
    expect(callTool).not.toHaveBeenCalled()
    expect(view.state().data).toBeNull()
    await view.unmount()
  })

  it("slow: a compliant host still answering is never re-run, however long it takes", async () => {
    const host = fakeHost()
    installed.observer = host.observer
    await host.handshake()
    await host.toolInput({ id: 7 })
    const view = await mount()
    await advanceTimers(vi.advanceTimersByTime, DEFAULT_ASSUME_STRIPPED_AFTER_MS + 1)
    await advanceTimers(vi.advanceTimersByTime, 10_000)
    expect(callTool).not.toHaveBeenCalled()
    expect(view.state()).toMatchObject({ data: null, failed: false, blocked: null })
    await view.unmount()
  })

  it("strip: the observer's notification alone re-runs the tool once, with the complete input", async () => {
    const host = fakeHost()
    installed.observer = host.observer
    await host.handshake()
    const view = await mount()
    await host.toolInput({ id: 7, page: 2 })
    expect(callTool).not.toHaveBeenCalled()
    // Nothing re-renders the view here: only the subscription can react.
    await host.strippedResult()
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(callTool).toHaveBeenCalledWith("show_list", { id: 7, page: 2 })
    expect(view.state()).toMatchObject({ data: PAYLOAD, failed: false, args: { id: 7, page: 2 } })
    await advanceTimers(vi.advanceTimersByTime, 10_000)
    expect(callTool, "a single flight").toHaveBeenCalledTimes(1)
    await view.unmount()
  })

  it("without an observer (observer: null) the 2.x grace timer re-runs a silent call", async () => {
    const view = await mount({ observer: null })
    await advanceTimers(vi.advanceTimersByTime, DEFAULT_ASSUME_STRIPPED_AFTER_MS - 1)
    expect(callTool).not.toHaveBeenCalled()
    await advanceTimers(vi.advanceTimersByTime, 1)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(callTool).toHaveBeenCalledWith("show_list", { id: 7 })
    await view.unmount()
  })
})
