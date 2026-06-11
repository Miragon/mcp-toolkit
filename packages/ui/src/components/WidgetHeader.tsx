import type { ReactNode } from "react"
import { TONE_SOFT, type ToneVariant } from "../lib/tone-utils.js"

export interface WidgetHeaderProps {
  /** Optional icon/glyph rendered in a tinted tile above the title. */
  icon?: ReactNode
  /** Tone for the icon tile. Default `"neutral"`. */
  iconTone?: ToneVariant
  /** The widget title. */
  title: ReactNode
  /** Subtitle/meta row under the title (e.g. a live pill + counts). */
  sub?: ReactNode
  /** Right-aligned actions slot (buttons, drill controls). */
  actions?: ReactNode
}

/**
 * Page-level header for the top of a dashboard widget: an optional tinted icon
 * tile, a large title, a subtitle/meta row, and a right-aligned actions slot.
 * Use once per widget surface to anchor it.
 */
export function WidgetHeader({
  icon,
  iconTone = "neutral",
  title,
  sub,
  actions,
}: WidgetHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {icon && (
          <div
            className={`mb-3.5 grid size-11 place-items-center rounded-xl text-xl ${TONE_SOFT[iconTone]}`}
          >
            {icon}
          </div>
        )}
        <h1 className="text-foreground mb-1.5 text-3xl leading-tight font-bold tracking-tight">
          {title}
        </h1>
        {sub && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            {sub}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
