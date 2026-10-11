import type { DisplayText, RowDef } from "@miragon/mcp-toolkit-core"
import { WidgetPropsSheet } from "../widget-props-sheet.js"
import { displayLabel } from "./builder-model.js"
import { useDisplayResolver } from "./use-display-resolver.js"

// -------------------------------------------------------------------------- //
// Cell props sheet — mounts the WidgetPropsSheet for the configured cell
// -------------------------------------------------------------------------- //

/**
 * Mounted once at the LayoutBuilder root so that exactly one props editor
 * can be open at a time across the entire workspace — including across
 * tabs. `configuringCell` addresses `{ rowIdx, cellIdx }` on the currently
 * active draft surface (rows or active tab's rows); renders nothing when no
 * cell is being configured or the address no longer resolves. The sheet is
 * titled with the widget's name; closing it returns focus to the cell's
 * configure button (the kit's `SheetContent` hands it back to the element
 * that opened it, see `lib/focus-return.ts`).
 */
export function CellPropsSheet({
  configuringCell,
  activeRows,
  propsSchemaByWidgetId,
  displayByWidgetId,
  onApply,
  onClose,
}: {
  configuringCell: { rowIdx: number; cellIdx: number } | null
  activeRows: RowDef[]
  propsSchemaByWidgetId: Map<string, Record<string, unknown>>
  displayByWidgetId: Map<string, DisplayText>
  onApply: (rowIdx: number, cellIdx: number, next: Record<string, unknown> | undefined) => void
  onClose: () => void
}) {
  const { locale, resolveKey } = useDisplayResolver()
  if (!configuringCell) return null
  const cell = activeRows[configuringCell.rowIdx]?.row[configuringCell.cellIdx]
  if (!cell) return null
  const schema = propsSchemaByWidgetId.get(cell.widget)
  const name = displayLabel(
    displayByWidgetId.get(cell.widget) ?? {},
    cell.widget,
    locale,
    resolveKey,
  )
  return (
    <WidgetPropsSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      widgetId={cell.widget}
      widgetTitle={name.hint ? name.label : undefined}
      schema={schema}
      value={cell.props}
      onApply={(next) => {
        onApply(configuringCell.rowIdx, configuringCell.cellIdx, next)
        onClose()
      }}
    />
  )
}
