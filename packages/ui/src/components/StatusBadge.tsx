import { Badge } from "../primitives/badge.js"
import { cn } from "../lib/utils.js"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

export interface StatusBadgeEntry {
  label: string
  variant: BadgeVariant
  className?: string
}

export type StatusBadgeMap = Record<string, StatusBadgeEntry>

/**
 * A small default map for common workflow states. Consumers typically pass
 * their own `statusMap` with domain- and locale-specific labels.
 */
export const DEFAULT_STATUS_MAP: StatusBadgeMap = {
  paid: { label: "Paid", variant: "default" },
  open: { label: "Open", variant: "outline" },
  overdue: { label: "Overdue", variant: "destructive" },
  draft: { label: "Draft", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  IN_PROGRESS: { label: "In progress", variant: "outline" },
  COMPLETED: { label: "Completed", variant: "default" },
  PLANNED: { label: "Planned", variant: "secondary" },
  ON_HOLD: { label: "On hold", variant: "secondary" },
}

interface StatusBadgeProps {
  status: string
  className?: string
  statusMap?: StatusBadgeMap
}

export function StatusBadge({ status, className, statusMap }: StatusBadgeProps) {
  const map = statusMap ?? DEFAULT_STATUS_MAP
  const mapped = map[status] ?? { label: status, variant: "outline" as const }
  return (
    <Badge variant={mapped.variant} className={cn(mapped.className, className)}>
      {mapped.label}
    </Badge>
  )
}
