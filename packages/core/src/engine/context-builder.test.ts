import { describe, it, expect } from "vitest"
import { validatePipeline } from "./context-builder.js"
import { StepRegistry } from "../registry/step-registry.js"
import type { PipelineStepDefinition } from "../types/step.js"

const noopStep = (id: string, requires: string[], produces: string[]): PipelineStepDefinition => ({
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

describe("validatePipeline", () => {
  it("succeeds when every step's requires are produced by an earlier step", () => {
    const registry = new StepRegistry()
    registry.register(noopStep("a", [], ["test:x"]))
    registry.register(noopStep("b", ["test:x"], ["test:y"]))

    const result = validatePipeline(
      {
        steps: [
          { id: "a-ref", step: "a" },
          { id: "b-ref", step: "b" },
        ],
      },
      registry,
    )
    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.availableKeys).toEqual(expect.arrayContaining(["test:x", "test:y"]))
  })

  it("reports a missing requires key and names the consuming step ref", () => {
    const registry = new StepRegistry()
    registry.register(noopStep("b", ["test:x"], []))

    const result = validatePipeline({ steps: [{ id: "b-ref", step: "b" }] }, registry)

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([
      'Step "b-ref" requires key "test:x" but no earlier step produces it',
    ])
  })

  it("reports unregistered required steps", () => {
    const registry = new StepRegistry()
    const result = validatePipeline({ steps: [{ id: "ghost", step: "missing" }] }, registry)

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(['Step "missing" not registered'])
  })

  it("ignores unregistered steps when marked optional", () => {
    const registry = new StepRegistry()
    const result = validatePipeline(
      { steps: [{ id: "ghost", step: "missing", optional: true }] },
      registry,
    )

    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it("honours initialKeys when validating requires", () => {
    const registry = new StepRegistry()
    registry.register(noopStep("a", ["test:bootstrap"], []))

    const result = validatePipeline({ steps: [{ id: "a-ref", step: "a" }] }, registry, [
      "test:bootstrap",
    ])

    expect(result.valid).toBe(true)
    expect(result.availableKeys).toEqual(expect.arrayContaining(["test:bootstrap"]))
  })

  it("treats an empty pipeline (no steps) as valid", () => {
    expect(validatePipeline({}, new StepRegistry())).toEqual({
      valid: true,
      issues: [],
      availableKeys: [],
    })
  })
})
