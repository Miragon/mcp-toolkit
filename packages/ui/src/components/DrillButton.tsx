import type { ReactNode } from "react"

export interface DrillButtonProps {
  /** Button label. */
  children: ReactNode
  /** Drill/navigation handler — wire to in-widget navigation (e.g. `showWidget`). */
  onDrill: () => void
  /** Optional leading glyph (e.g. a domain icon). The trailing → is always rendered. */
  icon?: ReactNode
  /** `sm` for table rows, `md` for surface headers. Default `"sm"`. */
  size?: "sm" | "md"
  /** Accessible label when the visible text is terse. */
  ariaLabel?: string
}

/**
 * The single, deterministic in-widget navigation control: a neutral outline
 * button with a trailing → that drills into a detail/sub-view. Use it for
 * every in-app drill (row "Open", header nav) so they read identically and stay
 * visually quieter than primary/agentic actions. Decoupled from any host — pass
 * an `onDrill` callback (e.g. wrapping `useHostActions().showWidget`).
 */
export function DrillButton({ children, onDrill, icon, size = "sm", ariaLabel }: DrillButtonProps) {
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
  return (
    <button
      type="button"
      onClick={onDrill}
      aria-label={ariaLabel}
      className={`border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border font-medium transition-colors outline-none focus-visible:ring-2 ${pad}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
      <span aria-hidden="true">→</span>
    </button>
  )
}
