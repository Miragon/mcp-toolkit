import { memo, useCallback, useRef } from "react"
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react"
import type { ReachableWidget, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { GridItem, GridLayout } from "../../components/GridLayout.js"
import { Badge } from "../../primitives/badge.js"
import { Button } from "../../primitives/button.js"
import { ScrollArea } from "../../primitives/scroll-area.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../primitives/select.js"
import { cn } from "../../lib/utils.js"
import { RenderedWidget, type WidgetComponent } from "../widget-renderer.js"
import type { LayoutBuilderLabels } from "./labels.js"
import { WIDGET_DRAG_MIME } from "./labels.js"

// -------------------------------------------------------------------------- //
// Workspace — palette + canvas (palette sticky on lg+)
// -------------------------------------------------------------------------- //

function WorkspaceImpl({
  L,
  paletteByApp,
  paletteCount,
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
  widgets,
  widgetProps,
  showAddTabButton,
  onAddTab,
}: {
  L: Required<LayoutBuilderLabels>
  paletteByApp: [string, ReachableWidget[]][]
  paletteCount: number
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
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
  showAddTabButton?: boolean
  onAddTab?: () => void
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 lg:col-span-3 xl:col-span-2">
        <div className="lg:sticky lg:top-16">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
            {L.paletteHeader}
            <Badge variant="outline" className="px-1.5 text-[10px]">
              {paletteCount}
            </Badge>
          </div>
          {paletteCount === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
              {L.paletteEmpty}
            </div>
          ) : (
            <ScrollArea className="lg:max-h-[70vh]">
              <div className="flex flex-col gap-3 pr-1">
                {paletteByApp.map(([app, ws]) => (
                  <div key={app} className="flex flex-col gap-1">
                    <div className="text-muted-foreground/80 text-[10px] font-semibold tracking-wide uppercase">
                      {app}
                    </div>
                    {ws.map((w) => (
                      <PaletteItem key={w.id} w={w} onClick={() => onAddWidget(w.id)} />
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {showAddTabButton && onAddTab && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onAddTab}
              className="text-muted-foreground hover:text-foreground mt-3"
            >
              <Plus /> {L.addTab}
            </Button>
          )}
        </div>
      </aside>

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
              widgets={widgets}
              widgetProps={widgetProps}
            />
          ))}
          <Button variant="outline" size="sm" onClick={onAddRow} className="self-start text-xs">
            <Plus /> {L.addRow}
          </Button>
        </div>
      </section>
    </div>
  )
}

export const Workspace = memo(WorkspaceImpl)

// -------------------------------------------------------------------------- //
// Palette item
// -------------------------------------------------------------------------- //

function PaletteItemImpl({ w, onClick }: { w: ReachableWidget; onClick: () => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(WIDGET_DRAG_MIME, w.id)
        e.dataTransfer.effectAllowed = "copy"
      }}
      onClick={onClick}
      className="hover:bg-accent hover:text-accent-foreground group bg-background/50 flex cursor-grab flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors active:cursor-grabbing"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate font-mono">{w.id}</span>
        <GripVertical className="text-muted-foreground/40 group-hover:text-muted-foreground size-3" />
      </span>
      {w.requires.length > 0 && (
        <span className="text-muted-foreground/80 truncate font-mono text-[10px]">
          ← {w.requires.join(", ")}
        </span>
      )}
    </button>
  )
}

const PaletteItem = memo(PaletteItemImpl)

// -------------------------------------------------------------------------- //
// Canvas row — drop target + per-cell controls + resize handle
// -------------------------------------------------------------------------- //

function CanvasRowImpl({
  L,
  row,
  rowIdx,
  focused,
  isFirst,
  isLast,
  dragOver,
  setDragOverRow,
  setFocusedRowIndex,
  onRemoveRow,
  onMoveRow,
  onSetCellSpan,
  onRemoveCell,
  onAddWidget,
  onConfigureCell,
  propsSchemaByWidgetId,
  widgets,
  widgetProps,
}: {
  L: Required<LayoutBuilderLabels>
  row: RowDef
  rowIdx: number
  focused: boolean
  isFirst: boolean
  isLast: boolean
  dragOver: boolean
  setDragOverRow: (idx: number | null) => void
  setFocusedRowIndex: (idx: number) => void
  onRemoveRow: (rowIdx: number) => void
  onMoveRow: (rowIdx: number, direction: -1 | 1) => void
  onSetCellSpan: (rowIdx: number, cellIdx: number, span: number) => void
  onRemoveCell: (rowIdx: number, cellIdx: number) => void
  onAddWidget: (widgetId: string, targetRowIdx?: number) => void
  onConfigureCell: (rowIdx: number, cellIdx: number) => void
  propsSchemaByWidgetId: Map<string, Record<string, unknown>>
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      onClick={() => setFocusedRowIndex(rowIdx)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(WIDGET_DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        setDragOverRow(rowIdx)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOverRow(null)
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(WIDGET_DRAG_MIME)
        setDragOverRow(null)
        if (id) {
          e.preventDefault()
          onAddWidget(id, rowIdx)
        }
      }}
      className={cn(
        "group relative rounded-lg border-l-2 px-3 py-2 transition-colors",
        focused
          ? "border-l-primary bg-card"
          : "bg-background hover:bg-card/60 border-l-transparent",
        dragOver && "bg-primary/5 border-l-primary",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
          <span className="font-mono">row {rowIdx + 1}</span>
          <span className="bg-muted/60 rounded px-1 py-0.5 text-[10px]">
            {row.row.length} {row.row.length === 1 ? "widget" : "widgets"}
          </span>
        </div>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onMoveRow(rowIdx, -1)
            }}
            disabled={isFirst}
            aria-label="Move row up"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onMoveRow(rowIdx, 1)
            }}
            disabled={isLast}
            aria-label="Move row down"
          >
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveRow(rowIdx)
            }}
            aria-label={L.removeRow}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {row.row.length === 0 ? (
        <div
          className={cn(
            "rounded-md border border-dashed py-6 text-center text-[11px] transition-colors",
            dragOver
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          {dragOver ? L.canvasDropHint : L.canvasEmpty}
        </div>
      ) : (
        <div ref={gridRef} data-row-grid>
          <GridLayout>
            {row.row.map((cell, cellIdx) => {
              const span = cell.span ?? 12
              const Widget = widgets[cell.widget]
              const hasPropsSchema = propsSchemaByWidgetId.has(cell.widget)
              const propCount = cell.props ? Object.keys(cell.props).length : 0
              return (
                <GridItem key={`${cell.widget}-${cellIdx}`} span={span}>
                  <div className="border-border bg-card relative overflow-hidden rounded-md border shadow-sm">
                    <div className="text-muted-foreground bg-muted/30 flex items-center justify-between gap-2 border-b px-2 py-1 text-[10px]">
                      <span className="truncate font-mono">{cell.widget}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="text-muted-foreground/80 inline-flex items-center gap-0.5 font-mono">
                          <span className="sr-only">Column span</span>
                          <Select
                            value={String(span)}
                            onValueChange={(v) => onSetCellSpan(rowIdx, cellIdx, Number(v))}
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-5 gap-0.5 border-none bg-transparent px-1 py-0 font-mono text-[10px] shadow-none focus:ring-0"
                              aria-label="Column span"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                <SelectItem key={n} value={String(n)} className="font-mono text-xs">
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span aria-hidden="true">/12</span>
                        </label>
                        {hasPropsSchema && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              onConfigureCell(rowIdx, cellIdx)
                            }}
                            aria-label="Configure widget props"
                            title={
                              propCount > 0
                                ? `Configure widget props (${propCount} set)`
                                : "Configure widget props"
                            }
                            className={cn(propCount > 0 && "text-primary")}
                          >
                            <SlidersHorizontal />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveCell(rowIdx, cellIdx)
                          }}
                          aria-label="Remove widget"
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                    <div className="p-2">
                      <RenderedWidget
                        widget={Widget}
                        widgetId={cell.widget}
                        props={widgetProps}
                        cellProps={cell.props}
                        showEmptyHint
                        notBundledClassName="text-muted-foreground rounded border border-dashed p-3 text-center text-[11px]"
                      />
                    </div>
                    <ResizeHandle
                      rowIdx={rowIdx}
                      cellIdx={cellIdx}
                      span={span}
                      getGridEl={() => gridRef.current}
                      onSetCellSpan={onSetCellSpan}
                    />
                  </div>
                </GridItem>
              )
            })}
          </GridLayout>
        </div>
      )}
    </div>
  )
}

