import { memo, useId } from "react"
import { GripVertical, Plus, SlidersHorizontal } from "lucide-react"
import type { DisplayText, ReachableWidget, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { FOCUS_RING } from "../../lib/focus-ring.js"
import { cn } from "../../lib/utils.js"
import { Badge } from "../../primitives/badge.js"
import { Button } from "../../primitives/button.js"
import { Skeleton } from "../../primitives/skeleton.js"
import type { WidgetComponent } from "../widget-renderer.js"
import { displayLabel } from "./builder-model.js"
import type { LayoutBuilderLabels } from "./labels.js"
import { WIDGET_DRAG_MIME } from "./labels.js"
import { CanvasRow } from "./CanvasRow.js"
import { useDisplayResolver } from "./use-display-resolver.js"

// -------------------------------------------------------------------------- //
// Workspace — palette + canvas (palette sticky on lg+)
// -------------------------------------------------------------------------- //

/**
 * Props for the workspace surface. Exported so the LayoutSurface container
 * can pass the shared prop bag through to `<Workspace {...workspace} />`
 * without re-declaring the contract.
 */
export interface WorkspaceProps {
  L: Required<LayoutBuilderLabels>
  paletteByApp: [string, ReachableWidget[]][]
  /** Each app's title (or its key) by app name: the palette's group headings. */
  appDisplayByName: Map<string, DisplayText>
  paletteCount: number
  /** The first catalogue answer is still on its way: the palette shows a loading state. */
  paletteLoading: boolean
  /** The empty palette's next step: show the data sources (it turns on advanced mode). */
  onOpenDataSources: () => void
  activeRows: RowDef[]
  focusedRowIndex: number
  setFocusedRowIndex: (idx: number) => void
  dragOverRow: number | null
  setDragOverRow: (idx: number | null) => void
  onAddRow: () => void
  onRemoveRow: (rowIdx: number) => void
  onMoveRow: (rowIdx: number, direction: -1 | 1) => void
  onSetCellSpan: (rowIdx: number, cellIdx: number, span: number) => void
  onRemoveCell: (rowIdx: number, cellIdx: number) => void
  onAddWidget: (widgetId: string, targetRowIdx?: number) => void
  onConfigureCell: (rowIdx: number, cellIdx: number) => void
  propsSchemaByWidgetId: Map<string, Record<string, unknown>>
  /** Title, summary (or their keys) per widget id: the canvas cells' names. */
  displayByWidgetId: Map<string, DisplayText>
  /** Advanced mode adds the technical lines (a widget's required keys, cell ids). */
  advanced: boolean
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
  /** Offered next to "Add row" while the draft has no tabs yet. */
  onAddTab?: () => void
}

function WorkspaceImpl({
  L,
  paletteByApp,
  appDisplayByName,
  paletteCount,
  paletteLoading,
  onOpenDataSources,
  activeRows,
  focusedRowIndex,
  setFocusedRowIndex,
  dragOverRow,
  setDragOverRow,
  onAddRow,
  onRemoveRow,
  onMoveRow,
  onSetCellSpan,
  onRemoveCell,
  onAddWidget,
  onConfigureCell,
  propsSchemaByWidgetId,
  displayByWidgetId,
  advanced,
  widgets,
  widgetProps,
  onAddTab,
}: WorkspaceProps) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <Palette
        L={L}
        paletteByApp={paletteByApp}
        appDisplayByName={appDisplayByName}
        paletteCount={paletteCount}
        loading={paletteLoading}
        advanced={advanced}
        onAddWidget={onAddWidget}
        onOpenDataSources={onOpenDataSources}
      />

      <section className="col-span-12 lg:col-span-9 xl:col-span-10">
        <div className="flex flex-col gap-3">
          {activeRows.map((row, rowIdx) => (
            <CanvasRow
              key={rowIdx}
              L={L}
              row={row}
              rowIdx={rowIdx}
              focused={rowIdx === focusedRowIndex}
              isFirst={rowIdx === 0}
              isLast={rowIdx === activeRows.length - 1}
              dragOver={dragOverRow === rowIdx}
              setDragOverRow={setDragOverRow}
              setFocusedRowIndex={setFocusedRowIndex}
              onRemoveRow={onRemoveRow}
              onMoveRow={onMoveRow}
              onSetCellSpan={onSetCellSpan}
              onRemoveCell={onRemoveCell}
              onAddWidget={onAddWidget}
              onConfigureCell={onConfigureCell}
              propsSchemaByWidgetId={propsSchemaByWidgetId}
              displayByWidgetId={displayByWidgetId}
              advanced={advanced}
              widgets={widgets}
              widgetProps={widgetProps}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onAddRow}>
              <Plus aria-hidden="true" /> {L.addRow}
            </Button>
            {onAddTab && (
              <Button variant="ghost" size="sm" onClick={onAddTab}>
                <Plus aria-hidden="true" /> {L.addTab}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export const Workspace = memo(WorkspaceImpl)

// -------------------------------------------------------------------------- //
// Palette — the elements to add, grouped by app (sticky on lg+)
// -------------------------------------------------------------------------- //

function Palette({
  L,
  paletteByApp,
  appDisplayByName,
  paletteCount,
  loading,
  advanced,
  onAddWidget,
  onOpenDataSources,
}: Pick<WorkspaceProps, "L" | "paletteByApp" | "appDisplayByName" | "paletteCount" | "advanced"> & {
  loading: boolean
  onAddWidget: (widgetId: string) => void
  onOpenDataSources: () => void
}) {
  const headingId = useId()
  return (
    <aside aria-labelledby={headingId} className="col-span-12 lg:col-span-3 xl:col-span-2">
      <div className="lg:sticky lg:top-16">
        <h3
          id={headingId}
          className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold"
        >
          {L.paletteHeader}
          {/* No count while loading: "0" would say there are none. */}
          {!loading && (
            <Badge variant="outline" className="px-1.5 text-xs">
              {paletteCount}
            </Badge>
          )}
        </h3>
        {loading ? (
          <PaletteLoading L={L} />
        ) : paletteCount === 0 ? (
          <PaletteEmpty L={L} onOpenDataSources={onOpenDataSources} />
        ) : (
          // A native scroll box: its height is its own, so nothing after the
          // palette can be painted over by the list (the old ScrollArea let
          // the list overflow its max height).
          <div className="flex flex-col gap-3 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
            {paletteByApp.map(([app, ws]) => (
              <div key={app} className="flex flex-col gap-1">
                <PaletteGroupHeading
                  app={app}
                  display={appDisplayByName.get(app)}
                  advanced={advanced}
                />
                <ul className="flex flex-col gap-1">
                  {ws.map((w) => (
                    <li key={w.id}>
                      <PaletteItem
                        L={L}
                        w={w}
                        advanced={advanced}
                        onClick={() => onAddWidget(w.id)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

/** The palette while the first catalogue answer is on its way (CI §9: a skeleton, not "none"). */
function PaletteLoading({ L }: { L: Required<LayoutBuilderLabels> }) {
  return (
    <div data-slot="builder-palette-loading" className="flex flex-col gap-1">
      <Skeleton aria-hidden="true" className="h-9 w-full" />
      <Skeleton aria-hidden="true" className="h-9 w-full" />
      <Skeleton aria-hidden="true" className="h-9 w-3/4" />
      <p role="status" className="text-muted-foreground mt-1 text-xs">
        {L.paletteLoading}
      </p>
    </div>
  )
}

/**
 * The palette without any element. It speaks no data-source words (they sit
 * behind Advanced); its one next step opens the data sources, also when the
 * layout already has cells and the builder's empty state is not shown.
 * Exported for its tests only.
 */
export function PaletteEmpty({
  L,
  onOpenDataSources,
}: {
  L: Required<LayoutBuilderLabels>
  onOpenDataSources: () => void
}) {
  return (
    <div
      data-slot="builder-palette-empty"
      className="text-muted-foreground flex flex-col items-start gap-2 rounded-md border border-dashed p-3 text-xs"
    >
      <p>{L.paletteEmpty}</p>
      <Button size="sm" variant="outline" onClick={onOpenDataSources}>
        <SlidersHorizontal aria-hidden="true" /> {L.openDataSources}
      </Button>
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Palette group heading
// -------------------------------------------------------------------------- //

/**
 * The heading of one app's group in the palette: the app's title. Without a
 * title the app's name is a technical namespace, so it heads the group only in
 * advanced mode; there it also follows a title as a quiet mono hint.
 */
function PaletteGroupHeading({
  app,
  display,
  advanced,
}: {
  app: string
  display: DisplayText | undefined
  advanced: boolean
}) {
  const { locale, resolveKey } = useDisplayResolver()
  const { label, hint } = displayLabel(display ?? {}, app, locale, resolveKey)
  if (hint === undefined && !advanced) return null
  return (
    <div data-slot="builder-palette-group" className="text-muted-foreground text-xs font-semibold">
      {label}
      {advanced && hint && <span className="ml-1.5 font-mono font-normal">{hint}</span>}
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Palette item
// -------------------------------------------------------------------------- //

/**
 * One widget in the palette: its title and one-line summary, the widget id as
 * a quiet mono line (only next to a real title), and in advanced mode the keys
 * it needs. A click (or Enter) adds it to the target row; dragging drops it
 * on any row.
 */
function PaletteItemImpl({
  L,
  w,
  advanced,
  onClick,
}: {
  L: Required<LayoutBuilderLabels>
  w: ReachableWidget
  advanced: boolean
  onClick: () => void
}) {
  const { locale, resolveKey } = useDisplayResolver()
  const { label, hint, summary } = displayLabel(w, w.id, locale, resolveKey)
  // On the hovered --accent surface quiet text takes the surface's
  // foreground: --muted-foreground drops to 3.66:1 there in dark.
  const quiet = "text-muted-foreground group-hover:text-accent-foreground block w-full truncate"
  return (
    <button
      type="button"
      draggable
      data-slot="builder-palette-item"
      onDragStart={(e) => {
        e.dataTransfer.setData(WIDGET_DRAG_MIME, w.id)
        e.dataTransfer.effectAllowed = "copy"
      }}
      onClick={onClick}
      className={cn(
        "hover:bg-accent hover:text-accent-foreground group bg-background flex w-full cursor-grab flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors active:cursor-grabbing",
        FOCUS_RING,
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <GripVertical
          aria-hidden="true"
          className="text-muted-foreground group-hover:text-accent-foreground size-3.5 shrink-0"
        />
      </span>
      {summary && <span className={cn(quiet, "text-xs")}>{summary}</span>}
      {hint && <span className={cn(quiet, "font-mono text-xs")}>{hint}</span>}
      {advanced && w.requires.length > 0 && (
        <span className={cn(quiet, "text-xs")}>
          {L.catalogueNeedsKeys} <span className="font-mono">{w.requires.join(", ")}</span>
        </span>
      )}
    </button>
  )
}

const PaletteItem = memo(PaletteItemImpl)
