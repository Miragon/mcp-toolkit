import fs from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GOLDEN_HINT, goldenPath, loadOrUpdateGolden, stableSort } from "../helpers/golden.js"

/**
 * Gate self-test for the golden mechanism itself (FITNESS.md: a gate that
 * has never been red is decoration). Uses a scratch golden name so the real
 * goldens stay untouched.
 */

const SCRATCH = "helper-selftest"

afterEach(() => {
  fs.rmSync(goldenPath(SCRATCH), { force: true })
  vi.unstubAllEnvs()
})

describe("golden helper", () => {
  it("stableSort sorts keys recursively and keeps array order", () => {
    expect(JSON.stringify(stableSort({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } }))).toBe(
      '{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}',
    )
  })

  it("a missing golden fails with the update instruction, never auto-creates", () => {
    expect(() => loadOrUpdateGolden(SCRATCH, { a: 1 })).toThrow(/GOLDEN_UPDATE=1/)
    expect(fs.existsSync(goldenPath(SCRATCH))).toBe(false)
  })

  it("GOLDEN_UPDATE writes locally and the next plain run compares against it", () => {
    vi.stubEnv("GOLDEN_UPDATE", "1")
    vi.stubEnv("CI", "")
    loadOrUpdateGolden(SCRATCH, { b: 2, a: 1 })
    vi.unstubAllEnvs()
    expect(loadOrUpdateGolden(SCRATCH, { irrelevant: true })).toEqual({ a: 1, b: 2 })
  })

  it("GOLDEN_UPDATE is forbidden in CI", () => {
    vi.stubEnv("GOLDEN_UPDATE", "1")
    vi.stubEnv("CI", "true")
    expect(() => loadOrUpdateGolden(SCRATCH, { a: 1 })).toThrow(/forbidden in CI/)
    expect(fs.existsSync(goldenPath(SCRATCH))).toBe(false)
  })

  it("the hint tells the next agent the one legitimate path", () => {
    expect(GOLDEN_HINT).toContain("GOLDEN_UPDATE=1")
    expect(GOLDEN_HINT).toContain("NEVER edit a golden by hand")
  })
})
