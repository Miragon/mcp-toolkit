import { describe, expect, it, vi } from "vitest"
import type { PipelineContext } from "@miragon/mcp-toolkit-core"
import {
  contextHasNoData,
  mergeAliasProps,
  resolveAliasComponents,
  type WidgetComponent,
} from "./widget-renderer.js"

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

describe("mergeAliasProps", () => {
  it("lets the layout cell override preset keys one by one", () => {
    expect(
      mergeAliasProps({ scope: "all", limit: 5, title: "Preset" }, { scope: "mine", extra: true }),
    ).toEqual({ scope: "mine", limit: 5, title: "Preset", extra: true })
  })

  it("returns the preset props when the cell has none", () => {
    expect(mergeAliasProps({ scope: "all" }, undefined)).toEqual({ scope: "all" })
  })

  it("returns the cell props when there is no preset", () => {
    expect(mergeAliasProps(undefined, { scope: "mine" })).toEqual({ scope: "mine" })
  })

  it("returns undefined (not {}) when both are absent", () => {
    expect(mergeAliasProps(undefined, undefined)).toBeUndefined()
  })
})

describe("resolveAliasComponents", () => {
  const hostWidget: WidgetComponent = () => null

  it("maps each alias id to a wrapper over the registered host component", () => {
    const resolved = resolveAliasComponents(
      {
        "customers:orders-kpi": { hostWidget: "orders:kpi", presetProps: { scope: "all" } },
        "customers:plain": { hostWidget: "orders:kpi" },
      },
      { "orders:kpi": hostWidget },
    )
    expect(Object.keys(resolved).sort()).toEqual(["customers:orders-kpi", "customers:plain"])
    expect(typeof resolved["customers:orders-kpi"]).toBe("function")
    // The wrapper is a new component, not the bare target — it merges preset
    // props under cell props before delegating.
    expect(resolved["customers:orders-kpi"]).not.toBe(hostWidget)
  })

  it("warns and skips an alias whose target is not in the bundle map — without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      const resolved = resolveAliasComponents(
        {
          "customers:orders-kpi": { hostWidget: "orders:kpi" },
          "customers:missing": { hostWidget: "not:bundled" },
        },
        { "orders:kpi": hostWidget },
      )
      expect(Object.keys(resolved)).toEqual(["customers:orders-kpi"])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain('"customers:missing"')
      expect(warn.mock.calls[0]?.[0]).toContain('"not:bundled"')
    } finally {
      warn.mockRestore()
    }
  })

  it("returns an empty map for an empty manifest", () => {
    expect(resolveAliasComponents({}, { "orders:kpi": hostWidget })).toEqual({})
  })
})
