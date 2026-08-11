#!/usr/bin/env node
/**
 * Flakiness gate for changed tests (FITNESS.md, phase 5c).
 *
 * A flaky test is an invitation to weaken its assertion. New/changed test
 * files run 3x sequentially; any file that both passes and fails across the
 * runs is FLAKY and the gate is red with the house fixes (inject clocks like
 * store.test.ts, allocate ports via listen(0), never sleep-and-hope).
 * `retry:` is banned separately by check-test-erosion.mjs — retries mask
 * flakiness instead of fixing it.
 *
 * Loud-degrade contract: more than CAP changed test files -> ONE full run
 * now, the nightly 3x sweep covers repetition (::warning::, never silent).
 *
 * Run: node scripts/check-flakiness.mjs   (CI needs fetch-depth: 0)
 */
import { execFileSync, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CAP = 10
const RUNS = 3

const SUITES = [
  { prefix: "packages/core/", filter: "@miragon/mcp-toolkit-core" },
  { prefix: "packages/ui/", filter: "@miragon/mcp-toolkit-ui" },
  { prefix: "packages/tool-codegen/", filter: "@miragon/mcp-toolkit-tool-codegen" },
  { prefix: "examples/", filter: "@miragon/mcp-toolkit-examples" },
]

/** Group changed test files by suite; returns [{filter, files(rel to pkg)}]. Exported for tests. */
export function groupChangedTests(changedFiles) {
  const groups = []
  for (const suite of SUITES) {
    const files = changedFiles
      .filter((f) => f.startsWith(suite.prefix) && /\.test\.tsx?$/.test(f))
      .map((f) => f.slice(suite.prefix.length))
    if (files.length > 0) groups.push({ filter: suite.filter, files })
  }
  return groups
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" })
  const baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/main"
  let mergeBase
  try {
    mergeBase = git("merge-base", baseRef, "HEAD").trim()
  } catch {
    console.error(
      `check-flakiness: cannot compute merge-base against ${baseRef}. Check out with fetch-depth: 0. Refusing to skip silently.`,
    )
    process.exit(1)
  }

  const changed = git("diff", "--name-only", mergeBase).split("\n").filter(Boolean)
  const existing = new Set(git("ls-files", "*.test.ts", "*.test.tsx").split("\n").filter(Boolean))
  const groups = groupChangedTests(changed.filter((f) => existing.has(f)))
  const total = groups.reduce((n, g) => n + g.files.length, 0)

  if (total === 0) {
    console.log("::notice::Flakiness gate: no changed test files — no repeat runs needed.")
    process.exit(0)
  }
  if (total > CAP) {
    console.log(
      `::warning::Flakiness gate degraded: ${total} changed test files exceed the cap of ${CAP} — running each ONCE now; the nightly 3x full sweep covers repetition.`,
    )
  }
  const runs = total > CAP ? 1 : RUNS

  let flaky = false
  for (const group of groups) {
    const results = []
    for (let i = 1; i <= runs; i++) {
      console.log(`check-flakiness: ${group.filter} run ${i}/${runs} — ${group.files.join(", ")}`)
      const run = spawnSync(
        "pnpm",
        ["--filter", group.filter, "exec", "vitest", "run", ...group.files],
        {
          cwd: repoRoot,
          stdio: "inherit",
        },
      )
      results.push(run.status === 0)
    }
    const passes = results.filter(Boolean).length
    if (passes > 0 && passes < results.length) {
      flaky = true
      console.error(
        `FLAKY: ${group.filter} — ${group.files.join(", ")} passed ${passes}/${results.length} runs. Make it deterministic: inject the clock (see examples/modules/orders/store.test.ts), allocate ports via listen(0), never sleep-and-poll. Do NOT add retry: — check-test-erosion bans it.`,
      )
    } else if (passes === 0) {
      flaky = true
      console.error(
        `check-flakiness: ${group.filter} failed all ${results.length} runs — a plain test failure, fix it.`,
      )
    }
  }
  process.exit(flaky ? 1 : 0)
}
