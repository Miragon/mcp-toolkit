import { describe, it, expect } from "vitest"
import { layoutSchema, rowSchema } from "./layout-schemas.js"

describe("rowSchema", () => {
  it("accepts a minimal cell with just `widget`", () => {
    const parsed = rowSchema.parse({ row: [{ widget: "analytics:dashboard" }] })
    expect(parsed.row[0].widget).toBe("analytics:dashboard")
    expect(parsed.row[0].props).toBeUndefined()
  })

  it("accepts a cell with `span` and `props`", () => {
    const parsed = rowSchema.parse({
      row: [
        {
          widget: "analytics:dashboard",
          span: 6,
          props: { processDefinitionKey: "miraveloLeasing", period: "30d" },
        },
      ],
    })
    expect(parsed.row[0].props).toEqual({
      processDefinitionKey: "miraveloLeasing",
      period: "30d",
    })
  })

  it("rejects a cell missing `widget`", () => {
    expect(() => rowSchema.parse({ row: [{}] })).toThrow()
  })
})

describe("layoutSchema", () => {
  it("accepts a flat-rows layout", () => {
    expect(() => layoutSchema.parse([{ row: [{ widget: "w1" }] }])).not.toThrow()
  })

  it("accepts an explicit `rows` wrapper", () => {
    expect(() => layoutSchema.parse({ rows: [{ row: [{ widget: "w1" }] }] })).not.toThrow()
  })

  it("accepts a tabbed layout where each tab carries its own per-cell props", () => {
    const layout = {
      tabs: [
        {
          label: "All processes",
          rows: [{ row: [{ widget: "analytics:dashboard" }] }],
        },
        {
          label: "miraveloLeasing",
          rows: [
            {
              row: [
                {
                  widget: "analytics:dashboard",
                  props: { processDefinitionKey: "miraveloLeasing" },
                },
              ],
            },
          ],
        },
      ],
    }
    const parsed = layoutSchema.parse(layout)
    expect(parsed).toEqual(layout)
  })
})
