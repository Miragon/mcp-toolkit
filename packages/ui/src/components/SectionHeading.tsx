import type { ReactNode } from "react"

export interface SectionHeadingProps {
  /** The section title. */
  title: ReactNode
  /** Optional muted hint shown on the right (e.g. a count or last-updated note). */
  hint?: ReactNode
  /** Right-aligned slot that overrides `hint` when set (e.g. a control). */
  trailing?: ReactNode
}

/**
 * Section title row — a small semibold heading with an optional muted hint or
 * control on the right. Use to label a block inside a widget body (e.g. a list
 * or sub-table) without the visual weight of a full card header.
 */
export function SectionHeading({ title, hint, trailing }: SectionHeadingProps) {
  return (
    <div className="text-muted-foreground mb-3 flex items-center justify-between text-sm font-semibold">
      <span>{title}</span>
      {(hint || trailing) && (
        <span className="text-muted-foreground text-xs font-medium">{trailing ?? hint}</span>
      )}
    </div>
  )
}
