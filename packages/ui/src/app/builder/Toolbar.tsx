import { memo } from "react"
import { Check, Eye, Layers, Library, Save } from "lucide-react"
import { Badge } from "../../primitives/badge.js"
import { Button } from "../../primitives/button.js"
import { cn } from "../../lib/utils.js"
import type { LayoutBuilderLabels, RefreshStatus } from "./labels.js"
import { StatusChip } from "./status-chip.js"

// -------------------------------------------------------------------------- //
// Toolbar — sticky top, dense status row + actions
// -------------------------------------------------------------------------- //

function ToolbarImpl({
  L,
  previewMode,
  isBusy,
  status,
  liveKeys,
  reachableCount,
  unreachableCount,
  onOpenCatalogue,
  onOpenSave,
  onDone,
  hasAnyCell,
}: {
  L: Required<LayoutBuilderLabels>
  previewMode: boolean
  isBusy: boolean
  status: RefreshStatus
  liveKeys: number
  reachableCount: number
  unreachableCount: number
  onOpenCatalogue: () => void
  onOpenSave: () => void
  onDone?: () => void
  hasAnyCell: boolean
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-b px-1 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md",
            previewMode ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary",
          )}
          aria-hidden="true"
        >
          {previewMode ? <Eye className="size-3.5" /> : <Layers className="size-3.5" />}
        </span>
        <h2 className="text-sm font-semibold tracking-tight">{L.title}</h2>
        <Badge variant={previewMode ? "outline" : "secondary"} className="font-normal">
          {previewMode ? L.previewBadge : L.builderBadge}
        </Badge>
      </div>

      <div className="text-muted-foreground hidden items-center gap-3 text-[11px] sm:flex">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>
            <span className="text-foreground font-medium">{liveKeys}</span> live
          </span>
        </span>
        <span className="bg-border h-3 w-px" aria-hidden="true" />
        <span>
          <span className="text-foreground font-medium">{reachableCount}</span> reachable
        </span>
        {unreachableCount > 0 && (
          <>
            <span className="bg-border h-3 w-px" aria-hidden="true" />
            <span>
              <span className="text-foreground font-medium">{unreachableCount}</span> unreachable
            </span>
          </>
        )}
        <StatusChip status={status} L={L} />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onOpenCatalogue}>
          <Library /> {L.catalogue}
        </Button>
        <Button size="sm" onClick={onOpenSave} disabled={isBusy || !hasAnyCell}>
          <Save /> {L.save}
        </Button>
        {onDone && (
          <Button variant="outline" size="sm" onClick={onDone}>
            <Check /> {L.done}
          </Button>
        )}
      </div>
    </header>
  )
}

export const Toolbar = memo(ToolbarImpl)
