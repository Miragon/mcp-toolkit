import { describe, expect, it } from "vitest"
import {
  decodeRetryResult,
  DEFAULT_SLOW_HINT_MS,
  errorMessage,
  resolveViewLifecycle,
  RETRY_IDLE,
  retryReducer,
  waitKey,
  type RetryState,
  type ViewLifecycleInput,
} from "./view-lifecycle.js"

/** The baseline: a rendering call still open on a host that knows the tool. */
const waiting: ViewLifecycleInput = {
  hasViewData: false,
  callStatus: "pending",
  cancelled: false,
  callErrorReason: undefined,
  recoveryFailed: false,
  retryState: RETRY_IDLE,
  slow: false,
  canRetry: true,
}

const at = (over: Partial<ViewLifecycleInput>) => resolveViewLifecycle({ ...waiting, ...over })

describe("resolveViewLifecycle (toolkit#176 state machine)", () => {
  it("waits while the rendering call is open, slow once the hint delay passed", () => {
    expect(at({})).toEqual({ phase: "waiting", slow: false })
    expect(at({ slow: true })).toEqual({ phase: "waiting", slow: true })
    // A latched-ready call without a complete payload (recovery in flight) still waits.
    expect(at({ callStatus: "ready" })).toEqual({ phase: "waiting", slow: false })
  })

  it("an isError result is an error with its reason — never an endless wait (K14)", () => {
    expect(at({ callStatus: "error", callErrorReason: "[503] engine down" })).toEqual({
      phase: "error",
      reason: "[503] engine down",
      canRetry: true,
    })
  })

  it("a failed stripped-result recovery is an error too (N22: a terminal state)", () => {
    expect(at({ recoveryFailed: true })).toEqual({
      phase: "error",
      reason: undefined,
      canRetry: true,
    })
  })

  it("offers a retry only when the originating tool is known", () => {
    expect(at({ callStatus: "error", canRetry: false })).toMatchObject({
      phase: "error",
      canRetry: false,
    })
  })

  it("a host cancellation is terminal and wins over the error status it latches as", () => {
    expect(at({ cancelled: true, callStatus: "error", callErrorReason: "cancelled" })).toEqual({
      phase: "cancelled",
    })
  })

  it("a running retry waits (with its own slow flag), a failed retry shows ITS reason", () => {
    const running: RetryState = { status: "running", attempt: 1 }
    expect(at({ callStatus: "error", retryState: running })).toEqual({
      phase: "waiting",
      slow: false,
    })
    expect(at({ callStatus: "error", retryState: running, slow: true })).toEqual({
      phase: "waiting",
      slow: true,
    })
    const failed: RetryState = { status: "failed", attempt: 1, reason: "still down" }
    expect(at({ callStatus: "error", callErrorReason: "first", retryState: failed })).toEqual({
      phase: "error",
      reason: "still down",
      canRetry: true,
    })
    expect(at({ cancelled: true, retryState: failed, canRetry: false })).toEqual({
      phase: "error",
      reason: "still down",
      canRetry: false,
    })
  })

  it("a payload in hand always wins — the view renders", () => {
    expect(at({ hasViewData: true, callStatus: "error", recoveryFailed: true })).toEqual({
      phase: "result",
    })
    expect(at({ hasViewData: true, retryState: { status: "running", attempt: 2 } })).toEqual({
      phase: "result",
    })
    expect(at({ hasViewData: true, cancelled: true })).toEqual({ phase: "result" })
  })
})

describe("retryReducer", () => {
  it("counts attempts: start runs the next one, failure keeps the count and the reason", () => {
    const first = retryReducer(RETRY_IDLE, { type: "start" })
    expect(first).toEqual({ status: "running", attempt: 1 })
    const failed = retryReducer(first, { type: "failed", reason: "503" })
    expect(failed).toEqual({ status: "failed", attempt: 1, reason: "503" })
    const second = retryReducer(failed, { type: "start" })
    expect(second).toEqual({ status: "running", attempt: 2 })
    expect(retryReducer(second, { type: "succeeded" })).toEqual({ status: "idle", attempt: 2 })
    expect(retryReducer(second, { type: "failed", reason: undefined })).toEqual({
      status: "failed",
      attempt: 2,
      reason: undefined,
    })
  })
})

describe("waitKey", () => {
  it("names each wait so the slow hint restarts per attempt and stops when not waiting", () => {
    expect(waitKey({ phase: "waiting", slow: false }, RETRY_IDLE)).toBe("idle:0")
    expect(waitKey({ phase: "waiting", slow: false }, { status: "running", attempt: 2 })).toBe(
      "running:2",
    )
    expect(waitKey({ phase: "error", reason: undefined, canRetry: true }, RETRY_IDLE)).toBeNull()
    expect(waitKey({ phase: "result" }, RETRY_IDLE)).toBeNull()
    expect(waitKey({ phase: "cancelled" }, RETRY_IDLE)).toBeNull()
  })

  it("waits 8 s before the slow hint by default", () => {
    expect(DEFAULT_SLOW_HINT_MS).toBe(8000)
  })
})

describe("decodeRetryResult", () => {
  const isView = (v: unknown): v is { layout: unknown } =>
    typeof v === "object" && v !== null && "layout" in v

  it("returns the payload of a complete view", () => {
    expect(decodeRetryResult({ structuredContent: { layout: { rows: [] } } }, isView)).toEqual({
      ok: true,
      data: { layout: { rows: [] } },
    })
  })

  it("returns the isError text as the reason", () => {
    expect(decodeRetryResult({ isError: true, content: [{ text: "[503] down" }] }, isView)).toEqual(
      { ok: false, reason: "[503] down" },
    )
  })

  it("has no reason for a payload the shell cannot render", () => {
    expect(decodeRetryResult({ structuredContent: { other: 1 } }, isView)).toEqual({
      ok: false,
      reason: undefined,
    })
  })
})

describe("errorMessage", () => {
  it("reads Error messages and strings, nothing else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
    expect(errorMessage(new Error(""))).toBeUndefined()
    expect(errorMessage("plain")).toBe("plain")
    expect(errorMessage("")).toBeUndefined()
    expect(errorMessage({ message: "not an error" })).toBeUndefined()
    expect(errorMessage(undefined)).toBeUndefined()
  })
})
