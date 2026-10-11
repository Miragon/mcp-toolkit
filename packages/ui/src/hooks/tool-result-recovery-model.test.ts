import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createToolResultObserver,
  EMPTY_TOOL_OBSERVATION,
  type ToolObservation,
  type ToolResultObserver,
} from "../lib/tool-result-observer.js"
import {
  createRecoveryController,
  decideRecovery,
  evaluateRecovery,
  policyAllows,
  RECOVERY_IDLE,
  recoveryArgs,
  resolveToolSafety,
  stableKey,
  type RecoveryDecisionInput,
  type RecoveryInputs,
  type RecoveryPolicy,
} from "./tool-result-recovery-model.js"
import { resolveRecoveryToolName } from "./use-tool-result-recovery.js"

/**
 * The stripped-result recovery of McpAppView (toolkit#176), driven through
 * the framework-free controller the hook binds to React. The scenarios are
 * the host behaviours the issue names: a host that KEEPS `structuredContent`,
 * one that STRIPS it (claude.ai), and a SLOW tool on a compliant host, which
 * must never be re-run (K13).
 */

const GRACE = 2500

const toolContext = (annotations?: Record<string, unknown>) => ({
  toolInfo: { id: 1, tool: { name: "render-view", ...(annotations ? { annotations } : {}) } },
})

interface View {
  context: object
  layout: object
}
const isView = (v: unknown): boolean =>
  typeof v === "object" && v !== null && "context" in v && "layout" in v
const VIEW: View = { context: { steps: {} }, layout: { rows: [] } }
const VIEW_B: View = { context: { steps: { b: 1 } }, layout: { rows: [] } }
const result = (structuredContent: unknown) => ({ content: [], structuredContent })

/** A host frame: posts the SEP-1865 lifecycle messages the observer reads. */
function hostFrame() {
  const target = new EventTarget()
  const observer = createToolResultObserver(target)
  const post = (data: unknown) => target.dispatchEvent(new MessageEvent("message", { data }))
  const notify = (method: string, params: Record<string, unknown> = {}) =>
    post({ jsonrpc: "2.0", method, params })
  return {
    observer,
    handshake: () =>
      post({ jsonrpc: "2.0", id: 0, result: { protocolVersion: "x", hostCapabilities: {} } }),
    input: (args: Record<string, unknown>) =>
      notify("ui/notifications/tool-input", { arguments: args }),
    partialInput: (args: Record<string, unknown>) =>
      notify("ui/notifications/tool-input-partial", { arguments: args }),
    structuredResult: () => notify("ui/notifications/tool-result", { structuredContent: VIEW }),
    strippedResult: () =>
      notify("ui/notifications/tool-result", { content: [{ type: "text", text: "Done." }] }),
    errorResult: () => notify("ui/notifications/tool-result", { isError: true, content: [] }),
    cancelled: () => notify("ui/notifications/tool-cancelled"),
  }
}

/** A controlled `callTool`: each call waits until the test settles it. */
function deferredCalls() {
  const calls: {
    name: string
    args: Record<string, unknown>
    resolve: (v: unknown) => void
    reject: (e: unknown) => void
  }[] = []
  const callTool = vi.fn(
    (name: string, args: Record<string, unknown>) =>
      new Promise<unknown>((resolve, reject) => calls.push({ name, args, resolve, reject })),
  )
  return { calls, callTool }
}

function setup(options: { observer?: ToolResultObserver | null; now?: () => number } = {}) {
  const { calls, callTool } = deferredCalls()
  const controller = createRecoveryController<View>({
    observer: options.observer ?? null,
    now: options.now ?? (() => 1_000),
  })
  const listener = vi.fn()
  controller.subscribe(listener)
  let current: RecoveryInputs = {
    resultReady: false,
    cancelled: false,
    errored: false,
    props: undefined,
    isValid: isView,
    toolInput: undefined,
    hostContext: toolContext(),
    callTool,
    policy: "auto",
    graceMs: GRACE,
    resolveToolName: resolveRecoveryToolName,
  }
  const update = (patch: Partial<RecoveryInputs>) => {
    current = { ...current, ...patch }
    controller.update(current)
  }
  return { controller, calls, callTool, listener, update }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("keep: a host that delivers structuredContent", () => {
  it("never re-executes the tool", async () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    update({ toolInput: { id: 1 } })
    host.input({ id: 1 })
    host.structuredResult()
    update({ resultReady: true, props: VIEW })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(callTool).not.toHaveBeenCalled()
    expect(controller.getState()).toBe(RECOVERY_IDLE)
  })
})

