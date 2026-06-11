import { describe, expect, it } from "vitest"
import type { PipelineContext } from "@miragon/mcp-toolkit-core"
import { contextHasNoData } from "./widget-renderer.js"

const ctx = (over: Partial<PipelineContext> = {}): PipelineContext => ({
  steps: {},
  keys: {},
  errors: [],
  ...over,
})

describe("contextHasNoData", () => {
  it("is true for an empty context (no steps, no keys)", () => {
    expect(contextHasNoData(ctx())).toBe(true)
  })

  it("is true even when there are errors but no data", () => {
    expect(contextHasNoData(ctx({ errors: [{ stepId: "x", reason: "boom" }] }))).toBe(true)
  })

  it("is false when keys are present", () => {
    expect(contextHasNoData(ctx({ keys: { "demo:id": "INV-1" } }))).toBe(false)
  })

  it("is false when step data is present", () => {
    expect(
      contextHasNoData(
        ctx({
          steps: {
            result: {
              data: { total: 1 },
              keys: {},
              _app: "demo",
              _step: "result",
              _dataType: "demo:data",
            },
          },
        }),
      ),
    ).toBe(false)
  })
})
