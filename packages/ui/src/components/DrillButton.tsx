import type { ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { FOCUS_RING } from "../lib/focus-ring.js"
import { cn } from "../lib/utils.js"

export interface DrillButtonProps {
  /** Button label. */
  children: ReactNode
  /** Drill/navigation handler — wire to in-widget navigation (e.g. `showWidget`). */
  onDrill: () => void
  /**
   * Optional leading icon — a Lucide icon of the domain, never a typed glyph.
   * Decorative (`aria-hidden`). The trailing arrow is always rendered.
   */
  icon?: ReactNode
  /** `sm` for table rows, `md` for surface headers. Default `"sm"`. */
  size?: "sm" | "md"
  /** Accessible label when the visible text is terse; keep the visible text in it (WCAG 2.5.3). */
  ariaLabel?: string
}

/**
 * The single, deterministic in-widget navigation control: a neutral outline
 * button with a trailing Lucide arrow that drills into a detail/sub-view. Use
 * it for every in-app drill (row "Open", header nav) so they read identically
 * and stay visually quieter than primary/agentic actions. Decoupled from any
 * host — pass an `onDrill` callback (e.g. wrapping `useHostActions().showWidget`).
 */
export function DrillButton({ children, onDrill, icon, size = "sm", ariaLabel }: DrillButtonProps) {
  const pad = size === "md" ? "px-3 py-1.5 text-dense" : "px-2.5 py-1 text-small"
  return (
    <button
      type="button"
      onClick={onDrill}
      aria-label={ariaLabel}
      className={cn(
        "border-border text-foreground hover:border-focus hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1 rounded-md border font-medium transition-colors [&_svg:not([class*='size-'])]:size-4",
        FOCUS_RING,
        pad,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      )}
      {children}
      <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
    </button>
  )
}
