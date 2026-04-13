import * as React from "react"
import { cn } from "../lib/utils.js"

interface GridLayoutProps {
  children: React.ReactNode
  className?: string
}

export function GridLayout({ children, className }: GridLayoutProps) {
  return <div className={cn("grid grid-cols-12 gap-4", className)}>{children}</div>
}

interface GridItemProps {
  span?: number
  children: React.ReactNode
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

export function GridItem({ span = 12, children, className }: GridItemProps) {
  return <div className={cn(spanClasses[span] ?? "col-span-12", className)}>{children}</div>
}
