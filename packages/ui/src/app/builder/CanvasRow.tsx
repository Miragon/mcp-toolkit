import { memo, useCallback, useRef } from "react"
import { ChevronDown, ChevronUp, SlidersHorizontal, Trash2, X } from "lucide-react"
import type { DisplayText, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { GridItem, GridLayout } from "../../components/GridLayout.js"
import { Button } from "../../primitives/button.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../primitives/select.js"
import { FOCUS_RING, FOCUS_RING_INSET } from "../../lib/focus-ring.js"
import { cn } from "../../lib/utils.js"
import { RenderedWidget, type WidgetComponent } from "../widget-renderer.js"
import { displayLabel } from "./builder-model.js"
import type { LayoutBuilderLabels } from "./labels.js"
import { WIDGET_DRAG_MIME } from "./labels.js"
import { REVEAL_ON_INTENT } from "./reveal.js"
import { useDisplayResolver } from "./use-display-resolver.js"

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
  displayByWidgetId,
  advanced,
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
  displayByWidgetId: Map<string, DisplayText>
  advanced: boolean
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const { locale, resolveKey } = useDisplayResolver()
  // The target row follows the pointer AND the keyboard: focus moving into a
  // row (its actions, a cell control) makes it the row the palette adds to.
  const target = () => {
    if (!focused) setFocusedRowIndex(rowIdx)
  }

  return (
    <div
      data-slot="builder-row"
      data-target={focused ? "" : undefined}
      onClick={target}
      onFocus={target}
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
        "group relative rounded-md border-l-2 px-3 py-2 transition-colors",
        focused
          ? "border-l-primary bg-card"
          : "bg-background hover:bg-card/60 border-l-transparent",
        dragOver && "bg-primary/5 border-l-primary",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground text-small flex flex-wrap items-center gap-2">
          <span className="font-medium">{L.rowLabel(rowIdx + 1)}</span>
          <span className="bg-muted rounded px-1.5 py-0.5">{L.elementCount(row.row.length)}</span>
          {focused && (
            <span className="text-foreground inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
              {L.rowTarget}
            </span>
          )}
        </div>
        <div
          data-slot="builder-row-actions"
          className={cn("flex items-center", focused ? "opacity-100" : REVEAL_ON_INTENT)}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onMoveRow(rowIdx, -1)
            }}
            disabled={isFirst}
            aria-label={L.moveRowUp}
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
            aria-label={L.moveRowDown}
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
            "text-small rounded-md border border-dashed py-6 text-center transition-colors",
            dragOver
              ? "border-focus bg-accent text-accent-foreground"
              : "border-input text-muted-foreground",
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
              const name = displayLabel(
                displayByWidgetId.get(cell.widget) ?? {},
                cell.widget,
                locale,
                resolveKey,
              )
              return (
                <GridItem key={`${cell.widget}-${cellIdx}`} span={span}>
                  <div className="border-border bg-card shadow-1 relative overflow-hidden rounded-md border">
                    <div className="text-muted-foreground bg-muted/30 text-small flex items-center justify-between gap-2 border-b px-2 py-1">
                      <span className="flex min-w-0 items-baseline gap-2" title={name.hint}>
                        <span className="text-foreground truncate font-medium">{name.label}</span>
                        {advanced && name.hint && (
                          <span className="truncate font-mono">{name.hint}</span>
                        )}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="text-muted-foreground inline-flex items-center gap-0.5 tabular-nums">
                          <span className="sr-only">{L.columnSpan}</span>
                          <Select
                            value={String(span)}
                            onValueChange={(v) => onSetCellSpan(rowIdx, cellIdx, Number(v))}
                          >
                            <SelectTrigger
                              size="sm"
                              className={cn(
                                "text-small h-6 gap-0.5 border-none bg-transparent px-1 py-0 tabular-nums shadow-none",
                                // Borderless, so the input focus edge is gone: the kit ring instead.
                                FOCUS_RING,
                              )}
                              aria-label={L.columnSpan}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                <SelectItem
                                  key={n}
                                  value={String(n)}
                                  className="text-small tabular-nums"
                                >
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
                            aria-label={L.configureElement}
                            title={
                              propCount > 0 ? L.configureElementSet(propCount) : L.configureElement
                            }
                            className={cn(propCount > 0 && "text-link")}
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
                          aria-label={L.removeElement}
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
                        notBundledClassName="text-muted-foreground rounded border border-dashed p-3 text-center text-small"
                      />
                    </div>
                    <ResizeHandle
                      label={L.resizeElement}
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

export const CanvasRow = memo(CanvasRowImpl)

// -------------------------------------------------------------------------- //
// Resize handle
// -------------------------------------------------------------------------- //

function ResizeHandle({
  label,
  rowIdx,
  cellIdx,
  span,
  getGridEl,
  onSetCellSpan,
}: {
  label: string
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
      className={cn(
        "hover:bg-primary/40 focus-visible:bg-primary/40 absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
        FOCUS_RING_INSET,
      )}
      aria-label={label}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={span}
      aria-valuemin={1}
      aria-valuemax={12}
    />
  )
}
