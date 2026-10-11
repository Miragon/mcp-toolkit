import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from "react"
import {
  decodeViewResult,
  errorMessage,
  resolveViewLifecycle,
  RETRY_IDLE,
  retryFocusTarget,
  retryReducer,
  waitKey,
  withSlowHint,
  type RenderCallStatus,
  type ViewLifecycle,
} from "./view-lifecycle.js"

export interface UseViewLifecycleOptions<T> {
  hasViewData: boolean
  callStatus: RenderCallStatus
  cancelled: boolean
  callError: unknown
  recoveryFailed: boolean
  /** The recovery policy kept the view from re-running a stripped result's tool. */
  recoveryBlocked?: boolean
  /** The host reports the originating tool as writing (no retry after a block). */
  toolWrites?: boolean
  /** The originating tool (`hostContext.toolInfo`); a retry needs it. */
  toolName: string | undefined
  toolInput: Record<string, unknown> | null | undefined
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  isValid: (value: unknown) => value is T
  /** Receives the payload of a successful retry. */
  onResult: (data: T) => void
  slowHintAfterMs: number
}

/**
 * Drives the {@link resolveViewLifecycle} state machine: owns the retry and
 * the slow-hint timer, and returns the current phase plus `retry()`.
 */
export function useViewLifecycle<T>(options: UseViewLifecycleOptions<T>): {
  lifecycle: ViewLifecycle
  retry: () => void
} {
  const { toolName, toolInput, callTool, isValid, onResult, slowHintAfterMs } = options
  const [retryState, dispatch] = useReducer(retryReducer, RETRY_IDLE)
  // The wait that went slow; a newer wait (another attempt) starts fresh.
  const [slowWait, setSlowWait] = useState<string | null>(null)

  const unslowed = resolveViewLifecycle({
    hasViewData: options.hasViewData,
    callStatus: options.callStatus,
    cancelled: options.cancelled,
    callErrorReason: errorMessage(options.callError),
    recoveryFailed: options.recoveryFailed,
    recoveryBlocked: options.recoveryBlocked,
    toolWrites: options.toolWrites,
    retryState,
    slow: false,
    canRetry: toolName !== undefined,
  })
  const currentWait = waitKey(unslowed, retryState)

  useEffect(() => {
    if (currentWait === null) return
    const timer = setTimeout(() => setSlowWait(currentWait), slowHintAfterMs)
    return () => clearTimeout(timer)
  }, [currentWait, slowHintAfterMs])

  const lifecycle = withSlowHint(unslowed, slowWait, currentWait)

  const retry = useCallback(() => {
    if (toolName === undefined) return
    dispatch({ type: "start" })
    void callTool(toolName, toolInput ?? {}).then(
      (result) => {
        const outcome = decodeViewResult(result, isValid)
        if (outcome.ok) {
          onResult(outcome.data)
          dispatch({ type: "succeeded" })
        } else {
          dispatch({ type: "failed", reason: outcome.reason })
        }
      },
      (err: unknown) => dispatch({ type: "failed", reason: errorMessage(err) }),
    )
  }, [callTool, isValid, onResult, toolInput, toolName])

  return { lifecycle, retry }
}

/** The retry button of the view's error state (the focus target after a failed retry). */
const RETRY_BUTTON = '[data-slot="error-state"] button'

/**
 * Keeps keyboard focus in the view across a user retry: the pressed button
 * unmounts when the view starts waiting, so focus moves to the frame (a
 * `tabIndex={-1}` container), then to the new retry button when the retry
 * failed, or stays on the frame once the view rendered (see
 * {@link retryFocusTarget}). Focus the user moved elsewhere meanwhile is left
 * alone. Returns the frame ref and `retry` wrapped to start the hand-off.
 */
export function useRetryFocus(
  phase: ViewLifecycle["phase"],
  retry: () => void,
): { frameRef: RefObject<HTMLDivElement | null>; retry: () => void } {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const owed = useRef(false)
  const retryWithFocus = useCallback(() => {
    owed.current = true
    retry()
  }, [retry])
  useEffect(() => {
    const frame = frameRef.current
    if (!owed.current || !frame) return
    const { target, settled } = retryFocusTarget(phase)
    if (settled) owed.current = false
    const active = frame.ownerDocument.activeElement
    if (active && active !== frame.ownerDocument.body && !frame.contains(active)) return
    const button = target === "retry" ? frame.querySelector<HTMLElement>(RETRY_BUTTON) : null
    ;(button ?? frame).focus()
  }, [phase])
  return { frameRef, retry: retryWithFocus }
}
