import { describe, expect, it } from "vitest"
import type { RowDef } from "@miragon/mcp-toolkit-core"
import type { DraftLayout } from "./builder-model.js"
import {
  draftReducer,
  initBuilderState,
  type BuilderAction,
  type BuilderDraftState,
} from "./builder-reducer.js"

function rowsDraft(rows: RowDef[]): DraftLayout {
  return { kind: "rows", rows }
}

function tabsDraft(tabs: { label: string; rows: RowDef[] }[]): DraftLayout {
  return { kind: "tabs", tabs }
}

function stateOf(
  draft: DraftLayout,
  overrides: Partial<BuilderDraftState> = {},
): BuilderDraftState {
  return { ...initBuilderState(draft), ...overrides }
}

function run(state: BuilderDraftState, ...actions: BuilderAction[]): BuilderDraftState {
  return actions.reduce(draftReducer, state)
}

describe("initBuilderState", () => {
  it("seeds the indices to zero and no rename rejection", () => {
    const draft = rowsDraft([{ row: [] }])
    expect(initBuilderState(draft)).toEqual({
      draft,
      activeTabIndex: 0,
      focusedRowIndex: 0,
      editingTabIdx: null,
      renameRejectedAt: 0,
    })
  })
})

describe("addWidgetToRow", () => {
  it("appends a widget with the supplied span to the focused row", () => {
    const start = stateOf(rowsDraft([{ row: [] }, { row: [] }]), { focusedRowIndex: 1 })
    const next = draftReducer(start, {
      type: "addWidgetToRow",
      widgetId: "w",
      defaultSpan: 6,
    })
    expect(next.draft).toEqual(rowsDraft([{ row: [] }, { row: [{ widget: "w", span: 6 }] }]))
    expect(next.focusedRowIndex).toBe(1)
  })

  it("honors an explicit targetRowIdx and sets focus to it", () => {
    const start = stateOf(rowsDraft([{ row: [] }, { row: [] }]), { focusedRowIndex: 1 })
    const next = draftReducer(start, {
      type: "addWidgetToRow",
      widgetId: "w",
      defaultSpan: 4,
      targetRowIdx: 0,
    })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "w", span: 4 }] }, { row: [] }]))
    expect(next.focusedRowIndex).toBe(0)
  })

  it("clamps an out-of-range target into bounds", () => {
    const start = stateOf(rowsDraft([{ row: [] }]))
    const next = draftReducer(start, {
      type: "addWidgetToRow",
      widgetId: "w",
      defaultSpan: 12,
      targetRowIdx: 9,
    })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "w", span: 12 }] }]))
    expect(next.focusedRowIndex).toBe(0)
  })

  it("targets the active tab's rows when in tabs mode", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
      { activeTabIndex: 1 },
    )
    const next = draftReducer(start, { type: "addWidgetToRow", widgetId: "w", defaultSpan: 3 })
    expect(next.draft).toEqual(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [{ widget: "w", span: 3 }] }] },
      ]),
    )
  })
})

describe("addRow", () => {
  it("appends an empty row and focuses it", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }] }]))
    const next = draftReducer(start, { type: "addRow" })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "a" }] }, { row: [] }]))
    expect(next.focusedRowIndex).toBe(1)
  })

  it("appends to the active tab in tabs mode", () => {
    const start = stateOf(tabsDraft([{ label: "A", rows: [{ row: [] }] }]), { activeTabIndex: 0 })
    const next = draftReducer(start, { type: "addRow" })
    expect(next.draft).toEqual(tabsDraft([{ label: "A", rows: [{ row: [] }, { row: [] }] }]))
    expect(next.focusedRowIndex).toBe(1)
  })
})

describe("removeRow", () => {
  it("removes the given row and decrements focus floored at 0", () => {
    const start = stateOf(rowsDraft([{ row: [] }, { row: [{ widget: "b" }] }]), {
      focusedRowIndex: 1,
    })
    const next = draftReducer(start, { type: "removeRow", rowIdx: 1 })
    expect(next.draft).toEqual(rowsDraft([{ row: [] }]))
    expect(next.focusedRowIndex).toBe(0)
  })

  it("never leaves zero rows — collapses to a single empty row", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }] }]))
    const next = draftReducer(start, { type: "removeRow", rowIdx: 0 })
    expect(next.draft).toEqual(rowsDraft([{ row: [] }]))
    expect(next.focusedRowIndex).toBe(0)
  })
})

describe("moveRow", () => {
  it("moves a row down and follows focus to the new index", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }] }, { row: [{ widget: "b" }] }]))
    const next = draftReducer(start, { type: "moveRow", rowIdx: 0, direction: 1 })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "b" }] }, { row: [{ widget: "a" }] }]))
    expect(next.focusedRowIndex).toBe(1)
  })

  it("moves a row up", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }] }, { row: [{ widget: "b" }] }]))
    const next = draftReducer(start, { type: "moveRow", rowIdx: 1, direction: -1 })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "b" }] }, { row: [{ widget: "a" }] }]))
    expect(next.focusedRowIndex).toBe(0)
  })

  it("is a no-op past the top edge", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }] }]))
    expect(draftReducer(start, { type: "moveRow", rowIdx: 0, direction: -1 })).toBe(start)
  })

  it("is a no-op past the bottom edge", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }] }]))
    expect(draftReducer(start, { type: "moveRow", rowIdx: 0, direction: 1 })).toBe(start)
  })
})