describe("slow: a compliant host still running the tool (K13)", () => {
  it("waits for the host's result instead of re-running after the grace period", async () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    host.input({ id: 1 })
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE * 10)
    expect(callTool, "a slow tool is never re-run").not.toHaveBeenCalled()
    host.structuredResult()
    update({ resultReady: true, props: VIEW })
    await vi.advanceTimersByTimeAsync(GRACE)
    expect(callTool).not.toHaveBeenCalled()
  })

  it("is exactly the case the 2.x grace timer got wrong (no observer: re-run after the grace)", async () => {
    const { controller, update, callTool } = setup({ observer: null })
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    expect(callTool).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(callTool).toHaveBeenCalledExactlyOnceWith("render-view", { id: 1 })
  })
})

describe("strip: a host that delivers the result without structuredContent", () => {
  it("re-runs the tool as the stripped result arrives, with the COMPLETE arguments (N21)", async () => {
    const host = hostFrame()
    const { controller, update, calls, listener } = setup({
      observer: host.observer,
      now: () => 42_000,
    })
    host.handshake()
    controller.start()
    // mcp-use merges partial and complete input into one field.
    host.partialInput({ id: 1 })
    update({ toolInput: { id: 1 } })
    host.input({ id: 1, period: "7d" })
    update({ toolInput: { id: 1, period: "7d" } })
    expect(calls).toHaveLength(0)
    host.strippedResult()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: "render-view", args: { id: 1, period: "7d" } })
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState()).toEqual({
      data: VIEW,
      failed: false,
      blocked: null,
      recoveredAt: 42_000,
      args: { id: 1, period: "7d" },
    })
    expect(listener).toHaveBeenCalled()
  })

  it("uses the complete input the observer saw even when the view only holds a partial one", () => {
    const host = hostFrame()
    const { controller, update, calls } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    host.partialInput({ id: 1 })
    update({ toolInput: { id: 1 } })
    host.input({ id: 1, full: true })
    host.strippedResult()
    expect(calls[0]?.args).toEqual({ id: 1, full: true })
  })

  it("an observer that joined late still sees the stripped result and recovers at once", () => {
    const host = hostFrame()
    const { controller, update, calls } = setup({ observer: host.observer })
    controller.start()
    update({ toolInput: { id: 1 } })
    host.strippedResult()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual({ id: 1 })
  })

  it("an observer that joined late and saw nothing falls back to the grace timer", async () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    expect(callTool).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(callTool).toHaveBeenCalledOnce()
  })

  it("a latched result that is no view is recovered at once", () => {
    const { controller, update, calls } = setup()
    controller.start()
    update({ resultReady: true, props: { notAView: true }, toolInput: { id: 1 } })
    expect(calls).toHaveLength(1)
  })

  it("a failed re-run reports `failed` once and never loops", async () => {
    const host = hostFrame()
    const { controller, update, calls, callTool } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    update({ toolInput: { id: 1 } })
    host.strippedResult()
    calls[0]?.reject(new Error("transport down"))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState()).toMatchObject({ data: null, failed: true, args: { id: 1 } })
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE * 4)
    expect(callTool).toHaveBeenCalledOnce()
  })

  it("an unusable re-run payload is a failure too", async () => {
    const host = hostFrame()
    const { controller, update, calls } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    update({ toolInput: {} })
    host.strippedResult()
    calls[0]?.resolve(result({ notAView: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState().failed).toBe(true)
  })

  it("the host's own payload, once delivered, replaces a recovered one", async () => {
    const { controller, update, calls } = setup()
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE)
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState().data).toEqual(VIEW)
    update({ resultReady: true, props: VIEW_B })
    expect(controller.getState()).toBe(RECOVERY_IDLE)
  })
})

