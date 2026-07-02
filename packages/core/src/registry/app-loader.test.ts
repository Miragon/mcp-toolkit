import { afterEach, describe, expect, it, vi } from "vitest"
import { loadApps } from "./app-loader.js"
import { StepRegistry } from "./step-registry.js"
import { WidgetRegistry } from "./widget-registry.js"
import type { AppDefinition } from "../types/app.js"
import type { PipelineStepDefinition } from "../types/step.js"
import type { WidgetDefinition } from "../types/widget.js"

const step = (id: string): PipelineStepDefinition => ({
  id,
  dataType: "test:data",
  requires: [],
  produces: [id],
  execute: () =>
    Promise.resolve({
      data: null,
      keys: {},
      _app: "test",
      _step: id,
      _dataType: "test:data",
    }),
})

const widget = (id: string): WidgetDefinition => ({ id, requires: [], size: "full" })

const app = (name: string, stepIds: string[], widgetIds: string[]): AppDefinition => ({
  name,
  steps: stepIds.map(step),
  widgets: widgetIds.map(widget),
})

function registries() {
  return { steps: new StepRegistry(), widgets: new WidgetRegistry() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("loadApps — default (fail loud)", () => {
  it("registers every app's steps and widgets", () => {
    const { steps, widgets } = registries()
    const result = loadApps(
      [app("a", ["a:s"], ["a:w"]), app("b", ["b:s"], ["b:w"])],
      steps,
      widgets,
    )

    expect(result.loaded.map((a) => a.name)).toEqual(["a", "b"])
    expect(result.skipped).toEqual([])
    expect(steps.get("a:s")).toBeDefined()
    expect(widgets.get("b:w")).toBeDefined()
  })

  it("throws on a colliding step id (first-party bug should fail loud)", () => {
    const { steps, widgets } = registries()
    expect(() => loadApps([app("a", ["dup"], []), app("b", ["dup"], [])], steps, widgets)).toThrow(
      /Step ID collision/,
    )
  })
})

describe("loadApps — isolateFailures (untrusted upstream)", () => {
  it("skips a colliding module instead of throwing, and reports it", () => {
    const { steps, widgets } = registries()
    loadApps([app("first", ["shared:s"], [])], steps, widgets)

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = loadApps([app("second", ["shared:s"], [])], steps, widgets, {
      isolateFailures: true,
    })

    expect(result.loaded).toEqual([])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]?.app.name).toBe("second")
    expect(warn).toHaveBeenCalledOnce()
  })

  it("rolls back a module's partial registrations when a later id collides", () => {
    const { steps, widgets } = registries()
    // Pre-occupy the widget id the second module will collide on.
    loadApps([app("first", [], ["shared:w"])], steps, widgets)

    vi.spyOn(console, "warn").mockImplementation(() => {})
    // The bad module registers a fresh step "solo:s" first, then collides on
    // the widget — the step must be rolled back so no half-loaded module lingers.
    loadApps([app("bad", ["solo:s"], ["shared:w"])], steps, widgets, { isolateFailures: true })

    expect(steps.get("solo:s")).toBeUndefined()
    // The prior module's widget is untouched.
    expect(widgets.get("shared:w")).toBeDefined()
  })

  it("keeps loading good modules after skipping a bad one", () => {
    const { steps, widgets } = registries()
    loadApps([app("first", ["taken:s"], [])], steps, widgets)

    vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = loadApps(
      [app("collides", ["taken:s"], []), app("ok", ["fresh:s"], ["fresh:w"])],
      steps,
      widgets,
      { isolateFailures: true },
    )

    expect(result.skipped.map((s) => s.app.name)).toEqual(["collides"])
    expect(result.loaded.map((a) => a.name)).toEqual(["ok"])
    expect(steps.get("fresh:s")).toBeDefined()
    expect(widgets.get("fresh:w")).toBeDefined()
  })
})
