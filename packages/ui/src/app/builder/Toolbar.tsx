import { memo } from "react"
import { Check, Eye, Layers, Library, LucideProvider, Save, Undo2, Wrench } from "lucide-react"
import { DENSE_ICON_STROKE } from "../../lib/icon-stroke.js"
import { FOCUS_RING } from "../../lib/focus-ring.js"
import { Badge } from "../../primitives/badge.js"
import { Button } from "../../primitives/button.js"
import { TONE_DOT, TONE_SOFT } from "../../lib/tone-utils.js"
import { cn } from "../../lib/utils.js"
import type { LayoutBuilderLabels, RefreshStatus } from "./labels.js"
import { StatusChip } from "./status-chip.js"

// -------------------------------------------------------------------------- //
// Toolbar — sticky top: title + unsaved marker, then the actions
// -------------------------------------------------------------------------- //

export interface ToolbarProps {
  L: Required<LayoutBuilderLabels>
  previewMode: boolean
  isBusy: boolean
  status: RefreshStatus
  liveKeys: number
  reachableCount: number
  unreachableCount: number
  /** Advanced mode: shows the stats and the catalogue (the data sources tab lives below). */
  advanced: boolean
  onToggleAdvanced: () => void
  /** The draft has changes Discard would lose (the marker next to the title). */
  unsaved: boolean
  onOpenCatalogue: () => void
  onOpenSave: () => void
  /** Leaves the builder without the edits (or resets the draft in place). */
  onDiscard: () => void
  /** Shows the draft in the view and leaves the builder; absent when there is no view to apply to. */
  onApply?: () => void
  hasAnyCell: boolean
}

/** The live-context stats and the refresh state: data-source vocabulary, so advanced mode only. */
function Stats({
  L,
  status,
  liveKeys,
  reachableCount,
  unreachableCount,
}: Pick<ToolbarProps, "L" | "status" | "liveKeys" | "reachableCount" | "unreachableCount">) {
  return (
    <div className="text-muted-foreground hidden items-center gap-3 text-xs sm:flex">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${TONE_DOT.success}`} />
        <span>
          <span className="text-foreground font-medium">{liveKeys}</span> {L.statsLive}
        </span>
      </span>
      <span className="bg-border h-3 w-px" aria-hidden="true" />
      <span>
        <span className="text-foreground font-medium">{reachableCount}</span> {L.statsReachable}
      </span>
      {unreachableCount > 0 && (
        <>
          <span className="bg-border h-3 w-px" aria-hidden="true" />
          <span>
            <span className="text-foreground font-medium">{unreachableCount}</span>{" "}
            {L.statsUnreachable}
          </span>
        </>
      )}
      <StatusChip status={status} L={L} />
    </div>
  )
}

/**
 * The unsaved marker. The live region is always mounted (only its content
 * changes), so a screen reader hears the marker appear and go.
 */
function UnsavedMarker({ L, unsaved }: { L: Required<LayoutBuilderLabels>; unsaved: boolean }) {
  return (
    <span
      role="status"
      data-slot="builder-unsaved"
      className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
    >
      {unsaved && (
        <>
          <span aria-hidden="true" className={`size-2 rounded-full ${TONE_DOT.warning}`} />
          {L.unsavedChanges}
        </>
      )}
    </span>
  )
}

function ToolbarImpl({
  L,
  previewMode,
  isBusy,
  status,
  liveKeys,
  reachableCount,
  unreachableCount,
  advanced,
  onToggleAdvanced,
  unsaved,
  onOpenCatalogue,
  onOpenSave,
  onDiscard,
  onApply,
  hasAnyCell,
}: ToolbarProps) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-1 py-2 backdrop-blur">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md",
            previewMode ? TONE_SOFT.success : TONE_SOFT.info,
          )}
          aria-hidden="true"
        >
          {previewMode ? <Eye className="size-3.5" /> : <Layers className="size-3.5" />}
        </span>
        {/* The focus target when build mode opens (McpAppView moves focus here). */}
        <h2
          data-slot="builder-title"
          tabIndex={-1}
          className={cn("rounded-sm text-sm font-semibold tracking-tight", FOCUS_RING)}
        >
          {L.title}
        </h2>
        <Badge variant={previewMode ? "outline" : "secondary"} className="font-normal">
          {previewMode ? L.previewBadge : L.builderBadge}
        </Badge>
        <UnsavedMarker L={L} unsaved={unsaved} />
      </div>

      {advanced && (
        <Stats
          L={L}
          status={status}
          liveKeys={liveKeys}
          reachableCount={reachableCount}
          unreachableCount={unreachableCount}
        />
      )}

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={advanced}
          title={L.advancedHint}
          onClick={onToggleAdvanced}
          className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
        >
          <Wrench aria-hidden="true" /> {L.advanced}
        </Button>
        {advanced && (
          <Button variant="ghost" size="sm" onClick={onOpenCatalogue}>
            <Library aria-hidden="true" /> {L.catalogue}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          title={L.saveHint}
          onClick={onOpenSave}
          disabled={isBusy || !hasAnyCell}
        >
          <Save aria-hidden="true" /> {L.save}
        </Button>
        <Button variant="ghost" size="sm" title={L.discardHint} onClick={onDiscard}>
          <Undo2 aria-hidden="true" /> {L.discard}
        </Button>
        {onApply && (
          <Button size="sm" title={L.applyHint} onClick={onApply}>
            <Check aria-hidden="true" /> {L.apply}
          </Button>
        )}
      </div>
    </header>
  )
}

/** A dense chrome bar: its Lucide icons draw at stroke 2 (CI §11), not the view's 2.5. */
function DenseToolbar(props: ToolbarProps) {
  return (
    <LucideProvider strokeWidth={DENSE_ICON_STROKE}>
      <ToolbarImpl {...props} />
    </LucideProvider>
  )
}

export const Toolbar = memo(DenseToolbar)
