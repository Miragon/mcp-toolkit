import { useCallback, useEffect, useReducer, useState } from "react"
import {
  decodeRetryResult,
  errorMessage,
  resolveViewLifecycle,
  RETRY_IDLE,
  retryReducer,
  waitKey,
  type RenderCallStatus,
  type ViewLifecycle,
} from "./view-lifecycle.js"

export interface UseViewLifecycleOptions<T> {
  hasViewData: boolean
  callStatus: RenderCallStatus
  cancelled: boolean
  callError: unknown
  recoveryFailed: boolean
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

  const lifecycle: ViewLifecycle =
    unslowed.phase === "waiting" && slowWait !== null && slowWait === currentWait
      ? { phase: "waiting", slow: true }
      : unslowed

  const retry = useCallback(() => {
    if (toolName === undefined) return
    dispatch({ type: "start" })
    void callTool(toolName, toolInput ?? {}).then(
      (result) => {
        const outcome = decodeRetryResult(result, isValid)
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
