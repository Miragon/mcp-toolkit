/**
 * Pure reducer for the LayoutBuilder draft state.
 *
 * Replaces the `setDraft((prev) => …)` closures that previously lived in
 * `layout-builder.tsx`, plus the `setState`-inside-an-updater anti-pattern
 * those closures used to keep `activeTabIndex` / `focusedRowIndex` in sync
 * with structural draft changes. Those index updates are now part of each
 * action's pure result, so the whole thing is testable without React.
 */
import type { RowDef } from "@miragon/mcp-toolkit-core"
import { emptyRows, type DraftLayout, type DraftTab } from "./builder-model.js"

// -------------------------------------------------------------------------- //
// State
// -------------------------------------------------------------------------- //

/**
 * The draft plus the UI indices that are coupled to draft mutations.
 * `editingTabIdx` is the inline-rename target; it is cleared whenever a
 * structural tab change could invalidate it.
 */
export interface BuilderDraftState {
  draft: DraftLayout
  activeTabIndex: number
  focusedRowIndex: number
  editingTabIdx: number | null
  /**
   * Monotonic counter bumped whenever a `renameTab` action is rejected
   * (duplicate label). The UI watches it to surface feedback; a counter
   * rather than a boolean so two consecutive identical rejections still
   * register as a change.
   */
  renameRejectedAt: number
}

export function initBuilderState(draft: DraftLayout): BuilderDraftState {
  return {
    draft,
    activeTabIndex: 0,
    focusedRowIndex: 0,
    editingTabIdx: null,
    renameRejectedAt: 0,
  }
}

// -------------------------------------------------------------------------- //
// Actions
// -------------------------------------------------------------------------- //

export type BuilderAction =
  | { type: "addWidgetToRow"; widgetId: string; defaultSpan: number; targetRowIdx?: number }
  | { type: "addRow" }
  | { type: "removeRow"; rowIdx: number }
  | { type: "moveRow"; rowIdx: number; direction: -1 | 1 }
  | { type: "setCellSpan"; rowIdx: number; cellIdx: number; span: number }
  | { type: "removeCell"; rowIdx: number; cellIdx: number }
  | {
      type: "setCellProps"
      rowIdx: number
      cellIdx: number
      next: Record<string, unknown> | undefined
    }
  | { type: "setFocusedRow"; rowIdx: number }
  | { type: "selectTab"; tabIdx: number }
  | { type: "startEditingTab"; tabIdx: number }
  | { type: "stopEditingTab" }
  | { type: "addTab" }
  | { type: "renameTab"; tabIdx: number; label: string }
  | { type: "removeTab"; tabIdx: number }

// -------------------------------------------------------------------------- //
// Helpers
// -------------------------------------------------------------------------- //

/** The rows surface the active tab (or the flat draft) currently exposes. */
function activeRowsOf(draft: DraftLayout, activeTabIndex: number): RowDef[] {
  return draft.kind === "tabs" ? (draft.tabs[activeTabIndex]?.rows ?? []) : draft.rows
}

/** Clamp a focused-row index into the bounds of `rows`, never below 0. */
function clampRowIndex(rowIndex: number, rowCount: number): number {
  return Math.max(0, Math.min(rowIndex, rowCount - 1))
}

/**
 * Applies a pure rows-transform to whichever surface is active (the flat
 * rows or the active tab's rows) and returns the new draft.
 */
function mapActiveRows(
  draft: DraftLayout,
  activeTabIndex: number,
  fn: (rows: RowDef[]) => RowDef[],
): DraftLayout {
  if (draft.kind === "rows") return { kind: "rows", rows: fn(draft.rows) }
  const tabs = draft.tabs.map((t, idx) => (idx === activeTabIndex ? { ...t, rows: fn(t.rows) } : t))
  return { kind: "tabs", tabs }
}

// -------------------------------------------------------------------------- //
// Reducer
// -------------------------------------------------------------------------- //

