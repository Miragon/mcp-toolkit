import { describe, it, expect } from "vitest"
import { getFrameworkManifest, propsSchemaForModel } from "./manifest.js"
import { PROPS_SCHEMA_DISPLAY_KEYWORD } from "../types/display.js"
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
    expect(manifest.widgets[0]?.propsSchema).toBeUndefined()
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
    expect(manifest.widgets[0]?.propsSchema).toEqual(propsSchema)
  })

  it("leaves the properties' x-display texts (labels for people) out of the LLM's propsSchema", () => {
    const propsSchema = {
      type: "object",
      title: "Props",
      properties: {
        dataKey: {
          type: "string",
          description: "Context key holding the rows.",
          [PROPS_SCHEMA_DISPLAY_KEYWORD]: {
            title: { en: "Data", de: "Daten" },
            summary: { en: "Which data to show.", de: "Welche Daten du siehst." },
          },
        },
        limit: { type: "number", minimum: 1 },
      },
      required: ["dataKey"],
    }
    const widgetRegistry = new WidgetRegistry()
    widgetRegistry.register(widget({ id: "demo:labelled", propsSchema }))
    const manifest = getFrameworkManifest(new StepRegistry(), widgetRegistry, emptyConfig)
    expect(manifest.widgets[0]?.propsSchema).toEqual({
      type: "object",
      title: "Props",
      properties: {
        dataKey: { type: "string", description: "Context key holding the rows." },
        limit: { type: "number", minimum: 1 },
      },
      required: ["dataKey"],
    })
    expect(JSON.stringify(manifest)).not.toContain(PROPS_SCHEMA_DISPLAY_KEYWORD)
    expect(JSON.stringify(manifest)).not.toContain("Daten")
    // The widget's own schema is untouched: the builder still reads its labels.
    expect(propsSchema.properties.dataKey[PROPS_SCHEMA_DISPLAY_KEYWORD].title.de).toBe("Daten")
  })

  it("hands a propsSchema without display text on as the same object", () => {
    const plain = { type: "object", properties: { limit: { type: "number" } } }
    expect(propsSchemaForModel(plain)).toBe(plain)
    const noProperties = { type: "object" }
    expect(propsSchemaForModel(noProperties)).toBe(noProperties)
    const odd = { type: "object", properties: [{ [PROPS_SCHEMA_DISPLAY_KEYWORD]: {} }] }
    expect(propsSchemaForModel(odd)).toBe(odd)
    const nullProperty = { type: "object", properties: { x: null } }
    expect(propsSchemaForModel(nullProperty)).toBe(nullProperty)
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