describe("never recover a failed or cancelled call (K14)", () => {
  it("an isError result is rendered, not re-run", async () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    update({ toolInput: { id: 1 } })
    host.errorResult()
    update({ resultReady: true, errored: true })
    await vi.advanceTimersByTimeAsync(GRACE * 4)
    expect(callTool).not.toHaveBeenCalled()
  })

  it("a cancellation drops an attempt in flight and its outcome", async () => {
    const { controller, update, calls } = setup()
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE)
    expect(calls).toHaveLength(1)
    update({ cancelled: true })
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState()).toBe(RECOVERY_IDLE)
  })

  it("a cancellation the observer saw suppresses the recovery before the latch reports it", async () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    controller.start()
    update({ toolInput: { id: 1 } })
    host.cancelled()
    await vi.advanceTimersByTimeAsync(GRACE * 2)
    expect(callTool).not.toHaveBeenCalled()
  })
})

describe("the recovery policy (annotations) and the named tool", () => {
  const blockedFor = (policy: RecoveryPolicy, annotations?: Record<string, unknown>) => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    update({ toolInput: { id: 1 }, policy, hostContext: toolContext(annotations) })
    host.strippedResult()
    return { state: controller.getState(), called: callTool.mock.calls.length }
  }

  it("auto never re-runs a tool the host reports as writing", () => {
    expect(blockedFor("auto", { readOnlyHint: false })).toEqual({
      state: { ...RECOVERY_IDLE, blocked: "policy" },
      called: 0,
    })
    expect(blockedFor("auto", { destructiveHint: true, readOnlyHint: true }).called).toBe(0)
  })

  it("auto re-runs a read-only tool and one without annotations", () => {
    expect(blockedFor("auto", { readOnlyHint: true }).called).toBe(1)
    expect(blockedFor("auto").called).toBe(1)
  })

  it("read-only needs the host's readOnlyHint", () => {
    expect(blockedFor("read-only").state.blocked).toBe("policy")
    expect(blockedFor("read-only", { readOnlyHint: true }).called).toBe(1)
  })

  it("never re-runs nothing", () => {
    expect(blockedFor("never", { readOnlyHint: true })).toEqual({
      state: { ...RECOVERY_IDLE, blocked: "policy" },
      called: 0,
    })
  })

  it("a stripped result on a host that names no tool is unrecoverable, not an endless wait", () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    update({ toolInput: { id: 1 }, hostContext: {} })
    host.strippedResult()
    expect(controller.getState().blocked).toBe("no-tool")
    expect(callTool).not.toHaveBeenCalled()
  })

  it("a no-tool block lifts as soon as the host names the tool, while the re-run runs", () => {
    const host = hostFrame()
    const { controller, update, calls } = setup({ observer: host.observer })
    host.handshake()
    controller.start()
    update({ toolInput: { id: 1 }, hostContext: {} })
    host.strippedResult()
    expect(controller.getState().blocked).toBe("no-tool")
    update({ hostContext: toolContext() })
    expect(calls).toHaveLength(1)
    expect(controller.getState(), "no error shown for a running re-run").toBe(RECOVERY_IDLE)
  })

  it("a block lifts when the need goes away", () => {
    const host = hostFrame()
    const { controller, update } = setup({ observer: host.observer })
    controller.start()
    update({ toolInput: {}, policy: "never" })
    host.strippedResult()
    expect(controller.getState().blocked).toBe("policy")
    update({ resultReady: true, props: VIEW })
    expect(controller.getState()).toBe(RECOVERY_IDLE)
  })
})