export function draftReducer(state: BuilderDraftState, action: BuilderAction): BuilderDraftState {
  switch (action.type) {
    case "addWidgetToRow": {
      const rows = activeRowsOf(state.draft, state.activeTabIndex)
      const safeLen = rows.length > 0 ? rows.length : 1
      const idx = Math.min(Math.max(action.targetRowIdx ?? state.focusedRowIndex, 0), safeLen - 1)
      const draft = mapActiveRows(state.draft, state.activeTabIndex, (rs) => {
        const safeRows = rs.length > 0 ? rs : emptyRows()
        return safeRows.map((r, i) =>
          i === idx
            ? { row: [...r.row, { widget: action.widgetId, span: action.defaultSpan }] }
            : r,
        )
      })
      return { ...state, draft, focusedRowIndex: idx }
    }

    case "addRow": {
      let newIndex = state.focusedRowIndex
      const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) => {
        const next = [...rows, { row: [] }]
        newIndex = next.length - 1
        return next
      })
      return { ...state, draft, focusedRowIndex: newIndex }
    }

    case "removeRow": {
      const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) => {
        const next = rows.filter((_, i) => i !== action.rowIdx)
        return next.length > 0 ? next : emptyRows()
      })
      // Matches the previous behaviour: decrement, floored at 0. Finding [9]
      // clamping is scoped to tab switch / removeTab, so this stays as-is.
      return { ...state, draft, focusedRowIndex: Math.max(0, state.focusedRowIndex - 1) }
    }

    case "moveRow": {
      const target = action.rowIdx + action.direction
      const rows = activeRowsOf(state.draft, state.activeTabIndex)
      if (target < 0 || target >= rows.length) return state
      const draft = mapActiveRows(state.draft, state.activeTabIndex, (rs) => {
        const next = [...rs]
        const [moved] = next.splice(action.rowIdx, 1)
        if (!moved) return rs
        next.splice(target, 0, moved)
        return next
      })
      return { ...state, draft, focusedRowIndex: target }
    }

    case "setCellSpan": {
      const clamped = Math.max(1, Math.min(12, action.span))
      const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) =>
        rows.map((r, i) =>
          i === action.rowIdx
            ? { row: r.row.map((c, j) => (j === action.cellIdx ? { ...c, span: clamped } : c)) }
            : r,
        ),
      )
      return { ...state, draft }
    }

    case "removeCell": {
      const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) =>
        rows.map((r, i) =>
          i === action.rowIdx ? { row: r.row.filter((_, j) => j !== action.cellIdx) } : r,
        ),
      )
      return { ...state, draft }
    }

    case "setCellProps": {
      const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) =>
        rows.map((r, i) =>
          i === action.rowIdx
            ? {
                row: r.row.map((c, j) => {
                  if (j !== action.cellIdx) return c
                  if (action.next === undefined) {
                    const rest: typeof c = { widget: c.widget }
                    if (c.span !== undefined) rest.span = c.span
                    return rest
                  }
                  return { ...c, props: action.next }
                }),
              }
            : r,
        ),
      )
      return { ...state, draft }
    }

    case "setFocusedRow":
      return { ...state, focusedRowIndex: Math.max(0, action.rowIdx) }

    case "selectTab": {
      if (state.draft.kind !== "tabs") return state
      if (action.tabIdx < 0 || action.tabIdx >= state.draft.tabs.length) return state
      const rows = state.draft.tabs[action.tabIdx]?.rows ?? []
      return {
        ...state,
        activeTabIndex: action.tabIdx,
        focusedRowIndex: clampRowIndex(state.focusedRowIndex, rows.length),
      }
    }

    case "startEditingTab":
      return { ...state, editingTabIdx: action.tabIdx }

    case "stopEditingTab":
      return { ...state, editingTabIdx: null }

    case "addTab": {
      if (state.draft.kind === "tabs") {
        const label = `Tab ${state.draft.tabs.length + 1}`
        const nextTabs: DraftTab[] = [...state.draft.tabs, { label, rows: emptyRows() }]
        return {
          ...state,
          draft: { kind: "tabs", tabs: nextTabs },
          activeTabIndex: nextTabs.length - 1,
        }
      }
      const seededTabs: DraftTab[] = [
        { label: "Tab 1", rows: state.draft.rows },
        { label: "Tab 2", rows: emptyRows() },
      ]
      return { ...state, draft: { kind: "tabs", tabs: seededTabs }, activeTabIndex: 1 }
    }

    case "renameTab": {
      const trimmed = action.label.trim()
      if (!trimmed) return state
      if (state.draft.kind !== "tabs") return state
      // Reject duplicates — Tabs keys by label, collisions break the
      // component. Signal the rejection so the UI can give feedback; the
      // old label stays put.
      if (state.draft.tabs.some((t, i) => i !== action.tabIdx && t.label === trimmed)) {
        return { ...state, renameRejectedAt: state.renameRejectedAt + 1 }
      }
      const tabs = state.draft.tabs.map((t, i) =>
        i === action.tabIdx ? { ...t, label: trimmed } : t,
      )
      return { ...state, draft: { kind: "tabs", tabs } }
    }

    case "removeTab": {
      if (state.draft.kind !== "tabs") return state
      const tabs = state.draft.tabs.filter((_, i) => i !== action.tabIdx)
      const activeTabIndex = clampRowIndex(state.activeTabIndex, tabs.length)
      if (tabs.length === 0) {
        const draft: DraftLayout = { kind: "rows", rows: emptyRows() }
        return {
          ...state,
          draft,
          activeTabIndex: 0,
          editingTabIdx: null,
          focusedRowIndex: clampRowIndex(state.focusedRowIndex, draft.rows.length),
        }
      }
      if (tabs.length === 1 && tabs[0]) {
        const draft: DraftLayout = { kind: "rows", rows: tabs[0].rows }
        return {
          ...state,
          draft,
          activeTabIndex: 0,
          editingTabIdx: null,
          focusedRowIndex: clampRowIndex(state.focusedRowIndex, draft.rows.length),
        }
      }
      const rows = tabs[activeTabIndex]?.rows ?? []
      return {
        ...state,
        draft: { kind: "tabs", tabs },
        activeTabIndex,
        editingTabIdx: null,
        focusedRowIndex: clampRowIndex(state.focusedRowIndex, rows.length),
      }
    }

    default: {
      // Exhaustiveness guard: a new action type without a case is a type error.
      const _never: never = action
      return _never
    }
  }
}
