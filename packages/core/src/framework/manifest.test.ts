import { describe, it, expect } from "vitest"
import { getFrameworkManifest } from "./manifest.js"
import { StepRegistry } from "../registry/step-registry.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { AppConfig } from "../types/config.js"
import type { WidgetDefinition } from "../types/widget.js"

const emptyConfig: AppConfig = { activeApps: [], pipelines: {} }

const widget = (overrides: Partial<WidgetDefinition>): WidgetDefinition => ({
  id: "demo:widget",
  requires: [],
  size: "full",
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
})
