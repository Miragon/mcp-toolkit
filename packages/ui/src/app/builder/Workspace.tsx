import { memo } from "react"
import { GripVertical, Plus } from "lucide-react"
import type { ReachableWidget, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { Badge } from "../../primitives/badge.js"
import { Button } from "../../primitives/button.js"
import { ScrollArea } from "../../primitives/scroll-area.js"
import type { WidgetComponent } from "../widget-renderer.js"
import type { LayoutBuilderLabels } from "./labels.js"
import { WIDGET_DRAG_MIME } from "./labels.js"
import { CanvasRow } from "./CanvasRow.js"

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
}

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
}: WorkspaceProps) {
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