describe("arguments: partial streams and re-deliveries (N21)", () => {
  it("newer arguments drop a running re-run, restart the grace and keep the newer payload", async () => {
    const { controller, update, calls } = setup()
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE)
    expect(calls).toHaveLength(1)
    update({ toolInput: { id: 2 } })
    expect(controller.getState()).toBe(RECOVERY_IDLE)
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.args).toEqual({ id: 2 })
    calls[1]?.resolve(result(VIEW_B))
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState()).toMatchObject({ data: VIEW_B, args: { id: 2 } })
  })

  it("an equal re-delivery (new object, other key order) is the same run", async () => {
    const { controller, update, callTool } = setup()
    controller.start()
    update({ toolInput: { a: 1, b: { c: 2, d: 3 } } })
    await vi.advanceTimersByTimeAsync(GRACE - 100)
    update({ toolInput: { b: { d: 3, c: 2 }, a: 1 } })
    await vi.advanceTimersByTimeAsync(100)
    expect(callTool, "the grace was not restarted").toHaveBeenCalledOnce()
    update({ toolInput: { a: 1, b: { c: 2, d: 3 } } })
    await vi.advanceTimersByTimeAsync(GRACE)
    expect(callTool, "and not fired twice").toHaveBeenCalledOnce()
  })

  it("without any arguments yet the grace timer is not armed", async () => {
    const { controller, update, callTool } = setup()
    controller.start()
    update({ toolInput: undefined })
    await vi.advanceTimersByTimeAsync(GRACE * 4)
    expect(callTool).not.toHaveBeenCalled()
  })

  it("without a named tool the grace timer is not armed either", async () => {
    const { controller, update, callTool } = setup()
    controller.start()
    update({ toolInput: { id: 1 }, hostContext: undefined })
    await vi.advanceTimersByTimeAsync(GRACE * 4)
    expect(callTool).not.toHaveBeenCalled()
    expect(controller.getState()).toBe(RECOVERY_IDLE)
  })

  it("newer arguments before the grace ran out restart it: the old timer never fires", async () => {
    const { controller, update, calls } = setup()
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE - 500)
    update({ toolInput: { id: 2 } })
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    expect(calls, "no call 2.5 s after the FIRST arguments").toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls.map((c) => c.args)).toEqual([{ id: 2 }])
  })

  it("a grace dropped while the tool is unnamed restarts in full once it is named again", async () => {
    const { controller, update, callTool } = setup()
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    update({ hostContext: undefined })
    await vi.advanceTimersByTimeAsync(GRACE)
    expect(callTool).not.toHaveBeenCalled()
    update({ hostContext: toolContext() })
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    expect(callTool).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(callTool).toHaveBeenCalledOnce()
  })

  it("the observer's complete input counts as arguments even before the view holds any", async () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    controller.start()
    host.input({ id: 7 })
    update({ toolInput: undefined })
    await vi.advanceTimersByTimeAsync(GRACE)
    expect(callTool).toHaveBeenCalledExactlyOnceWith("render-view", { id: 7 })
  })
})

