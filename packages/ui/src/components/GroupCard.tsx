import type { KeyboardEvent, MouseEvent, ReactNode } from "react"

export interface GroupCardProps {
  /** Whether the body is expanded. */
  expanded: boolean
  /** Toggle handler for the summary bar. */
  onToggle: () => void
  /** Always-visible summary bar (may contain its own buttons/links). */
  summary: ReactNode
  /** Collapsible body, rendered only when `expanded`. */
  children?: ReactNode
}

/**
 * Bordered card with a clickable summary bar and a collapsible body. Use to
 * group related rows behind an expandable header (e.g. items grouped by a key).
 *
 * The summary uses `role="button"` rather than a `<button>` element so it can
 * contain its own controls (drill buttons, links) without producing invalid
 * nested-interactive HTML; clicks landing on those controls do not toggle.
 */
export function GroupCard({ expanded, onToggle, summary, children }: GroupCardProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onToggle()
    }
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label")) return
    onToggle()
  }

  return (
    <div className="border-border mb-2 overflow-hidden rounded-lg border">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`bg-card hover:bg-muted focus-visible:ring-ring/50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 ${
          expanded ? "border-border border-b" : ""
        }`}
      >
        {summary}
      </div>
      {expanded && children && <div>{children}</div>}
    </div>
  )
}
