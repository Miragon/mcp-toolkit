import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"
import { parseActiveModules, resolveActiveModules } from "./active-modules.js"

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

  it("drops :qualifier suffixes, returning only the module names", () => {
    expect(resolveActiveModules("analytics:prod,lexoffice", known)).toEqual([
      "analytics",
      "lexoffice",
    ])
  })
})

describe("parseActiveModules", () => {
  const known = ["analytics", "lexoffice", "miranum"]
  let warnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("returns every known module (no qualifier) when envValue is empty / unset / all", () => {
    const expected = known.map((name) => ({ name }))
    expect(parseActiveModules(undefined, known)).toEqual(expected)
    expect(parseActiveModules("", known)).toEqual(expected)
    expect(parseActiveModules("   ", known)).toEqual(expected)
    expect(parseActiveModules("all", known)).toEqual(expected)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("splits a name:qualifier token into name and qualifier", () => {
    expect(parseActiveModules("analytics:prod", known)).toEqual([
      { name: "analytics", qualifier: "prod" },
    ])
  })

  it("returns name-only entries (qualifier omitted) for bare names", () => {
    expect(parseActiveModules("lexoffice", known)).toEqual([{ name: "lexoffice" }])
  })

  it("mixes qualified and bare entries in request order", () => {
    expect(parseActiveModules("miranum:eu, analytics , lexoffice:test", known)).toEqual([
      { name: "miranum", qualifier: "eu" },
      { name: "analytics" },
      { name: "lexoffice", qualifier: "test" },
    ])
  })

  it("splits only on the first colon so qualifiers may contain colons", () => {
    expect(parseActiveModules("analytics:https://host:8080", known)).toEqual([
      { name: "analytics", qualifier: "https://host:8080" },
    ])
  })

  it("treats an empty qualifier (trailing colon) as no qualifier", () => {
    expect(parseActiveModules("analytics:", known)).toEqual([{ name: "analytics" }])
    expect(parseActiveModules("analytics:   ", known)).toEqual([{ name: "analytics" }])
  })

  it("warns and skips unknown module names while keeping their qualifier out", () => {
    const result = parseActiveModules("analytics:prod,typo:x,lexoffice", known)
    expect(result).toEqual([{ name: "analytics", qualifier: "prod" }, { name: "lexoffice" }])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/unknown module "typo"/)
  })

  it("drops empty segments from stray commas without warning", () => {
    expect(parseActiveModules("analytics,,lexoffice,", known)).toEqual([
      { name: "analytics" },
      { name: "lexoffice" },
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
