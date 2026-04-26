import { describe, it, expect } from "vitest"
import { StepRegistry } from "./step-registry.js"
import { WidgetRegistry } from "./widget-registry.js"
import type { PipelineStepDefinition } from "../types/step.js"
import type { WidgetDefinition } from "../types/widget.js"

const step = (id: string, requires: string[], produces: string[]): PipelineStepDefinition => ({
  id,
  dataType: "test:data",
  requires,
  produces,
  execute: () =>
    Promise.resolve({
      data: null,
      keys: {},
      _app: "test",
      _step: id,
      _dataType: "test:data",
    }),
})

const widget = (id: string, requires: string[]): WidgetDefinition => ({
  id,
  requires,
  size: "full",
})

describe("StepRegistry", () => {
  it("registers and retrieves a step by id", () => {
    const reg = new StepRegistry()
    const s = step("a", [], ["k"])
    reg.register(s)
    expect(reg.get("a")).toBe(s)
  })

  it("returns undefined for unknown step ids", () => {
    expect(new StepRegistry().get("nope")).toBeUndefined()
  })

  it("throws on duplicate registration", () => {
    const reg = new StepRegistry()
    reg.register(step("a", [], []))
    expect(() => reg.register(step("a", [], []))).toThrow(/Step ID collision/)
  })

  it("getAll returns every registered step", () => {
    const reg = new StepRegistry()
    reg.register(step("a", [], []))
    reg.register(step("b", [], []))
    expect(
      reg
        .getAll()
        .map((s) => s.id)
        .sort(),
    ).toEqual(["a", "b"])
  })

  it("getKeyContracts maps every key to its producers and consumers", () => {
    const reg = new StepRegistry()
    reg.register(step("producer", [], ["k"]))
    reg.register(step("consumer1", ["k"], []))
    reg.register(step("consumer2", ["k"], []))

    const contracts = reg.getKeyContracts()
    const k = contracts.find((c) => c.key === "k")
    expect(k).toBeDefined()
    expect(k!.producedBy).toEqual(["producer"])
    expect(k!.consumedBy.sort()).toEqual(["consumer1", "consumer2"])
  })

  it("getKeyContracts includes keys produced but never consumed (and vice versa)", () => {
    const reg = new StepRegistry()
    reg.register(step("p", [], ["produced-only"]))
    reg.register(step("c", ["consumed-only"], []))

    const contracts = reg.getKeyContracts()
    expect(contracts.find((c) => c.key === "produced-only")).toEqual({
      key: "produced-only",
      producedBy: ["p"],
      consumedBy: [],
    })
    expect(contracts.find((c) => c.key === "consumed-only")).toEqual({
      key: "consumed-only",
      producedBy: [],
      consumedBy: ["c"],
    })
  })
})

describe("WidgetRegistry", () => {
  it("registers and retrieves a widget by id", () => {
    const reg = new WidgetRegistry()
    const w = widget("w1", [])
    reg.register(w)
    expect(reg.get("w1")).toBe(w)
  })

  it("returns undefined for unknown widget ids", () => {
    expect(new WidgetRegistry().get("nope")).toBeUndefined()
  })

  it("throws on duplicate registration", () => {
    const reg = new WidgetRegistry()
    reg.register(widget("w1", []))
    expect(() => reg.register(widget("w1", []))).toThrow(/Widget ID collision/)
  })

  it("findByRequiredKeys returns widgets whose requires are all in the available set", () => {
    const reg = new WidgetRegistry()
    const wAll = widget("all", ["a", "b"])
    const wPartial = widget("partial", ["a"])
    const wNone = widget("none", [])
    reg.register(wAll)
    reg.register(wPartial)
    reg.register(wNone)

    expect(reg.findByRequiredKeys(["a", "b"])).toEqual([wAll, wPartial, wNone])
    expect(reg.findByRequiredKeys(["a"])).toEqual([wPartial, wNone])
    expect(reg.findByRequiredKeys([])).toEqual([wNone])
  })
})
