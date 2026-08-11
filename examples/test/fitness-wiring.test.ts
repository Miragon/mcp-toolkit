import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"
import { GATES } from "../../scripts/gates.mjs"

/**
 * CI wiring self-test (FITNESS.md, phases 2b + 5c): a gate that no CI job
 * runs is decoration. Local and CI both execute scripts/gates.mjs — this
 * suite asserts (a) the manifest is well-formed, (b) the CI jobs' --only
 * subsets cover EVERY gate id (a gate dropped from all jobs = silent skip =
 * red here), and (c) the non-manifest jobs (mutation, fitness report) and
 * the full-history checkout stay wired.
 */

const readCi = () => fs.readFile(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8")

describe("gate manifest", () => {
  it("has unique ids and an imperative fix per gate", () => {
    const ids = GATES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const gate of GATES) {
      expect(gate.fix, `${gate.id} needs a fix instruction`).toBeTruthy()
      expect(gate.cmd.length, `${gate.id} needs a command`).toBeGreaterThan(0)
    }
  })

  it("pnpm verify runs the manifest runner", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.verify).toBe("node scripts/verify.mjs")
  })
})

describe("ci.yml covers the manifest", () => {
  it("the union of all --only subsets equals every gate id (no silent skip)", async () => {
    const ci = await readCi()
    const onlyLists = [...ci.matchAll(/verify\.mjs --only=([a-z0-9,-]+)/g)].map((m) => m[1]!)
    expect(onlyLists.length, "ci.yml must run verify.mjs subsets").toBeGreaterThanOrEqual(2)
    const covered = new Set(onlyLists.flatMap((l) => l.split(",")))
    for (const gate of GATES) {
      expect(
        covered.has(gate.id),
        `gate "${gate.id}" is in scripts/gates.mjs but NO ci.yml job runs it — a gate outside CI is decoration; add it to a job's --only list`,
      ).toBe(true)
    }
    for (const id of covered) {
      expect(
        GATES.some((g) => g.id === id),
        `ci.yml references unknown gate id "${id}" — verify.mjs would fail at startup`,
      ).toBe(true)
    }
  })

  it("keeps the non-manifest jobs and full-history checkout wired", async () => {
    const ci = await readCi()
    for (const fragment of [
      "node scripts/mutation-diff.mjs", // PR-scoped mutation gate (own job)
      "node scripts/fitness-report.mjs", // aggregated report job
      "fetch-depth: 0", // merge-base for the diff gates
      "miragon/pin-npm-dependencies", // belt-and-braces to the pins gate
    ]) {
      expect(ci.includes(fragment), `ci.yml must keep "${fragment}"`).toBe(true)
    }
  })
})
