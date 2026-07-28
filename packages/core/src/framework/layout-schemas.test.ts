import { describe, it, expect } from "vitest"
import { layoutInputSchema, layoutSchema, rowSchema } from "./layout-schemas.js"

describe("rowSchema", () => {
  it("accepts a minimal cell with just `widget`", () => {
    const parsed = rowSchema.parse({ row: [{ widget: "analytics:dashboard" }] })
    expect(parsed.row[0]?.widget).toBe("analytics:dashboard")
    expect(parsed.row[0]?.props).toBeUndefined()
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
    expect(parsed.row[0]?.props).toEqual({
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

describe("layoutInputSchema", () => {
  const flatRows = [{ row: [{ widget: "w1" }] }]
  const rowsWrapper = { rows: [{ row: [{ widget: "w1", span: 6 }] }] }
  const tabs = {
    tabs: [{ label: "All", rows: [{ row: [{ widget: "w1", props: { period: "30d" } }] }] }],
  }

  it.each([
    ["flat rows", flatRows],
    ["rows wrapper", rowsWrapper],
    ["tabs", tabs],
  ])(
    "parses the JSON-string form of a %s layout to the same result as the object form",
    (_name, layout) => {
      expect(layoutInputSchema.parse(JSON.stringify(layout))).toEqual(
        layoutInputSchema.parse(layout),
      )
      expect(layoutInputSchema.parse(JSON.stringify(layout))).toEqual(layoutSchema.parse(layout))
    },
  )

  // Observed claude.ai traffic: the model writes the layout as a JSON string
  // (the advertised string branch), and the host stringifies the argument once
  // more — the schema must unwrap the nesting, bounded at three parses.
  it.each([
    ["flat rows", flatRows],
    ["rows wrapper", rowsWrapper],
    ["tabs", tabs],
  ])("unwraps a DOUBLE-encoded %s layout to the object form", (_name, layout) => {
    const doubleEncoded = JSON.stringify(JSON.stringify(layout))
    expect(layoutInputSchema.parse(doubleEncoded)).toEqual(layoutSchema.parse(layout))
  })

  it.each([
    ["flat rows", flatRows],
    ["rows wrapper", rowsWrapper],
    ["tabs", tabs],
  ])("unwraps a TRIPLE-encoded %s layout to the object form", (_name, layout) => {
    const tripleEncoded = JSON.stringify(JSON.stringify(JSON.stringify(layout)))
    expect(layoutInputSchema.parse(tripleEncoded)).toEqual(layoutSchema.parse(layout))
  })

  it("rejects a QUADRUPLE-encoded layout (unwrap cap of three parses)", () => {
    const quadrupleEncoded = JSON.stringify(
      JSON.stringify(JSON.stringify(JSON.stringify(flatRows))),
    )
    const result = layoutInputSchema.safeParse(quadrupleEncoded)
    expect(result.success).toBe(false)
    // The cap leaves a string behind, which then fails the piped layoutSchema
    // — not the JSON-parse error path.
    expect(JSON.stringify(result.error?.issues)).not.toContain("not valid JSON")
  })

  it("rejects a string that is not valid JSON with a clear message", () => {
    const result = layoutInputSchema.safeParse("{ rows: not json")
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain(
      "layout was sent as a string but is not valid JSON",
    )
  })

  it("rejects valid JSON that is not a valid layout shape", () => {
    const result = layoutInputSchema.safeParse(JSON.stringify({ rows: [{ row: [{}] }] }))
    expect(result.success).toBe(false)
    // The failure comes from layoutSchema (missing `widget`), not from JSON parsing.
    expect(JSON.stringify(result.error?.issues)).not.toContain("not valid JSON")
  })

  it("still accepts the three object forms directly", () => {
    for (const layout of [flatRows, rowsWrapper, tabs]) {
      expect(layoutInputSchema.parse(layout)).toEqual(layoutSchema.parse(layout))
    }
  })
})