describe("setCellSpan", () => {
  it("sets and clamps the span to 1..12", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a", span: 6 }] }]))
    expect(
      draftReducer(start, { type: "setCellSpan", rowIdx: 0, cellIdx: 0, span: 99 }).draft,
    ).toEqual(rowsDraft([{ row: [{ widget: "a", span: 12 }] }]))
    expect(
      draftReducer(start, { type: "setCellSpan", rowIdx: 0, cellIdx: 0, span: 0 }).draft,
    ).toEqual(rowsDraft([{ row: [{ widget: "a", span: 1 }] }]))
  })
})

describe("removeCell", () => {
  it("removes the targeted cell", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }, { widget: "b" }] }]))
    expect(draftReducer(start, { type: "removeCell", rowIdx: 0, cellIdx: 0 }).draft).toEqual(
      rowsDraft([{ row: [{ widget: "b" }] }]),
    )
  })
})

describe("setCellProps", () => {
  it("sets per-instance props", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a", span: 6 }] }]))
    const next = draftReducer(start, {
      type: "setCellProps",
      rowIdx: 0,
      cellIdx: 0,
      next: { scope: "x" },
    })
    expect(next.draft).toEqual(
      rowsDraft([{ row: [{ widget: "a", span: 6, props: { scope: "x" } }] }]),
    )
  })

  it("clears props by dropping the field, preserving span", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a", span: 6, props: { scope: "x" } }] }]))
    const next = draftReducer(start, {
      type: "setCellProps",
      rowIdx: 0,
      cellIdx: 0,
      next: undefined,
    })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "a", span: 6 }] }]))
    const cell = (next.draft as { rows: RowDef[] }).rows[0]!.row[0]!
    expect("props" in cell).toBe(false)
  })

  it("clears props without a span, leaving only the widget", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a", props: { scope: "x" } }] }]))
    const next = draftReducer(start, {
      type: "setCellProps",
      rowIdx: 0,
      cellIdx: 0,
      next: undefined,
    })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "a" }] }]))
  })
})

describe("setFocusedRow", () => {
  it("sets the focused row, floored at 0", () => {
    const start = stateOf(rowsDraft([{ row: [] }, { row: [] }]))
    expect(draftReducer(start, { type: "setFocusedRow", rowIdx: 1 }).focusedRowIndex).toBe(1)
    expect(draftReducer(start, { type: "setFocusedRow", rowIdx: -3 }).focusedRowIndex).toBe(0)
  })
})

describe("tab editing flags", () => {
  it("starts and stops inline tab editing", () => {
    const start = stateOf(tabsDraft([{ label: "A", rows: [{ row: [] }] }]))
    const editing = draftReducer(start, { type: "startEditingTab", tabIdx: 0 })
    expect(editing.editingTabIdx).toBe(0)
    expect(draftReducer(editing, { type: "stopEditingTab" }).editingTabIdx).toBeNull()
  })
})

describe("addTab", () => {
  it("converts a rows draft into two tabs, keeping the existing rows in Tab 1", () => {
    const start = stateOf(rowsDraft([{ row: [{ widget: "a" }] }]))
    const next = draftReducer(start, { type: "addTab" })
    expect(next.draft).toEqual(
      tabsDraft([
        { label: "Tab 1", rows: [{ row: [{ widget: "a" }] }] },
        { label: "Tab 2", rows: [{ row: [] }] },
      ]),
    )
    expect(next.activeTabIndex).toBe(1)
  })

  it("appends a new tab and selects it when already in tabs mode", () => {
    const start = stateOf(tabsDraft([{ label: "Tab 1", rows: [{ row: [] }] }]))
    const next = draftReducer(start, { type: "addTab" })
    expect(next.draft).toEqual(
      tabsDraft([
        { label: "Tab 1", rows: [{ row: [] }] },
        { label: "Tab 2", rows: [{ row: [] }] },
      ]),
    )
    expect(next.activeTabIndex).toBe(1)
  })
})