const CanvasRow = memo(CanvasRowImpl)

// -------------------------------------------------------------------------- //
// Resize handle
// -------------------------------------------------------------------------- //

function ResizeHandle({
  rowIdx,
  cellIdx,
  span,
  getGridEl,
  onSetCellSpan,
}: {
  rowIdx: number
  cellIdx: number
  span: number
  getGridEl: () => HTMLElement | null
  onSetCellSpan: (rowIdx: number, cellIdx: number, span: number) => void
}) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const grid = getGridEl()
      if (!grid) return
      const rect = grid.getBoundingClientRect()
      const colWidth = rect.width / 12
      const startX = e.clientX
      const startSpan = span
      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX
        const next = Math.round(startSpan + delta / colWidth)
        onSetCellSpan(rowIdx, cellIdx, Math.max(1, Math.min(12, next)))
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [cellIdx, getGridEl, onSetCellSpan, rowIdx, span],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
      if (dir === 0) return
      e.preventDefault()
      e.stopPropagation()
      onSetCellSpan(rowIdx, cellIdx, Math.max(1, Math.min(12, span + dir)))
    },
    [cellIdx, onSetCellSpan, rowIdx, span],
  )

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      tabIndex={0}
      className="hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:ring-primary/60 absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none focus-visible:ring-1 focus-visible:outline-none"
      aria-label="Resize widget"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={span}
      aria-valuemin={1}
      aria-valuemax={12}
    />
  )
}
