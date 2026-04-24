import { describe, expect, it } from "vitest"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import { buildView } from "./builder.js"

describe("buildView", () => {
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

    const result = await buildView(
      { keys: { "sales:orderId": "ORD-1" } },
      stepRegistry,
      widgetRegistry,
    )

    const payload = result.structuredContent
    expect(payload.mode).toBe("builder")
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

    const result = await buildView(
      {
        keys: { "sales:customerId": "C-1" },
        steps: [{ id: "customer", step: "sales:load-customer" }],
      },
      stepRegistry,
      widgetRegistry,
    )

    const payload = result.structuredContent
    expect(payload.reachableWidgets.map((w) => w.id)).toEqual(["sales:customer-card"])
    expect(payload.context.keys).toMatchObject({ "sales:customer": { id: "C-1" } })
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

    const result = await buildView(
      {
        // No initial keys, so `sales:customerId` is missing — validation fails.
        steps: [{ id: "customer", step: "sales:load-customer" }],
      },
      stepRegistry,
      widgetRegistry,
    )

    // Validation issue is surfaced in the text summary but the response is
    // still a valid builder payload (no `isError`).
    expect(result.content[0].text).toMatch(/Pipeline issues:/)
    expect(result.structuredContent.mode).toBe("builder")
  })

  it("advertises upstream-hosted widgets via remoteWidgets", async () => {
    const stepRegistry = new StepRegistry()
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register({
      id: "items:item-card",
      requires: ["items:item"],
      size: "half",
      bundle: "ui://items/widgets/item-card.js",
      moduleId: "items",
    })

    const result = await buildView(
      { keys: { "items:item": { id: 1 } } },
      stepRegistry,
      widgetRegistry,
    )

    expect(result.structuredContent.remoteWidgets).toEqual({
      "items:item-card": {
        bundle: "ui://items/widgets/item-card.js",
        moduleId: "items",
      },
    })
  })
})
