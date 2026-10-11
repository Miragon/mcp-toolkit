/**
 * The pre-payload states of `McpAppView`, one per lifecycle phase
 * (`view-lifecycle.ts`): waiting (skeleton + status line + slow hint),
 * cancelled, and error (icon, title, what to do, raw reason under "Details",
 * retry). Hook-free and SSR-renderable, so each phase is pinned by a test.
 */
import { ErrorState } from "../components/ErrorState.js"
import { Skeleton } from "../primitives/skeleton.js"
import type { McpAppViewLabels } from "./mcp-app-view-chrome.js"
import type { ViewLifecycle } from "./view-lifecycle.js"

/** Human text for a raw error reason (e.g. map "503" to "the engine is down"). */
export type DescribeViewError = (
  reason: string | undefined,
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
  return (
    <div className="flex flex-col gap-4 px-4 py-4" aria-busy="true">
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

function ViewErrorState({
  reason,
  canRetry,
  labels,
  onRetry,
  describeError,
}: {
  reason: string | undefined
  canRetry: boolean
  labels: Required<McpAppViewLabels>
  onRetry: () => void
  describeError?: DescribeViewError
}) {
  const human = describeError?.(reason)
  return (
    <div className="px-4 py-4">
      <ErrorState
        title={human?.title ?? labels.errorTitle}
        description={human?.description ?? labels.errorHint}
        details={reason}
        detailsLabel={labels.errorDetails}
        retryLabel={labels.retry}
        onRetry={canRetry ? onRetry : undefined}
      />
    </div>
  )
}