describe("what the controller reports", () => {
  it("warns with the tool's name when a re-run fails or returns nothing usable", async () => {
    const warn = vi.mocked(console.warn)
    const { controller, update, calls } = setup()
    controller.start()
    update({ resultReady: true, props: null, toolInput: { id: 1 } })
    calls[0]?.reject(new Error("transport down"))
    await vi.advanceTimersByTimeAsync(0)
    expect(warn).toHaveBeenLastCalledWith(
      '[mcp-toolkit] tool-result recovery for "render-view" failed:',
      expect.objectContaining({ message: "transport down" }),
    )
    update({ toolInput: { id: 2 } })
    calls[1]?.resolve(result({ notAView: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(warn).toHaveBeenLastCalledWith(
      '[mcp-toolkit] tool-result recovery: re-executing "render-view" returned no usable payload',
    )
  })

  it("tells its listeners only about real changes", async () => {
    const { controller, update, listener, calls } = setup()
    controller.start()
    update({ toolInput: { id: 1 }, policy: "never", resultReady: true, props: null })
    expect(controller.getState().blocked).toBe("policy")
    update({ toolInput: { id: 1 }, policy: "never", resultReady: true, props: null })
    update({ toolInput: { id: 1 }, policy: "never", resultReady: true, props: null })
    expect(listener, "one block, one notification").toHaveBeenCalledOnce()
    update({ policy: "auto" })
    expect(listener, "the lifted block").toHaveBeenCalledTimes(2)
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    update({ policy: "auto" })
    expect(listener, "the recovered payload, once").toHaveBeenCalledTimes(3)
  })
})

describe("mount lifecycle", () => {
  it("a StrictMode stop/start never fires a second call; the first one still lands", async () => {
    const host = hostFrame()
    const { controller, update, calls } = setup({ observer: host.observer })
    controller.start()
    update({ toolInput: { id: 1 } })
    host.strippedResult()
    controller.stop()
    controller.start()
    expect(calls).toHaveLength(1)
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState().data).toEqual(VIEW)
  })

  it("a stopped grace timer restarts in full on the next start", async () => {
    const { controller, update, callTool } = setup()
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    controller.stop()
    await vi.advanceTimersByTimeAsync(GRACE)
    expect(callTool).not.toHaveBeenCalled()
    controller.start()
    await vi.advanceTimersByTimeAsync(GRACE - 1)
    expect(callTool).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(callTool).toHaveBeenCalledOnce()
  })

  it("an elapsed grace survives a stop/start: the running re-run is kept and lands", async () => {
    const { controller, update, calls } = setup()
    controller.start()
    update({ toolInput: { id: 1 } })
    await vi.advanceTimersByTimeAsync(GRACE)
    controller.stop()
    controller.start()
    await vi.advanceTimersByTimeAsync(GRACE * 2)
    expect(calls).toHaveLength(1)
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getState().data).toEqual(VIEW)
  })

  it("stop unsubscribes from the observer; nothing runs before the first update", () => {
    const host = hostFrame()
    const { controller, update, callTool } = setup({ observer: host.observer })
    controller.start()
    host.strippedResult()
    expect(callTool, "no inputs yet").not.toHaveBeenCalled()
    controller.stop()
    update({ toolInput: {} })
    expect(callTool, "an update still evaluates the latest observation").toHaveBeenCalledOnce()
  })

  it("unsubscribed listeners are no longer told about changes", async () => {
    const { controller, update, calls } = setup()
    const late = vi.fn()
    const unsubscribe = controller.subscribe(late)
    unsubscribe()
    controller.start()
    update({ resultReady: true, props: null, toolInput: {} })
    calls[0]?.resolve(result(VIEW))
    await vi.advanceTimersByTimeAsync(0)
    expect(late).not.toHaveBeenCalled()
  })
})

describe("decideRecovery (the rule, as a table)", () => {
  const base: RecoveryDecisionInput = {
    resultReady: false,
    payloadValid: false,
    cancelled: false,
    errored: false,
    observation: null,
    hasInput: true,
    toolName: "render-view",
    safety: "unknown",
    policy: "auto",
    graceElapsed: false,
  }
  const seen = (patch: Partial<ToolObservation>): ToolObservation => ({
    ...EMPTY_TOOL_OBSERVATION,
    ...patch,
  })

  it("cancelled or failed: nothing", () => {
    expect(decideRecovery({ ...base, resultReady: true, cancelled: true })).toEqual({
      action: "none",
    })
    expect(decideRecovery({ ...base, resultReady: true, errored: true })).toEqual({
      action: "none",
    })
    expect(
      decideRecovery({ ...base, observation: seen({ result: "stripped", cancelled: true }) }),
    ).toEqual({ action: "none" })
  })

  it("delivered: nothing; latched but no view: recover", () => {
    expect(decideRecovery({ ...base, resultReady: true, payloadValid: true })).toEqual({
      action: "none",
    })
    expect(decideRecovery({ ...base, resultReady: true })).toEqual({ action: "recover" })
  })

  it("the observer's verdict: stripped recovers, structured or error waits for the latch", () => {
    expect(decideRecovery({ ...base, observation: seen({ result: "stripped" }) })).toEqual({
      action: "recover",
    })
    expect(decideRecovery({ ...base, observation: seen({ result: "structured" }) })).toEqual({
      action: "none",
    })
    expect(decideRecovery({ ...base, observation: seen({ result: "error" }) })).toEqual({
      action: "none",
    })
  })

  it("nothing seen since the handshake: wait without a timer (K13)", () => {
    expect(
      decideRecovery({ ...base, observation: seen({ sawHandshake: true }), graceElapsed: true }),
    ).toEqual({ action: "wait", armGrace: false })
  })

  it("no observer to vouch: the grace timer decides, once a tool and arguments are known", () => {
    expect(decideRecovery(base)).toEqual({ action: "wait", armGrace: true })
    expect(decideRecovery({ ...base, graceElapsed: true })).toEqual({ action: "recover" })
    expect(decideRecovery({ ...base, observation: seen({}) })).toEqual({
      action: "wait",
      armGrace: true,
    })
    expect(decideRecovery({ ...base, hasInput: false })).toEqual({
      action: "wait",
      armGrace: false,
    })
    expect(decideRecovery({ ...base, toolName: undefined })).toEqual({
      action: "wait",
      armGrace: false,
    })
  })

  it("a needed recovery the policy or a missing tool forbids is blocked", () => {
    expect(decideRecovery({ ...base, resultReady: true, safety: "writes" })).toEqual({
      action: "blocked",
      reason: "policy",
    })
    expect(decideRecovery({ ...base, resultReady: true, toolName: undefined })).toEqual({
      action: "blocked",
      reason: "no-tool",
    })
  })
})

describe("evaluateRecovery", () => {
  it("keys the run by the tool and the content of its arguments", () => {
    const inputs: RecoveryInputs = {
      resultReady: true,
      cancelled: false,
      errored: false,
      props: null,
      isValid: isView,
      toolInput: { b: 2, a: 1 },
      hostContext: toolContext(),
      callTool: () => Promise.resolve(null),
      policy: "auto",
      graceMs: GRACE,
      resolveToolName: resolveRecoveryToolName,
    }
    const run = evaluateRecovery(inputs, null, { key: null, elapsed: false })
    expect(run).toEqual({
      decision: { action: "recover" },
      toolName: "render-view",
      args: { b: 2, a: 1 },
      argsKey: '{"a":1,"b":2}',
      runKey: 'render-view\u0000{"a":1,"b":2}',
    })
    const elsewhere = evaluateRecovery({ ...inputs, resultReady: false }, null, {
      key: '{"a":9}',
      elapsed: true,
    })
    expect(elsewhere.decision, "an elapsed grace for other arguments does not count").toEqual({
      action: "wait",
      armGrace: true,
    })
    const unnamed = evaluateRecovery({ ...inputs, hostContext: {} }, null, {
      key: null,
      elapsed: false,
    })
    expect(unnamed.runKey).toBe('\u0000{"a":1,"b":2}')
  })
})

describe("resolveToolSafety / policyAllows", () => {
  it("reads the host's annotations", () => {
    expect(resolveToolSafety(toolContext({ readOnlyHint: true }))).toBe("read-only")
    expect(resolveToolSafety(toolContext({ readOnlyHint: false }))).toBe("writes")
    expect(resolveToolSafety(toolContext({ readOnlyHint: true, destructiveHint: true }))).toBe(
      "writes",
    )
    expect(resolveToolSafety(toolContext({ destructiveHint: false }))).toBe("unknown")
    expect(resolveToolSafety(toolContext({}))).toBe("unknown")
    expect(resolveToolSafety(toolContext())).toBe("unknown")
    expect(resolveToolSafety({ toolInfo: { tool: "render-view" } })).toBe("unknown")
    expect(resolveToolSafety({ toolInfo: null })).toBe("unknown")
    expect(resolveToolSafety({ toolInfo: { tool: { annotations: [] } } })).toBe("unknown")
    expect(resolveToolSafety(undefined)).toBe("unknown")
  })

  it("maps policy × safety", () => {
    expect(policyAllows("auto", "read-only")).toBe(true)
    expect(policyAllows("auto", "unknown")).toBe(true)
    expect(policyAllows("auto", "writes")).toBe(false)
    expect(policyAllows("read-only", "read-only")).toBe(true)
    expect(policyAllows("read-only", "unknown")).toBe(false)
    expect(policyAllows("read-only", "writes")).toBe(false)
    expect(policyAllows("never", "read-only")).toBe(false)
  })
})

describe("recoveryArgs / stableKey", () => {
  it("prefers the observer's complete input over the view's, then none", () => {
    const observed = { ...EMPTY_TOOL_OBSERVATION, completeInput: { full: true } }
    expect(recoveryArgs(observed, { partial: true })).toEqual({ full: true })
    expect(recoveryArgs(EMPTY_TOOL_OBSERVATION, { partial: true })).toEqual({ partial: true })
    expect(recoveryArgs(null, null)).toEqual({})
    expect(recoveryArgs(null, undefined)).toEqual({})
  })

  it("is the content identity of a JSON value, independent of key order", () => {
    expect(stableKey({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"x":0,"y":1}]},"b":1}',
    )
    expect(stableKey([3, 1])).toBe("[3,1]")
    expect(stableKey("x")).toBe('"x"')
    expect(stableKey(undefined)).toBe("undefined")
  })
})
