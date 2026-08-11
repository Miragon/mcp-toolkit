#!/usr/bin/env node
/**
 * PR-scoped mutation gate (FITNESS.md, phase 4): mutates ONLY the changed
 * files that fall inside a package's `mutate` allowlist (the tested surface,
 * grow-only — guarded by scripts/check-ratchets.mjs).
 *
 * Loud-skip contract (never silent):
 *  - no changed file in any allowlist  -> ::notice::  + SKIPPED.json + exit 0
 *  - more than CAP files changed      -> ::warning:: + SKIPPED.json + exit 0
 *    (run the full sweep via the mutation-full workflow instead)
 *
 * Glob semantics come from picomatch — the same family Stryker uses. NEVER
 * hand-roll the matching: the reference implementation shortened `**` to one
 * path segment and nested files silently fell out of the gate.
 *
 * Cache policy: `incremental` is false in every stryker.config.json and any
 * stray incremental cache is deleted before the run — an incremental cache
 * mixes other files' results into a diff score (green locally, red on a
 * fresh CI checkout).
 *
 * Run: node scripts/mutation-diff.mjs   (CI needs fetch-depth: 0)
 */
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import picomatch from "picomatch"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CAP = 25

const PACKAGES = [
  { dir: "packages/core", filter: "@miragon/mcp-toolkit-core" },
  { dir: "packages/ui", filter: "@miragon/mcp-toolkit-ui" },
  { dir: "packages/tool-codegen", filter: "@miragon/mcp-toolkit-tool-codegen" },
]

/**
 * Intersect repo-relative changed files with a package's mutate allowlist.
 * Returns package-relative paths. Exported for the gate self-tests.
 */
export function intersectAllowlist(changedFiles, pkgDir, mutateGlobs) {
  const includes = mutateGlobs.filter((g) => !g.startsWith("!"))
  const excludes = mutateGlobs.filter((g) => g.startsWith("!")).map((g) => g.slice(1))
  const isIncluded = picomatch(includes)
  const isExcluded = excludes.length > 0 ? picomatch(excludes) : () => false
  const prefix = `${pkgDir}/`
  return changedFiles
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length))
    .filter((rel) => isIncluded(rel) && !isExcluded(rel))
}

function writeSkipped(reason, detail) {
  const dir = path.join(repoRoot, "reports", "mutation")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, "SKIPPED.json"),
    JSON.stringify({ skipped: true, reason, detail }, null, 2) + "\n",
    "utf8",
  )
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
      `mutation-diff: cannot compute merge-base against ${baseRef}. Check out with fetch-depth: 0. Refusing to skip silently.`,
    )
    process.exit(1)
  }

  const changed = git("diff", "--name-only", mergeBase).split("\n").filter(Boolean)

  const hitsPerPackage = PACKAGES.map((pkg) => {
    const configPath = path.join(repoRoot, pkg.dir, "stryker.config.json")
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
    return { ...pkg, hits: intersectAllowlist(changed, pkg.dir, config.mutate) }
  })

  const totalHits = hitsPerPackage.reduce((n, p) => n + p.hits.length, 0)
  if (totalHits === 0) {
    console.log(
      "::notice::Mutation diff gate: no changed file falls inside a mutate allowlist — no run.",
    )
    writeSkipped("no-mutable-changes", { changed: changed.length })
    process.exit(0)
  }
  if (totalHits > CAP) {
    console.log(
      `::warning::Mutation diff gate SKIPPED: ${totalHits} changed allowlisted files exceed the cap of ${CAP}. Run the full sweep instead: gh workflow run mutation-full.yml (or locally: pnpm --filter <pkg> exec stryker run).`,
    )
    writeSkipped("cap-exceeded", { totalHits, cap: CAP })
    process.exit(0)
  }

  let failed = false
  for (const pkg of hitsPerPackage) {
    if (pkg.hits.length === 0) continue
    console.log(`mutation-diff: ${pkg.dir} — mutating ${pkg.hits.join(", ")}`)
    // throwaway cache: an incremental file would mix other files' results
    // into this diff-scoped score
    fs.rmSync(path.join(repoRoot, pkg.dir, ".stryker-incremental.json"), { force: true })
    const run = spawnSync(
      "pnpm",
      ["--filter", pkg.filter, "exec", "stryker", "run", "--mutate", pkg.hits.join(",")],
      { cwd: repoRoot, stdio: "inherit" },
    )
    if (run.status !== 0) {
      console.error(
        `mutation-diff: ${pkg.dir} fell below its thresholds.break — the changed code contains mutants no test catches. Write assertions that kill them (see the survived list above); do NOT lower the threshold or shrink the allowlist.`,
      )
      failed = true
    }
  }
  process.exit(failed ? 1 : 0)
}
