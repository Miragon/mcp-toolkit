import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"
import coverageThresholds from "../../ratchets/coverage-thresholds.json"
import eslintRatchets from "../../ratchets/eslint-ratchets.json"

/**
 * Ratchet wiring self-test (FITNESS.md, phase 2): the thresholds only gate
 * anything while (a) they exist as real numbers and (b) the configs actually
 * read them. A PR that deletes a threshold block or unhooks a config from the
 * ratchet file turns this suite red — the direction of the VALUES is guarded
 * separately by scripts/check-ratchets.mjs (phase 2b).
 */

const COVERAGE_PACKAGES = ["core", "ui", "tool-codegen"] as const
const COVERAGE_METRICS = ["statements", "branches", "functions", "lines"] as const

describe("coverage ratchet wiring", () => {
  it("declares all four metrics as positive numbers for every package", () => {
    for (const pkg of COVERAGE_PACKAGES) {
      const entry = coverageThresholds[pkg]
      expect(
        entry,
        `ratchets/coverage-thresholds.json must keep an entry for "${pkg}"`,
      ).toBeTruthy()
      for (const metric of COVERAGE_METRICS) {
        const value = entry[metric]
        expect(
          typeof value === "number" && value > 0,
          `${pkg}.${metric} must be a positive number (got ${String(value)}) — thresholds are raise-only, never deleted`,
        ).toBe(true)
      }
    }
  })

  it("every package vitest config reads the ratchet file and enables thresholds", async () => {
    for (const pkg of COVERAGE_PACKAGES) {
      const config = await fs.readFile(
        path.join(REPO_ROOT, "packages", pkg, "vitest.config.ts"),
        "utf8",
      )
      expect(
        config.includes("ratchets/coverage-thresholds.json"),
        `packages/${pkg}/vitest.config.ts must import ratchets/coverage-thresholds.json — inlining (or dropping) the thresholds would bypass the phase-2b diff-check`,
      ).toBe(true)
      expect(
        config.includes("thresholds:"),
        `packages/${pkg}/vitest.config.ts must wire coverage.thresholds`,
      ).toBe(true)
    }
  })
})

describe("eslint ratchet hygiene", () => {
  it("every ratcheted file still exists (prune entries when files are split away)", async () => {
    const files = [
      ...Object.keys(eslintRatchets["max-lines"]),
      ...Object.keys(eslintRatchets.complexity),
    ]
    for (const rel of files) {
      await expect(
        fs.access(path.join(REPO_ROOT, rel)),
        `${rel} is listed in ratchets/eslint-ratchets.json but does not exist — remove the entry (shrink-only) instead of leaving a dead override`,
      ).resolves.toBeUndefined()
    }
  })

  it("entries stay above the global budgets (below-budget entries must be removed)", () => {
    for (const [file, max] of Object.entries(eslintRatchets["max-lines"])) {
      expect(
        max,
        `${file} max-lines ratchet must exceed the 400 budget or be removed`,
      ).toBeGreaterThan(400)
    }
    for (const [file, max] of Object.entries(eslintRatchets.complexity)) {
      expect(
        max,
        `${file} complexity ratchet must exceed the 15 budget or be removed`,
      ).toBeGreaterThan(15)
    }
  })

  it("the eslint config actually consumes the ratchet file", async () => {
    const config = await fs.readFile(path.join(REPO_ROOT, "eslint.config.mjs"), "utf8")
    expect(config.includes("ratchets/eslint-ratchets.json")).toBe(true)
  })
})
