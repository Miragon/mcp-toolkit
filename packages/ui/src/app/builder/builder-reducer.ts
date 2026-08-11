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
// Per-action handlers (dispatch table)
// -------------------------------------------------------------------------- //

type ActionOf<K extends BuilderAction["type"]> = Extract<BuilderAction, { type: K }>

function addWidgetToRow(
  state: BuilderDraftState,
  action: ActionOf<"addWidgetToRow">,
): BuilderDraftState {
  const rows = activeRowsOf(state.draft, state.activeTabIndex)
  const safeLen = rows.length > 0 ? rows.length : 1
  const idx = Math.min(Math.max(action.targetRowIdx ?? state.focusedRowIndex, 0), safeLen - 1)
  const draft = mapActiveRows(state.draft, state.activeTabIndex, (rs) => {
    const safeRows = rs.length > 0 ? rs : emptyRows()
    return safeRows.map((r, i) =>
      i === idx ? { row: [...r.row, { widget: action.widgetId, span: action.defaultSpan }] } : r,
    )
  })
  return { ...state, draft, focusedRowIndex: idx }
}

function addRow(state: BuilderDraftState): BuilderDraftState {
  let newIndex = state.focusedRowIndex
  const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) => {
    const next = [...rows, { row: [] }]
    newIndex = next.length - 1
    return next
  })
  return { ...state, draft, focusedRowIndex: newIndex }
}

function removeRow(state: BuilderDraftState, action: ActionOf<"removeRow">): BuilderDraftState {
  const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) => {
    const next = rows.filter((_, i) => i !== action.rowIdx)
    return next.length > 0 ? next : emptyRows()
  })
  // Matches the previous behaviour: decrement, floored at 0. Finding [9]
  // clamping is scoped to tab switch / removeTab, so this stays as-is.
  return { ...state, draft, focusedRowIndex: Math.max(0, state.focusedRowIndex - 1) }
}

function moveRow(state: BuilderDraftState, action: ActionOf<"moveRow">): BuilderDraftState {
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

function setCellSpan(state: BuilderDraftState, action: ActionOf<"setCellSpan">): BuilderDraftState {
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

function removeCell(state: BuilderDraftState, action: ActionOf<"removeCell">): BuilderDraftState {
  const draft = mapActiveRows(state.draft, state.activeTabIndex, (rows) =>
    rows.map((r, i) =>
      i === action.rowIdx ? { row: r.row.filter((_, j) => j !== action.cellIdx) } : r,
    ),
  )
  return { ...state, draft }
}

function setCellProps(
  state: BuilderDraftState,
  action: ActionOf<"setCellProps">,
): BuilderDraftState {
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

function setFocusedRow(
  state: BuilderDraftState,
  action: ActionOf<"setFocusedRow">,
): BuilderDraftState {
  return { ...state, focusedRowIndex: Math.max(0, action.rowIdx) }
}

function selectTab(state: BuilderDraftState, action: ActionOf<"selectTab">): BuilderDraftState {
  if (state.draft.kind !== "tabs") return state
  if (action.tabIdx < 0 || action.tabIdx >= state.draft.tabs.length) return state
  const rows = state.draft.tabs[action.tabIdx]?.rows ?? []
  return {
    ...state,
    activeTabIndex: action.tabIdx,
    focusedRowIndex: clampRowIndex(state.focusedRowIndex, rows.length),
  }
}

function startEditingTab(
  state: BuilderDraftState,
  action: ActionOf<"startEditingTab">,
): BuilderDraftState {
  return { ...state, editingTabIdx: action.tabIdx }
}

function stopEditingTab(state: BuilderDraftState): BuilderDraftState {
  return { ...state, editingTabIdx: null }
}

function addTab(state: BuilderDraftState): BuilderDraftState {
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

function renameTab(state: BuilderDraftState, action: ActionOf<"renameTab">): BuilderDraftState {
  const trimmed = action.label.trim()
  if (!trimmed) return state
  if (state.draft.kind !== "tabs") return state
  // Reject duplicates — Tabs keys by label, collisions break the
  // component. Signal the rejection so the UI can give feedback; the
  // old label stays put.
  if (state.draft.tabs.some((t, i) => i !== action.tabIdx && t.label === trimmed)) {
    return { ...state, renameRejectedAt: state.renameRejectedAt + 1 }
  }
  const tabs = state.draft.tabs.map((t, i) => (i === action.tabIdx ? { ...t, label: trimmed } : t))
  return { ...state, draft: { kind: "tabs", tabs } }
}

function removeTab(state: BuilderDraftState, action: ActionOf<"removeTab">): BuilderDraftState {
  if (state.draft.kind !== "tabs") return state
  const tabs = state.draft.tabs.filter((_, i) => i !== action.tabIdx)
  // One tab left collapses back to a flat draft (zero left: a flat empty one).
  if (tabs.length <= 1) {
    const draft: DraftLayout = { kind: "rows", rows: tabs[0]?.rows ?? emptyRows() }
    return {
      ...state,
      draft,
      activeTabIndex: 0,
      editingTabIdx: null,
      focusedRowIndex: clampRowIndex(state.focusedRowIndex, draft.rows.length),
    }
  }
  const activeTabIndex = clampRowIndex(state.activeTabIndex, tabs.length)
  const rows = tabs[activeTabIndex]?.rows ?? []
  return {
    ...state,
    draft: { kind: "tabs", tabs },
    activeTabIndex,
    editingTabIdx: null,
    focusedRowIndex: clampRowIndex(state.focusedRowIndex, rows.length),
  }
}

// -------------------------------------------------------------------------- //
// Reducer
// -------------------------------------------------------------------------- //

/**
 * Dispatch table instead of a switch: one small handler per action. The
 * mapped type keeps it exhaustive — a new `BuilderAction` variant without a
 * matching entry is a type error (the table equivalent of the old switch's
 * `never` default).
 */
const handlers: {
  [K in BuilderAction["type"]]: (state: BuilderDraftState, action: ActionOf<K>) => BuilderDraftState
} = {
  addWidgetToRow,
  addRow,
  removeRow,
  moveRow,
  setCellSpan,
  removeCell,
  setCellProps,
  setFocusedRow,
  selectTab,
  startEditingTab,
  stopEditingTab,
  addTab,
  renameTab,
  removeTab,
}

export function draftReducer(state: BuilderDraftState, action: BuilderAction): BuilderDraftState {
  // TS cannot correlate `handlers[action.type]` with `action` across the
  // union, so widen the picked handler once; the table type above already
  // guarantees the per-variant pairing.
  const handle = handlers[action.type] as (
    state: BuilderDraftState,
    action: BuilderAction,
  ) => BuilderDraftState
  return handle(state, action)
}
