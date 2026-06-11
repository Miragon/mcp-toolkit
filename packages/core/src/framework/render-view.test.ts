import { describe, it, expect } from "vitest"
import { renderView } from "./render-view.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { PipelineStepDefinition } from "../types/step.js"
import type { WidgetDefinition } from "../types/widget.js"
import type { LayoutConfig } from "./layout-types.js"

const trivialLayout: LayoutConfig = [{ row: [{ widget: "demo:card" }] }]

const step = (overrides: Partial<PipelineStepDefinition> = {}): PipelineStepDefinition => ({
  id: "demo:load",
  dataType: "demo:data",
  requires: [],
  produces: [],
  execute: () =>
    Promise.resolve({
      data: null,
      keys: {},
      _app: "demo",
      _step: "load",
      _dataType: "demo:data",
    }),
  ...overrides,
})

const widget = (overrides: Partial<WidgetDefinition> = {}): WidgetDefinition =>
  ({
    id: "demo:card",
    requires: [],
    size: "full",
    ...overrides,
  }) as WidgetDefinition

interface RenderError {
  content: { type: "text"; text: string }[]
  isError: true
}

interface RenderOk {
  content: { type: "text"; text: string }[]
  structuredContent: {
    _refreshParams: {
      keys?: Record<string, unknown>
      steps?: { id: string; step: string; optional?: boolean }[]
      layout: LayoutConfig
      title?: string
    }
    title?: string
    context: {
      keys: Record<string, unknown>
      stepIds: string[]
      stepData: Record<
        string,
        { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
      >
      errors: { stepId: string; reason: string }[]
    }
    layout: LayoutConfig
    remoteWidgets: Record<string, { bundle: string; moduleId: string }>
    builderAvailable: boolean
  }
}

function expectOk(result: unknown): RenderOk {
  if (typeof result === "object" && result !== null && "isError" in result) {
    throw new Error(`expected a non-error render result, got ${JSON.stringify(result)}`)
  }
  return result as RenderOk
}

function expectErr(result: unknown): RenderError {
  if (!(typeof result === "object" && result !== null && "isError" in result)) {
    throw new Error(`expected an error render result, got ${JSON.stringify(result)}`)
  }
  return result as RenderError
}

describe("renderView", () => {
  it("renders a layout with no steps using just the supplied keys", async () => {
    const stepRegistry = new StepRegistry()
    const result = await renderView({
      input: {
        keys: { "demo:invoiceId": "INV-1" },
        layout: trivialLayout,
        title: "Invoice",
      },
      stepRegistry,
    })
    const ok = expectOk(result)
    expect(ok.structuredContent.title).toBe("Invoice")
    expect(ok.structuredContent.context.keys).toEqual({ "demo:invoiceId": "INV-1" })
    expect(ok.structuredContent.context.stepIds).toEqual([])
    expect(ok.structuredContent.layout).toEqual(trivialLayout)
  })

  it("propagates step data into structuredContent.context.stepData", async () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register(
      step({
        id: "demo:load",
        dataType: "demo:invoice",
        produces: ["demo:invoice"],
        execute: () =>
          Promise.resolve({
            data: { total: 100 },
            keys: { "demo:invoice": { total: 100 } },
            _app: "demo",
            _step: "load",
            _dataType: "demo:invoice",
          }),
      }),
    )

    const ok = expectOk(
      await renderView({
        input: {
          keys: {},
          steps: [{ id: "invoice", step: "demo:load" }],
          layout: trivialLayout,
        },
        stepRegistry,
      }),
    )

    expect(ok.structuredContent.context.stepIds).toEqual(["invoice"])
    expect(ok.structuredContent.context.stepData.invoice).toEqual({
      data: { total: 100 },
      keys: { "demo:invoice": { total: 100 } },
      _app: "demo",
      _dataType: "demo:invoice",
    })
    expect(ok.structuredContent.context.keys).toEqual({ "demo:invoice": { total: 100 } })
  })

  it("returns isError when the pipeline fails validation", async () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register(step({ id: "demo:needs-key", requires: ["demo:missing"] }))
    const err = expectErr(
      await renderView({
        input: {
          keys: {},
          steps: [{ id: "x", step: "demo:needs-key" }],
          layout: trivialLayout,
        },
        stepRegistry,
      }),
    )
    expect(err.isError).toBe(true)
    expect(err.content[0]?.text).toMatch(/Pipeline validation failed/)
  })

