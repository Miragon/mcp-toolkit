import { describe, expect, it } from "vitest"
import {
  decodeViewResult,
  DEFAULT_SLOW_HINT_MS,
  describeViewForModel,
  errorMessage,
  resolveViewLifecycle,
  RETRY_IDLE,
  retryFocusTarget,
  retryReducer,
  waitKey,
  withSlowHint,
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

  it("a latched non-view result nothing can recover is an error, not an endless wait", () => {
    // No toolInfo: the recovery cannot re-run the tool, so the wait would never end.
    expect(at({ callStatus: "ready", canRetry: false })).toEqual({
      phase: "error",
      reason: undefined,
      canRetry: false,
    })
    // Still pending on such a host: the result may yet arrive.
    expect(at({ callStatus: "pending", canRetry: false })).toEqual({
      phase: "waiting",
      slow: false,
    })
    // A running retry or a payload in hand still win.
    expect(
      at({ callStatus: "ready", canRetry: false, retryState: { status: "running", attempt: 1 } }),
    ).toEqual({ phase: "waiting", slow: false })
    expect(at({ callStatus: "ready", canRetry: false, hasViewData: true })).toEqual({
      phase: "result",
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

describe("withSlowHint", () => {
  const waiting = { phase: "waiting", slow: false } as const

  it("turns the current wait slow once ITS delay passed", () => {
    expect(withSlowHint(waiting, "idle:0", "idle:0")).toEqual({ phase: "waiting", slow: true })
  })

  it("keeps a new attempt and an unslowed wait without the hint", () => {
    expect(withSlowHint(waiting, "idle:0", "running:1")).toBe(waiting)
    expect(withSlowHint(waiting, null, "idle:0")).toBe(waiting)
    expect(withSlowHint(waiting, null, null)).toBe(waiting)
  })

  it("never touches a phase that is not waiting", () => {
    const error = { phase: "error", reason: "x", canRetry: true } as const
    expect(withSlowHint(error, "idle:0", "idle:0")).toBe(error)
    expect(withSlowHint({ phase: "result" }, "idle:0", "idle:0")).toEqual({ phase: "result" })
  })
})

describe("retryFocusTarget", () => {
  it("holds focus on the frame while the retry runs, then hands it on and settles", () => {
    expect(retryFocusTarget("waiting")).toEqual({ target: "frame", settled: false })
    expect(retryFocusTarget("error")).toEqual({ target: "retry", settled: true })
    expect(retryFocusTarget("result")).toEqual({ target: "frame", settled: true })
    expect(retryFocusTarget("cancelled")).toEqual({ target: "frame", settled: true })
  })
})

describe("decodeViewResult", () => {
  const isView = (v: unknown): v is { layout: unknown } =>
    typeof v === "object" && v !== null && "layout" in v

  it("returns the payload of a complete view", () => {
    expect(decodeViewResult({ structuredContent: { layout: { rows: [] } } }, isView)).toEqual({
      ok: true,
      data: { layout: { rows: [] } },
    })
  })

  it("types a tool error as such, with the isError text as the raw reason", () => {
    expect(decodeViewResult({ isError: true, content: [{ text: "[503] down" }] }, isView)).toEqual({
      ok: false,
      isError: true,
      reason: "[503] down",
    })
    // An isError result without text is still a tool error.
    expect(decodeViewResult({ isError: true, content: [{ text: "" }] }, isView)).toEqual({
      ok: false,
      isError: true,
      reason: undefined,
    })
  })

  it("types a payload the shell cannot render as no view, without a reason", () => {
    expect(decodeViewResult({ structuredContent: { other: 1 } }, isView)).toEqual({
      ok: false,
      isError: false,
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

describe("describeViewForModel (the view's model context, toolkit#176 K20)", () => {
  const error = (reason: string | undefined, canRetry = true) =>
    ({ phase: "error", reason, canRetry }) as const

  it("an error says what failed and that the user sees an error instead of the view", () => {
    expect(
      describeViewForModel({ lifecycle: error("[503] engine down"), toolName: "render-view" }),
    ).toBe(
      "The view of render-view could not be shown (reason: [503] engine down). " +
        "The user sees an error message with a retry button instead of the view.",
    )
    expect(describeViewForModel({ lifecycle: error(undefined, false), toolName: undefined })).toBe(
      "The view could not be shown. The user sees an error message instead of the view.",
    )
  })

  it("a cancellation says so", () => {
    expect(describeViewForModel({ lifecycle: { phase: "cancelled" }, toolName: "show_x" })).toBe(
      "The view of show_x was cancelled before it rendered. The user sees a note that the call was cancelled.",
    )
  })

  it("nothing while waiting, nor for a plain host-delivered view", () => {
    expect(
      describeViewForModel({ lifecycle: { phase: "waiting", slow: true }, toolName: "t" }),
    ).toBeNull()
    expect(describeViewForModel({ lifecycle: { phase: "result" }, toolName: "t" })).toBeNull()
    expect(
      describeViewForModel({
        lifecycle: { phase: "result" },
        toolName: "t",
        stepErrors: [],
        recoveredAt: null,
      }),
    ).toBeNull()
  })

  it("failed data steps of a shown view, with or without the alert's retry", () => {
    const stepErrors = [
      { stepId: "kpi", reason: "timeout" },
      { stepId: "list", reason: "[404] gone" },
    ]
    expect(
      describeViewForModel({
        lifecycle: { phase: "result" },
        toolName: "render-view",
        stepErrors,
        stepsRetryable: true,
      }),
    ).toBe(
      "The view of render-view is shown, but some of its data could not be loaded " +
        "(kpi: timeout; list: [404] gone). The user sees an alert with a retry button.",
    )
    expect(
      describeViewForModel({ lifecycle: { phase: "result" }, toolName: undefined, stepErrors }),
    ).toBe(
      "The view is shown, but some of its data could not be loaded " +
        "(kpi: timeout; list: [404] gone). The user sees an alert.",
    )
  })

  it("a payload the view re-loaded itself is live as of then (N23)", () => {
    const at = Date.UTC(2026, 9, 11, 14, 32, 5)
    expect(
      describeViewForModel({ lifecycle: { phase: "result" }, toolName: "t", recoveredAt: at }),
    ).toBe(
      "The view of t re-ran the tool at 2026-10-11T14:32:05.000Z because the host did not pass " +
        "the original result to the view; its figures are live as of then and can differ from the original result.",
    )
    expect(
      describeViewForModel({
        lifecycle: { phase: "result" },
        toolName: "t",
        recoveredAt: at,
        stepErrors: [{ stepId: "kpi", reason: "timeout" }],
      }),
    ).toMatch(
      /original result\. Some of its data could not be loaded \(kpi: timeout\)\. The user sees an alert\.$/,
    )
  })
})
