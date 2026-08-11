import type { RowDef } from "@miragon/mcp-toolkit-core"
import { WidgetPropsSheet } from "../widget-props-sheet.js"

// -------------------------------------------------------------------------- //
// Cell props sheet — mounts the WidgetPropsSheet for the configured cell
// -------------------------------------------------------------------------- //

/**
 * Mounted once at the LayoutBuilder root so that exactly one props editor
 * can be open at a time across the entire workspace — including across
 * tabs. `configuringCell` addresses `{ rowIdx, cellIdx }` on the currently
 * active draft surface (rows or active tab's rows); renders nothing when no
 * cell is being configured or the address no longer resolves.
 */
export function CellPropsSheet({
  configuringCell,
  activeRows,
  propsSchemaByWidgetId,
  onApply,
  onClose,
}: {
  configuringCell: { rowIdx: number; cellIdx: number } | null
  activeRows: RowDef[]
  propsSchemaByWidgetId: Map<string, Record<string, unknown>>
  onApply: (rowIdx: number, cellIdx: number, next: Record<string, unknown> | undefined) => void
  onClose: () => void
}) {
  if (!configuringCell) return null
  const cell = activeRows[configuringCell.rowIdx]?.row[configuringCell.cellIdx]
  if (!cell) return null
  const schema = propsSchemaByWidgetId.get(cell.widget)
  return (
    <WidgetPropsSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      widgetId={cell.widget}
      schema={schema}
      value={cell.props}
      onApply={(next) => {
        onApply(configuringCell.rowIdx, configuringCell.cellIdx, next)
        onClose()
      }}
    />
  )
}
