export interface RowDef {
  row: { widget: string; span?: number; props?: Record<string, unknown> }[]
}

export type LayoutConfig =
  | RowDef[] // Legacy: flat array of rows
  | { rows: RowDef[] } // Explicit rows
  | { tabs: { label: string; rows: RowDef[] }[] } // Tabs

/** Normalizes any layout format to the canonical union type (rows or tabs object). */
export function normalizeLayout(
  layout: LayoutConfig,
): { rows: RowDef[] } | { tabs: { label: string; rows: RowDef[] }[] } {
  if (Array.isArray(layout)) return { rows: layout }
  return layout
}
