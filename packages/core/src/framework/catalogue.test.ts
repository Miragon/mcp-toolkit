import { describe, expect, it } from "vitest"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import { getBuilderCatalogue } from "./catalogue.js"

describe("getBuilderCatalogue", () => {
  it("surfaces widgets reachable from the initial keys alone", async () => {
    const stepRegistry = new StepRegistry()
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register({
      id: "sales:order-card",
      requires: ["sales:orderId"],
      size: "half",
    })
    widgetRegistry.register({
      id: "sales:customer-card",
      requires: ["sales:customer"],
      size: "half",
    })

    const result = await getBuilderCatalogue({
      input: { keys: { "sales:orderId": "ORD-1" } },
      stepRegistry,
      widgetRegistry,
    })

    const payload = result.structuredContent
    expect(payload.reachableWidgets.map((w) => w.id)).toEqual(["sales:order-card"])
    expect(payload.context.errors).toEqual([])
  })

  it("adds widgets unlocked by step-produced keys", async () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register({
      id: "sales:load-customer",
      dataType: "sales:customer",
      requires: ["sales:customerId"],
      produces: ["sales:customer"],
      // eslint-disable-next-line @typescript-eslint/require-await
      async execute(ctx) {
        return {
          _app: "sales",
          _step: "load-customer",
          data: { id: ctx.keys["sales:customerId"] },
          keys: { "sales:customer": { id: ctx.keys["sales:customerId"] } },
        }
      },
    })
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register({
      id: "sales:customer-card",
      requires: ["sales:customer"],
      size: "half",
    })
    widgetRegistry.register({
      id: "sales:invoice-card",
      requires: ["sales:invoice"],
      size: "half",
    })

    const result = await getBuilderCatalogue({
      input: {
        keys: { "sales:customerId": "C-1" },
        steps: [{ id: "customer", step: "sales:load-customer" }],
      },
      stepRegistry,
      widgetRegistry,
    })

    const payload = result.structuredContent
    expect(payload.reachableWidgets.map((w) => w.id)).toEqual(["sales:customer-card"])
    expect(
      payload.unreachableWidgets.map((w) => ({ id: w.id, missingKeys: w.missingKeys })),
    ).toEqual([{ id: "sales:invoice-card", missingKeys: ["sales:invoice"] }])
    expect(payload.context.keys).toMatchObject({ "sales:customer": { id: "C-1" } })
    expect(payload.availableSteps).toEqual([
      {
        id: "sales:load-customer",
        app: "sales",
        dataType: "sales:customer",
        requires: ["sales:customerId"],
        produces: ["sales:customer"],
      },
    ])
    const contract = Object.fromEntries(payload.keyCatalog.map((e) => [e.key, e]))
    expect(contract["sales:customer"]).toMatchObject({
      producedBySteps: ["sales:load-customer"],
      consumedByWidgets: ["sales:customer-card"],
      inContext: true,
    })
    expect(contract["sales:invoice"]).toMatchObject({
      producedBySteps: [],
      consumedByWidgets: ["sales:invoice-card"],
      inContext: false,
    })
    expect(contract["sales:customerId"]).toMatchObject({
      consumedBySteps: ["sales:load-customer"],
      inContext: true,
    })
  })

  it("returns a non-error payload even when the pipeline validation finds issues", async () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register({
      id: "sales:load-customer",
      dataType: "sales:customer",
      requires: ["sales:customerId"],
      produces: ["sales:customer"],
      // eslint-disable-next-line @typescript-eslint/require-await
      async execute() {
        throw new Error("should not run without required keys")
      },
    })
    const widgetRegistry = new WidgetRegistry()

    const result = await getBuilderCatalogue({
      input: {
        steps: [{ id: "customer", step: "sales:load-customer" }],
      },
      stepRegistry,
      widgetRegistry,
    })

    expect(result.content[0]?.text).toMatch(/Pipeline issues:/)
    expect(result.structuredContent.reachableWidgets).toEqual([])
    // The fail-soft issues are also exposed structurally so the builder can
    // warn the user before they commit (render-view would fail hard on these).
    expect(result.structuredContent.validationIssues.length).toBeGreaterThan(0)
    expect(result.structuredContent.validationIssues.join(" ")).toContain("sales:customerId")
  })

  it("reports no validationIssues when the pipeline resolves cleanly", async () => {
    const stepRegistry = new StepRegistry()
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register({ id: "sales:order-card", requires: ["sales:orderId"], size: "half" })

    const result = await getBuilderCatalogue({
      input: { keys: { "sales:orderId": "ORD-1" } },
      stepRegistry,
      widgetRegistry,
    })

    expect(result.structuredContent.validationIssues).toEqual([])
  })

  it("propagates a widget's propsSchema onto reachable + unreachable entries", async () => {
    const stepRegistry = new StepRegistry()
    const widgetRegistry = new WidgetRegistry()
    const propsSchema = {
      type: "object",
      properties: { processDefinitionKey: { type: "string" } },
    }
    widgetRegistry.register({
      id: "sales:reachable",
      requires: ["sales:order"],
      size: "half",
      propsSchema,
    })
    widgetRegistry.register({
      id: "sales:unreachable",
      requires: ["sales:missing"],
      size: "half",
      propsSchema,
    })

    const result = await getBuilderCatalogue({
      input: { keys: { "sales:order": { id: 1 } } },
      stepRegistry,
      widgetRegistry,
    })

    const payload = result.structuredContent
    expect(payload.reachableWidgets[0]).toMatchObject({ id: "sales:reachable", propsSchema })
    expect(payload.unreachableWidgets[0]).toMatchObject({ id: "sales:unreachable", propsSchema })
  })
})
