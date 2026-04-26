import { describe, it, expect } from "vitest"
import { normalizeLayout, type LayoutConfig } from "./layout-types.js"

describe("normalizeLayout", () => {
  it("wraps a flat array of rows in { rows }", () => {
    const layout: LayoutConfig = [{ row: [{ widget: "w1" }] }]
    expect(normalizeLayout(layout)).toEqual({
      rows: [{ row: [{ widget: "w1" }] }],
    })
  })

  it("returns an explicit { rows } object unchanged", () => {
    const layout: LayoutConfig = { rows: [{ row: [{ widget: "w1", span: 2 }] }] }
    expect(normalizeLayout(layout)).toBe(layout)
  })

  it("returns an explicit { tabs } object unchanged", () => {
    const layout: LayoutConfig = {
      tabs: [{ label: "Overview", rows: [{ row: [{ widget: "w1" }] }] }],
    }
    expect(normalizeLayout(layout)).toBe(layout)
  })

  it("wraps an empty array as { rows: [] }", () => {
    expect(normalizeLayout([])).toEqual({ rows: [] })
  })
})
