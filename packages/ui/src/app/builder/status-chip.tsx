import { CircleDot, Loader2 } from "lucide-react"
import type { LayoutBuilderLabels, RefreshStatus } from "./labels.js"

/**
 * Compact auto-apply status chip. Shared by the Toolbar and the
 * PipelineStrip so both surfaces show the same refresh state.
 */
export function StatusChip({
  status,
  L,
}: {
  status: RefreshStatus
  L: Required<LayoutBuilderLabels>
}) {
  if (status === "idle") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <CircleDot className="size-3" />
        {L.statusUpToDate}
      </span>
    )
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
        {L.statusPending}
      </span>
    )
  }
  return (
    <span className="text-primary inline-flex items-center gap-1.5">
      <Loader2 className="size-3 animate-spin" />
      {L.statusRefreshing}
    </span>
  )
}
