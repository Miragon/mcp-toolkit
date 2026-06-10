import { describe, expect, it } from "vitest"
import {
  buildComposedView,
  buildSingleWidgetView,
  collectLayoutWidgets,
  defaultSummary,
  deriveItemCount,
} from "./view-builders.js"
import type { LayoutConfig } from "./layout-types.js"

/**
 * The structuredContent shape produced here is the wire contract with the
 * `McpAppView` shell / `adaptDataWidget`: widget data must live under
 * `context.stepData[<id>]` with `_app` and `_dataType` routing fields. These
 * tests pin that contract — plus the text-channel diet: the text block carries
 * only a model summary, never the payload.
 */
describe("buildSingleWidgetView", () => {
  const data = { rows: [{ id: "pi-1" }], total: 1 }
  const view = buildSingleWidgetView({
    widget: "process-instances",
    app: "camunda7",
    dataType: "processInstances",
    data,
    title: "Instances",
    summary: "1 running instance of order-process.",
  })

  it("exposes the data under context.stepData.result with _app/_dataType routing", () => {
    expect(view.structuredContent).toEqual({
      title: "Instances",
      context: {
        keys: {},
        stepIds: ["result"],
        stepData: {
          result: {
            data,
            keys: {},
            _app: "camunda7",
            _dataType: "processInstances",
          },
        },
        errors: [],
      },
      layout: [{ row: [{ widget: "process-instances" }] }],
    })
  })

  it("emits only the model summary on the text channel — never the payload", () => {
    expect(view.content).toEqual([{ type: "text", text: "1 running instance of order-process." }])
  })

  it("falls back to a generic widget-type summary with a derivable item count", () => {
    const fallback = buildSingleWidgetView({
      widget: "camunda7:job-panel",
      app: "camunda7",
      dataType: "jobPanel",
      data: { jobs: [], totalCount: 7 },
    })
    expect(fallback.content[0]!.text).toBe(
      'Rendered widget "camunda7:job-panel" (7 items). Full data is shown in the widget.',
    )
  })

  it("omits the count suffix when no item count is derivable", () => {
    const fallback = buildSingleWidgetView({
      widget: "demo:card",
      app: "demo",
      dataType: "card",
      data: { name: "x" },
      title: "Card",
    })
    expect(fallback.content[0]!.text).toBe(
      'Rendered widget "Card". Full data is shown in the widget.',
    )
  })
})

describe("buildComposedView", () => {
  const layout: LayoutConfig = [{ row: [{ widget: "kpi-grid" }, { widget: "failure-list" }] }]

  it("keys each entry's step data by id (or result_<index>) with _app/_dataType", () => {
    const view = buildComposedView({
      app: "analytics",
      layout,
      title: "Failure overview",
      entries: [
        { id: "kpis", dataType: "dashboard", data: { totalCount: 5 } },
        { dataType: "failures", data: { patterns: [] } },
      ],
    })

    expect(view.structuredContent.title).toBe("Failure overview")
    expect(view.structuredContent.layout).toEqual(layout)
    expect(view.structuredContent.context).toEqual({
      keys: {},
      stepIds: ["kpis", "result_1"],
      stepData: {
        kpis: {
          data: { totalCount: 5 },
          keys: {},
          _app: "analytics",
          _dataType: "dashboard",
        },
        result_1: {
          data: { patterns: [] },
          keys: {},
          _app: "analytics",
          _dataType: "failures",
        },
      },
      errors: [],
    })
  })

  it("emits the explicit summary on the text channel, not the entry data", () => {
    const view = buildComposedView({
      app: "analytics",
      layout,
      entries: [{ id: "kpis", dataType: "dashboard", data: { totalCount: 5 } }],
      summary: "Failure dashboard: 5 open incidents.",
    })
    expect(view.content).toEqual([{ type: "text", text: "Failure dashboard: 5 open incidents." }])
  })

  it("falls back to a generic summary naming title (or widgets) with the single-entry count", () => {
    const single = buildComposedView({
      app: "analytics",
      layout,
      title: "Failure overview",
      entries: [{ dataType: "dashboard", data: { totalCount: 5 } }],
    })
    expect(single.content[0]!.text).toBe(
      'Rendered widget "Failure overview" (5 items). Full data is shown in the widget.',
    )

    const multi = buildComposedView({
      app: "analytics",
      layout,
      entries: [
        { id: "kpis", dataType: "dashboard", data: { totalCount: 5 } },
        { dataType: "failures", data: { patterns: [] } },
      ],
    })
    // Multi-entry views derive no single count, so they name the widget ids.
    expect(multi.content[0]!.text).toBe(
      'Rendered widget "kpi-grid, failure-list". Full data is shown in the widget.',
    )
  })
})

describe("deriveItemCount", () => {
  it("returns array length", () => {
    expect(deriveItemCount([1, 2, 3])).toBe(3)
  })

  it("prefers totalCount over total when both present", () => {
    expect(deriveItemCount({ totalCount: 9, total: 4 })).toBe(9)
  })

  it("falls back to total when totalCount is absent", () => {
    expect(deriveItemCount({ total: 4 })).toBe(4)
  })

  it("returns null when no count field is derivable", () => {
    expect(deriveItemCount({ foo: "bar" })).toBeNull()
    expect(deriveItemCount(null)).toBeNull()
    expect(deriveItemCount(42)).toBeNull()
  })
})

describe("defaultSummary", () => {
  it("uses the title when provided", () => {
    expect(defaultSummary(["a", "b"], [1], "My View")).toBe(
      'Rendered widget "My View" (1 item). Full data is shown in the widget.',
    )
  })

  it("joins widget ids when no title is provided", () => {
    expect(defaultSummary(["a", "b"], null)).toBe(
      'Rendered widget "a, b". Full data is shown in the widget.',
    )
  })

  it("singularises the item suffix for a count of one", () => {
    expect(defaultSummary(["x"], [1])).toContain("(1 item)")
    expect(defaultSummary(["x"], [1, 2])).toContain("(2 items)")
  })
})

describe("collectLayoutWidgets", () => {
  it("collects widget ids from a flat rows array", () => {
    expect(collectLayoutWidgets([{ row: [{ widget: "a" }, { widget: "b" }] }])).toEqual(["a", "b"])
  })

  it("collects widget ids from a rows object", () => {
    expect(collectLayoutWidgets({ rows: [{ row: [{ widget: "a" }] }] })).toEqual(["a"])
  })

  it("collects widget ids across tabs", () => {
    expect(
      collectLayoutWidgets({
        tabs: [
          { label: "One", rows: [{ row: [{ widget: "a" }] }] },
          { label: "Two", rows: [{ row: [{ widget: "b" }, { widget: "c" }] }] },
        ],
      }),
    ).toEqual(["a", "b", "c"])
  })
})
