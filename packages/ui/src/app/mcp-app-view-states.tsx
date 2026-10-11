/**
 * The pre-payload states of `McpAppView`, one per lifecycle phase
 * (`view-lifecycle.ts`): waiting (skeleton + status line + slow hint),
 * cancelled, and error (icon, title, what to do, raw reason under "Details",
 * retry when the originating tool is known). A `blocked` error is a notice in
 * the info tone, not a failure: the tool ran, but the chat did not pass its
 * result to the view. Hook-free and SSR-renderable, so each phase is pinned
 * by a test.
 */
import { ErrorState, type ErrorStateTone } from "../components/ErrorState.js"
import { Skeleton } from "../primitives/skeleton.js"
import type { McpAppViewLabels } from "./mcp-app-view-chrome.js"
import type { ViewErrorKind, ViewLifecycle } from "./view-lifecycle.js"

export type { ViewErrorKind } from "./view-lifecycle.js"

/**
 * Human text for a raw error reason (e.g. map "503" to "the engine is down").
 * `info.kind` tells a failure (`"failed"`) from a result the chat did not pass
 * to the view (`"blocked"`, no reason); return `undefined` to keep the
 * toolkit's words for that state.
 */
export type DescribeViewError = (
  reason: string | undefined,
  info?: { kind: ViewErrorKind },
) => { title?: string; description?: string } | undefined

export function ViewPlaceholder({
  lifecycle,
  labels,
  onRetry,
  describeError,
}: {
  /** The current phase; `result` renders nothing (the view takes over). */
  lifecycle: ViewLifecycle
  labels: Required<McpAppViewLabels>
  onRetry: () => void
  describeError?: DescribeViewError
}) {
  switch (lifecycle.phase) {
    case "result":
      return null
    case "cancelled":
      return (
        <div className="px-4 py-4">
          <p role="status" className="text-muted-foreground text-sm">
            {labels.cancelled}
          </p>
        </div>
      )
    case "error":
      return (
        <ViewErrorState
          kind={lifecycle.kind}
          reason={lifecycle.reason}
          canRetry={lifecycle.canRetry}
          labels={labels}
          onRetry={onRetry}
          describeError={describeError}
        />
      )
    case "waiting":
      return <ViewWaiting slow={lifecycle.slow} labels={labels} />
  }
}

function ViewWaiting({ slow, labels }: { slow: boolean; labels: Required<McpAppViewLabels> }) {
  // No aria-busy on an ancestor of the live region: assistive technology may
  // hold back changes inside a busy subtree, and the slow hint is one.
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <Skeleton aria-hidden="true" className="h-8 w-48" />
      <Skeleton aria-hidden="true" className="h-32 w-full" />
      {/* One live region: the status line, then the slow hint when it appears. */}
      <div role="status" className="text-muted-foreground flex flex-col gap-1 text-sm">
        <p>{labels.loading}</p>
        {slow && <p data-slot="slow-hint">{labels.slowHint}</p>}
      </div>
    </div>
  )
}

/** The words and tone of an error phase; the hint never promises a retry the state does not offer. */
function errorStateCopy(
  kind: ViewErrorKind,
  canRetry: boolean,
  labels: Required<McpAppViewLabels>,
): { tone: ErrorStateTone; role: "alert" | "status"; title: string; hint: string; retry: string } {
  if (kind === "blocked") {
    // Nothing failed: a quiet notice that says what happened and what to do.
    return {
      tone: "info",
      role: "status",
      title: labels.blockedTitle,
      hint: canRetry ? labels.blockedHint : labels.blockedHintNoRetry,
      retry: labels.blockedRetry,
    }
  }
  return {
    tone: "danger",
    role: "alert",
    title: labels.errorTitle,
    hint: canRetry ? labels.errorHint : labels.errorHintNoRetry,
    retry: labels.retry,
  }
}

function ViewErrorState({
  kind = "failed",
  reason,
  canRetry,
  labels,
  onRetry,
  describeError,
}: {
  /** Absent for a failure (see `ViewLifecycle`). */
  kind: ViewErrorKind | undefined
  reason: string | undefined
  canRetry: boolean
  labels: Required<McpAppViewLabels>
  onRetry: () => void
  describeError?: DescribeViewError
}) {
  const human = describeError?.(reason, { kind })
  const copy = errorStateCopy(kind, canRetry, labels)
  return (
    <div className="px-4 py-4">
      <ErrorState
        tone={copy.tone}
        role={copy.role}
        title={human?.title ?? copy.title}
        description={human?.description ?? copy.hint}
        details={reason}
        detailsLabel={labels.errorDetails}
        retryLabel={copy.retry}
        onRetry={canRetry ? onRetry : undefined}
      />
    </div>
  )
}
