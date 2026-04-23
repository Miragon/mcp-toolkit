import { describe, it, expect, vi } from "vitest"
import type { DeclarativeStep } from "@miragon/mcp-toolkit-proxy-contract"
import { buildStepFromDeclaration, dotPath } from "./declarative-step.js"
import type { PipelineContext } from "../types/context.js"

const baseContext = (): PipelineContext => ({
  steps: {},
  keys: {},
  errors: [],
})

const resolveItemStep: DeclarativeStep = {
  id: "items-ui:resolve-item",
  dataType: "items-ui:item",
  requires: ["items-ui:itemId"],
  produces: ["items-ui:item"],
  tool: "get-item",
  inputMapping: { id: "keys.items-ui:itemId" },
  outputMapping: { "items-ui:item": "result" },
}

describe("dotPath", () => {
  it("returns the root value for an empty path", () => {
    const root = { a: 1 }
    expect(dotPath(root, "")).toBe(root)
  })

  it("resolves nested plain-object keys", () => {
    expect(dotPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42)
  })

  it("treats namespaced keys as a single segment", () => {
    expect(dotPath({ keys: { "items-ui:itemId": "abc" } }, "keys.items-ui:itemId")).toBe("abc")
  })

  it("returns undefined on a missing intermediate", () => {
    expect(dotPath({ a: 1 }, "a.b.c")).toBeUndefined()
  })

  it("returns undefined when traversing null", () => {
    expect(dotPath({ a: null }, "a.b")).toBeUndefined()
  })
})

describe("buildStepFromDeclaration", () => {
  it("projects requires/produces/dataType onto the compiled step", () => {
    const step = buildStepFromDeclaration(resolveItemStep, "items-ui")
    expect(step.id).toBe("items-ui:resolve-item")
    expect(step.dataType).toBe("items-ui:item")
    expect(step.requires).toEqual(["items-ui:itemId"])
    expect(step.produces).toEqual(["items-ui:item"])
  })

  it("maps input args from keys and writes output keys from the tool response", async () => {
    const callTool = vi.fn().mockResolvedValue({ result: { id: "abc", name: "Widget" } })
    const step = buildStepFromDeclaration(resolveItemStep, "items-ui")
    const ctx = baseContext()
    ctx.keys["items-ui:itemId"] = "abc"

    const output = await step.execute(ctx, { callTool })

    expect(callTool).toHaveBeenCalledWith("get-item", { id: "abc" })
    expect(output._app).toBe("items-ui")
    expect(output._step).toBe("items-ui:resolve-item")
    expect(output.keys).toEqual({ "items-ui:item": { id: "abc", name: "Widget" } })
    expect(output.data).toEqual({ result: { id: "abc", name: "Widget" } })
  })

  it("throws a descriptive error when callTool is not bound", async () => {
    const step = buildStepFromDeclaration(resolveItemStep, "items-ui")
    await expect(step.execute(baseContext(), {})).rejects.toThrow(/no callTool bound/)
  })

  it("writes undefined for output paths that do not resolve", async () => {
    const callTool = vi.fn().mockResolvedValue({ result: {} })
    const step = buildStepFromDeclaration(
      {
        ...resolveItemStep,
        outputMapping: { "items-ui:item": "result.missing.path" },
      },
      "items-ui",
    )
    const output = await step.execute(baseContext(), { callTool })
    expect(output.keys).toEqual({ "items-ui:item": undefined })
  })

  it("reads inputs from step outputs via the `steps` mapping root", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true })
    const step = buildStepFromDeclaration(
      {
        ...resolveItemStep,
        inputMapping: { id: "steps.resolve.keys.items-ui:itemId" },
      },
      "items-ui",
    )
    const ctx = baseContext()
    ctx.steps.resolve = {
      data: null,
      keys: { "items-ui:itemId": "xyz" },
      _app: "items-ui",
      _step: "items-ui:resolve-item",
      _dataType: "items-ui:item",
    }
    await step.execute(ctx, { callTool })
    expect(callTool).toHaveBeenCalledWith("get-item", { id: "xyz" })
  })
})
