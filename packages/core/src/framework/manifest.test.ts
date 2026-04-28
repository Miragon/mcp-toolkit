import { describe, it, expect } from "vitest"
import { getFrameworkManifest } from "./manifest.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppConfig } from "../types/config.js"
import type { WidgetDefinition } from "../types/widget.js"
import type { PipelineStepDefinition } from "../types/step.js"

const emptyConfig: AppConfig = { activeApps: [], pipelines: {} }

const widget = (overrides: Partial<WidgetDefinition>): WidgetDefinition => ({
  id: "demo:widget",
  requires: [],
  size: "full",
  ...overrides,
})

const step = (overrides: Partial<PipelineStepDefinition>): PipelineStepDefinition => ({
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

describe("getFrameworkManifest", () => {
  it("emits widget entries with id, app, requires, size — and no propsSchema by default", () => {
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register(widget({ id: "demo:plain", requires: ["demo:data"], size: "half" }))
    const manifest = getFrameworkManifest(new StepRegistry(), widgetRegistry, emptyConfig)
    expect(manifest.widgets).toEqual([
      { id: "demo:plain", app: "demo", requires: ["demo:data"], size: "half" },
    ])
    expect(manifest.widgets[0].propsSchema).toBeUndefined()
  })

  it("surfaces propsSchema verbatim when the widget declares one", () => {
    const propsSchema = {
      type: "object",
      properties: { processDefinitionKey: { type: "string" } },
      additionalProperties: false,
    }
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register(widget({ id: "demo:scoped", propsSchema }))
    const manifest = getFrameworkManifest(new StepRegistry(), widgetRegistry, emptyConfig)
    expect(manifest.widgets[0].propsSchema).toEqual(propsSchema)
  })

  it("surfaces widget description and consumes when present, omits when absent", () => {
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register(
      widget({
        id: "demo:annotated",
        description: "Renders demo KPIs.",
        consumes: ["demo:dashboard"],
      }),
    )
    widgetRegistry.register(widget({ id: "demo:bare" }))

    const manifest = getFrameworkManifest(new StepRegistry(), widgetRegistry, emptyConfig)
    const annotated = manifest.widgets.find((w) => w.id === "demo:annotated")
    expect(annotated?.description).toBe("Renders demo KPIs.")
    expect(annotated?.consumes).toEqual(["demo:dashboard"])

    const bare = manifest.widgets.find((w) => w.id === "demo:bare")
    expect(bare?.description).toBeUndefined()
    expect(bare?.consumes).toBeUndefined()
  })

  it("surfaces step description and optionalKeys when present, omits when absent", () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register(
      step({
        id: "demo:annotated",
        description: "Loads demo dashboard data.",
        optionalKeys: [
          { key: "demo:processKey", description: "Scope to one process." },
          { key: "demo:period", enum: ["1d", "7d"] },
        ],
      }),
    )
    stepRegistry.register(step({ id: "demo:bare" }))

    const manifest = getFrameworkManifest(stepRegistry, new WidgetRegistry(), emptyConfig)
    const annotated = manifest.steps.find((s) => s.id === "demo:annotated")
    expect(annotated?.description).toBe("Loads demo dashboard data.")
    expect(annotated?.optionalKeys).toEqual([
      { key: "demo:processKey", description: "Scope to one process." },
      { key: "demo:period", enum: ["1d", "7d"] },
    ])

    const bare = manifest.steps.find((s) => s.id === "demo:bare")
    expect(bare?.description).toBeUndefined()
    expect(bare?.optionalKeys).toBeUndefined()
  })

  it("keyContracts mirrors optionallyConsumedBy from optionalKeys", () => {
    const stepRegistry = new StepRegistry()
    stepRegistry.register(
      step({
        id: "demo:scoper",
        optionalKeys: [{ key: "demo:processKey" }],
      }),
    )
    const manifest = getFrameworkManifest(stepRegistry, new WidgetRegistry(), emptyConfig)
    const contract = manifest.keyContracts.find((c) => c.key === "demo:processKey")
    expect(contract).toEqual({
      key: "demo:processKey",
      producedBy: [],
      consumedBy: [],
      optionallyConsumedBy: ["demo:scoper"],
    })
  })
})
