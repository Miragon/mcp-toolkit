import { AlertTriangle } from "lucide-react"
import { ErrorState } from "../../components/ErrorState.js"
import { TONE_ICON } from "../../lib/tone-utils.js"
import type { LayoutBuilderLabels } from "./labels.js"

// -------------------------------------------------------------------------- //
// Builder banners — catalogue-fetch failure + pipeline validation warning
// -------------------------------------------------------------------------- //

/**
 * Inline feedback strip under the toolbar. Surfaces two things the builder
 * previously swallowed:
 *   - a `get-builder-catalogue` fetch failure (Finding [3]) — only console-
 *     logged before, so the user couldn't tell the palette was stale. It is
 *     the kit's inline `ErrorState`: what happened, what to do, a retry, and
 *     the tool name with the raw reason under "Details" (never in the
 *     sentence the user reads), and
 *   - pipeline validation issues (Finding [10]/[6]) the catalogue reports
 *     fail-soft but `render-view` would reject fail-hard.
 *
 * Renders nothing when there's no error and no issues, so the happy path is
 * visually unchanged.
 */
export function BuilderBanners({
  L,
  catalogueToolName,
  refreshError,
  validationIssues,
  onRetry,
}: {
  L: Required<LayoutBuilderLabels>
  catalogueToolName: string
  refreshError: string | null
  validationIssues: string[]
  /** Fetches the catalogue again; the error state offers it as its retry. */
  onRetry?: () => void
}) {
  if (!refreshError && validationIssues.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {refreshError && (
        <ErrorState
          variant="inline"
          title={L.catalogueError}
          description={L.catalogueErrorHint}
          details={`${catalogueToolName}: ${refreshError}`}
          onRetry={onRetry}
        />
      )}
      {validationIssues.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="border-warning bg-warning-soft text-foreground text-small flex items-start gap-2 rounded-md border px-3 py-2"
        >
          <AlertTriangle
            className={`mt-0.5 size-3.5 shrink-0 ${TONE_ICON.warning}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-medium">{L.validationWarning}</p>
            <ul className="mt-0.5 list-inside list-disc space-y-0.5">
              {validationIssues.map((issue, idx) => (
                <li key={idx} className="break-words">
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
