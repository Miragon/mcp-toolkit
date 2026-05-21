import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import { resolveActiveModules } from "./active-modules.js"

describe("resolveActiveModules", () => {
  const known = ["analytics", "lexoffice", "miranum"]
  let warnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("returns every known module when envValue is undefined", () => {
    expect(resolveActiveModules(undefined, known)).toEqual(known)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("returns every known module when envValue is empty / whitespace only", () => {
    expect(resolveActiveModules("", known)).toEqual(known)
    expect(resolveActiveModules("   ", known)).toEqual(known)
  })

  it('returns every known module for the literal "all" sentinel', () => {
    expect(resolveActiveModules("all", known)).toEqual(known)
  })

  it("returns the subset matching a comma-separated list", () => {
    expect(resolveActiveModules("analytics,lexoffice", known)).toEqual(["analytics", "lexoffice"])
  })

  it("trims whitespace around comma-separated entries", () => {
    expect(resolveActiveModules(" analytics , lexoffice ", known)).toEqual([
      "analytics",
      "lexoffice",
    ])
  })

  it("drops empty segments produced by stray commas without warning", () => {
    expect(resolveActiveModules("analytics,,lexoffice,", known)).toEqual(["analytics", "lexoffice"])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("warns and skips unknown entries without throwing", () => {
    const result = resolveActiveModules("analytics,typo,lexoffice", known)
    expect(result).toEqual(["analytics", "lexoffice"])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/unknown module "typo"/)
  })

  it("returns an empty array when every requested entry is unknown", () => {
    expect(resolveActiveModules("ghost,typo", known)).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it("preserves the order of the requested entries (not the known order)", () => {
    expect(resolveActiveModules("miranum,analytics", known)).toEqual(["miranum", "analytics"])
  })
})