describe("selectTab", () => {
  it("switches the active tab", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
    )
    expect(draftReducer(start, { type: "selectTab", tabIdx: 1 }).activeTabIndex).toBe(1)
  })

  it("clamps focusedRowIndex to the target tab's row count (finding 9)", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }, { row: [] }, { row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
      { focusedRowIndex: 2 },
    )
    const next = draftReducer(start, { type: "selectTab", tabIdx: 1 })
    expect(next.activeTabIndex).toBe(1)
    expect(next.focusedRowIndex).toBe(0)
  })

  it("ignores out-of-range tab indices", () => {
    const start = stateOf(tabsDraft([{ label: "A", rows: [{ row: [] }] }]))
    expect(draftReducer(start, { type: "selectTab", tabIdx: 5 })).toBe(start)
    expect(draftReducer(start, { type: "selectTab", tabIdx: -1 })).toBe(start)
  })

  it("is a no-op on a rows draft", () => {
    const start = stateOf(rowsDraft([{ row: [] }]))
    expect(draftReducer(start, { type: "selectTab", tabIdx: 0 })).toBe(start)
  })
})

describe("renameTab", () => {
  it("renames a tab to a trimmed label", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
    )
    const next = draftReducer(start, { type: "renameTab", tabIdx: 0, label: "  New  " })
    expect(next.draft).toEqual(
      tabsDraft([
        { label: "New", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
    )
    expect(next.renameRejectedAt).toBe(0)
  })

  it("ignores blank labels", () => {
    const start = stateOf(tabsDraft([{ label: "A", rows: [{ row: [] }] }]))
    expect(draftReducer(start, { type: "renameTab", tabIdx: 0, label: "   " })).toBe(start)
  })

  it("rejects a duplicate label and bumps renameRejectedAt without changing the draft", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
    )
    const next = draftReducer(start, { type: "renameTab", tabIdx: 0, label: "B" })
    expect(next.draft).toBe(start.draft)
    expect(next.renameRejectedAt).toBe(1)
  })

  it("bumps renameRejectedAt again on a second rejection (counter, not boolean)", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
    )
    const next = run(
      start,
      { type: "renameTab", tabIdx: 0, label: "B" },
      { type: "renameTab", tabIdx: 0, label: "B" },
    )
    expect(next.renameRejectedAt).toBe(2)
  })

  it("allows renaming a tab to its own current label (no false-positive collision)", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
    )
    const next = draftReducer(start, { type: "renameTab", tabIdx: 0, label: "A" })
    expect(next.renameRejectedAt).toBe(0)
    expect(next.draft).toEqual(start.draft)
  })

  it("is a no-op on a rows draft", () => {
    const start = stateOf(rowsDraft([{ row: [] }]))
    expect(draftReducer(start, { type: "renameTab", tabIdx: 0, label: "X" })).toBe(start)
  })
})

describe("removeTab", () => {
  it("removes one of three tabs and clamps the active index", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
        { label: "C", rows: [{ row: [] }] },
      ]),
      { activeTabIndex: 2 },
    )
    const next = draftReducer(start, { type: "removeTab", tabIdx: 2 })
    expect(next.draft).toEqual(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
    )
    expect(next.activeTabIndex).toBe(1)
  })

  it("collapses to a rows draft when one tab remains, keeping its rows", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [{ widget: "a" }] }] },
        { label: "B", rows: [{ row: [] }] },
      ]),
      { activeTabIndex: 1 },
    )
    const next = draftReducer(start, { type: "removeTab", tabIdx: 1 })
    expect(next.draft).toEqual(rowsDraft([{ row: [{ widget: "a" }] }]))
    expect(next.activeTabIndex).toBe(0)
  })

  it("collapses to an empty rows draft when the last tab is removed", () => {
    const start = stateOf(tabsDraft([{ label: "A", rows: [{ row: [{ widget: "a" }] }] }]))
    const next = draftReducer(start, { type: "removeTab", tabIdx: 0 })
    expect(next.draft).toEqual(rowsDraft([{ row: [] }]))
    expect(next.activeTabIndex).toBe(0)
  })

  it("clamps focusedRowIndex to the surviving active tab's rows (finding 9)", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
        { label: "C", rows: [{ row: [] }, { row: [] }, { row: [] }] },
      ]),
      { activeTabIndex: 2, focusedRowIndex: 2 },
    )
    // Removing tab A keeps the active index clamped to the last surviving tab
    // (index 1 = old tab C, now 1 row after this layout's tail). Use a tab with
    // fewer rows so the focused-row clamp is exercised.
    const next = draftReducer(start, {
      type: "removeTab",
      tabIdx: 2,
    })
    // After removing tab C the active index clamps from 2 to 1 (tab B, 1 row).
    expect(next.activeTabIndex).toBe(1)
    expect(next.focusedRowIndex).toBe(0)
  })

  it("clears any inline tab editing on removal", () => {
    const start = stateOf(
      tabsDraft([
        { label: "A", rows: [{ row: [] }] },
        { label: "B", rows: [{ row: [] }] },
        { label: "C", rows: [{ row: [] }] },
      ]),
      { editingTabIdx: 1 },
    )
    expect(draftReducer(start, { type: "removeTab", tabIdx: 0 }).editingTabIdx).toBeNull()
  })

  it("is a no-op on a rows draft", () => {
    const start = stateOf(rowsDraft([{ row: [] }]))
    expect(draftReducer(start, { type: "removeTab", tabIdx: 0 })).toBe(start)
  })
})
