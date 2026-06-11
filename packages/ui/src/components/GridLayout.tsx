import * as React from "react"
import { cn } from "../lib/utils.js"

export interface GridLayoutProps {
  /** `GridItem` children to lay out across the 12 columns. */
  children: React.ReactNode
  /** Extra classes merged onto the grid container (e.g. to change the gap). */
  className?: string
}

/**
 * 12-column responsive grid container. Wrap `GridItem`s in it to compose
 * dashboard rows; this is the same grid `WidgetRenderer` uses internally.
 */
export function GridLayout({ children, className }: GridLayoutProps) {
  return <div className={cn("grid grid-cols-12 gap-4", className)}>{children}</div>
}

export interface GridItemProps {
  /** Column span from 1–12. Defaults to a full-width `12`. */
  span?: number
  /** Cell content. */
  children: React.ReactNode
  /** Extra classes merged onto the cell. */
  className?: string
}

const spanClasses: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
}

/**
 * A cell inside a `GridLayout`, spanning `span` of the 12 columns. Out-of-range
 * spans fall back to full width.
 */
export function GridItem({ span = 12, children, className }: GridItemProps) {
  return <div className={cn(spanClasses[span] ?? "col-span-12", className)}>{children}</div>
}
