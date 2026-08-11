import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * CI wiring self-test (FITNESS.md, phase 2b): a gate that no CI job runs is
 * decoration. A PR that deletes a gate step from ci.yml (or drops the full
 * history the ratchet diff-check needs) turns this suite red — so the gates
 * cannot be disarmed silently.
 */

describe("ci.yml runs every fitness gate", () => {
  const REQUIRED_STEPS = [
    "pnpm depcruise:dist", // dist reachability (build job, needs dist)
    "pnpm -r --if-present run test:coverage", // tests + coverage floors
    "pnpm lint:templates", // templates are outside pnpm -r
    "pnpm depcruise", // source-level dependency rules
    "node scripts/check-ratchets.mjs", // ratchet self-protection
    "run generate:check:ci", // codegen drift vs committed generated/
    "pnpm format:check",
    "pnpm -r run lint",
    "pnpm -r run typecheck",
  ]

  it("contains every required gate step", async () => {
    const ci = await fs.readFile(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8")
    for (const step of REQUIRED_STEPS) {
      expect(
        ci.includes(step),
        `ci.yml must run "${step}" — removing a gate from CI disarms it silently`,
      ).toBe(true)
    }
  })

  it("checks out full history for the ratchet diff-check", async () => {
    const ci = await fs.readFile(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8")
    expect(
      ci.includes("fetch-depth: 0"),
      "the quality job needs fetch-depth: 0 — a shallow checkout has no merge-base and check-ratchets refuses to run",
    ).toBe(true)
  })

  it("pnpm verify runs the same gates locally", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    const verify = pkg.scripts.verify
    expect(verify, "root package.json must keep a verify script").toBeTruthy()
    if (!verify) return
    for (const fragment of [
      "typecheck",
      "build",
      "depcruise",
      "depcruise:dist",
      "test:coverage",
      "lint",
      "lint:templates",
      "check-ratchets",
      "format:check",
    ]) {
      expect(
        verify.includes(fragment),
        `pnpm verify must include "${fragment}" (local == CI)`,
      ).toBe(true)
    }
  })
})
