import { AlertTriangle } from "lucide-react"
import type { LayoutBuilderLabels } from "./labels.js"

// -------------------------------------------------------------------------- //
// Builder banners — catalogue-fetch failure + pipeline validation warning
// -------------------------------------------------------------------------- //

/**
 * Inline feedback strip under the toolbar. Surfaces two things the builder
 * previously swallowed:
 *   - a `get-builder-catalogue` fetch failure (Finding [3]) — only console-
 *     logged before, so the user couldn't tell the palette was stale, and
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
}: {
  L: Required<LayoutBuilderLabels>
  catalogueToolName: string
  refreshError: string | null
  validationIssues: string[]
}) {
  if (!refreshError && validationIssues.length === 0) return null
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {refreshError && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{L.catalogueError}</p>
            <p className="text-destructive/80 mt-0.5 break-words">
              <span className="font-mono">{catalogueToolName}</span>: {refreshError}
            </p>
          </div>
        </div>
      )}
      {validationIssues.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
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