  it("surfaces step execution errors in structuredContent.context.errors", async () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register(
      step({
        id: "demo:boom",
        execute: () => Promise.reject(new Error("kaboom")),
      }),
    )

    const ok = expectOk(
      await renderView({
        input: {
          keys: {},
          steps: [{ id: "boom", step: "demo:boom" }],
          layout: trivialLayout,
        },
        stepRegistry,
      }),
    )
    expect(ok.structuredContent.context.errors).toEqual([{ stepId: "boom", reason: "kaboom" }])
  })

  it("includes a step-summary line and an errors line in the text summary", async () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register(
      step({
        id: "demo:boom",
        execute: () => Promise.reject(new Error("kaboom")),
      }),
    )
    const ok = expectOk(
      await renderView({
        input: {
          keys: { "demo:seed": 1 },
          steps: [{ id: "boom", step: "demo:boom" }],
          layout: trivialLayout,
          title: "View",
        },
        stepRegistry,
      }),
    )
    expect(ok.content[0]?.text).toContain("View")
    expect(ok.content[0]?.text).toContain("Keys: demo:seed")
    expect(ok.content[0]?.text).toContain("Errors: boom: kaboom")
  })

  it("advertises remoteWidgets only for upstream widgets the layout references", async () => {
    // render-view filters the advertised remoteWidgets down to the bundles the
    // *layout* uses — the browser-side loader fetches every advertised bundle,
    // so shipping the whole registry would make a single-widget view pull
    // unused upstream bundles. (The in-iframe builder gets its full remote
    // palette from `get-builder-catalogue` instead.)
    const stepRegistry = new StepRegistry()
    const widgetRegistry = new WidgetRegistry()
    // `trivialLayout` references `demo:card`. Register it as a remote widget so
    // it is advertised, plus an unrelated remote widget that must be filtered
    // out, plus a local (non-remote) widget that is never advertised.
    widgetRegistry.register(
      widget({ id: "demo:card", bundle: "ui://demo/card.js", moduleId: "demo" }),
    )
    widgetRegistry.register(
      widget({ id: "items:card", bundle: "ui://items/card.js", moduleId: "items" }),
    )
    widgetRegistry.register(widget({ id: "demo:local" }))

    const okWith = expectOk(
      await renderView({
        input: { keys: {}, layout: trivialLayout },
        stepRegistry,
        widgetRegistry,
      }),
    )
    expect(okWith.structuredContent.remoteWidgets).toEqual({
      "demo:card": { bundle: "ui://demo/card.js", moduleId: "demo" },
    })

    const okWithout = expectOk(
      await renderView({ input: { keys: {}, layout: trivialLayout }, stepRegistry }),
    )
    expect(okWithout.structuredContent.remoteWidgets).toEqual({})
  })

  it("defaults builderAvailable to false and echoes an explicit flag", async () => {
    const stepRegistry = new StepRegistry()
    const off = expectOk(
      await renderView({ input: { keys: {}, layout: trivialLayout }, stepRegistry }),
    )
    expect(off.structuredContent.builderAvailable).toBe(false)

    const on = expectOk(
      await renderView({
        input: { keys: {}, layout: trivialLayout },
        stepRegistry,
        builderAvailable: true,
      }),
    )
    expect(on.structuredContent.builderAvailable).toBe(true)
  })

  it("preserves the input as _refreshParams for the UI's refresh button", async () => {
    const stepRegistry = new StepRegistry()
    const input = {
      keys: { "demo:scope": "a" },
      steps: [{ id: "noop", step: "demo:missing", optional: true }],
      layout: trivialLayout,
      title: "Echo",
    }
    const ok = expectOk(await renderView({ input, stepRegistry }))
    expect(ok.structuredContent._refreshParams).toEqual(input)
  })
})
