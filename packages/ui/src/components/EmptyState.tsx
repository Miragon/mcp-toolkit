import type { ReactNode } from "react"
import { cn } from "../lib/utils.js"

/** Heading element for an empty/error state title (the surface decides the outline level). */
export type StateHeadingLevel = "h2" | "h3" | "h4" | "p"

export interface EmptyStateProps {
  /**
   * Icon or mark above the title, rendered decoratively (`aria-hidden`): a
   * Lucide icon for the concrete situation (e.g. `<CircleCheck />` for "all
   * done"), or a brand mark (an app passes its logo; a customer brand passes
   * its own or nothing).
   */
  icon?: ReactNode
  /** Colour of the icon slot: `"neutral"` (muted, default) or `"success"` ("all done"). */
  tone?: "neutral" | "success"
  /** What is empty, in plain words ("No open incidents"). */
  title: ReactNode
  /** One help line: why it is empty or what to do next. */
  description?: ReactNode
  /** The primary next step (a `Button`). */
  action?: ReactNode
  /** An optional second, quieter step. Empty states carry at most two actions. */
  secondaryAction?: ReactNode
  /** Element of the title. Default `"h3"` (inside a widget below its own heading). */
  titleAs?: StateHeadingLevel
  className?: string
}

const ICON_TONE: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  neutral: "text-muted-foreground",
  success: "text-(color:--success-ink)",
}

/**
 * The one empty-state pattern: icon or mark, a title (600), one help line and
 * up to two actions, centred in the space the content would take. Static (no
 * live region): it replaces content, it does not announce a change.
 */
export function EmptyState({
  icon,
  tone = "neutral",
  title,
  description,
  action,
  secondaryAction,
  titleAs: Title = "h3",
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-2 px-4 py-8 text-center", className)}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={cn("mb-1 flex items-center justify-center [&_svg]:size-6", ICON_TONE[tone])}
        >
          {icon}
        </div>
      )}
      <Title className="text-foreground text-base font-semibold">{title}</Title>
      {description && (
        <p className="text-muted-foreground max-w-prose text-sm text-balance">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
