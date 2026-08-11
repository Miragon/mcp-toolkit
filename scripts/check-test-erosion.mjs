#!/usr/bin/env node
/**
 * Test-erosion diff gate (FITNESS.md, phase 5a): the complement of the
 * anti-erosion lint rules — those see the current tree, this sees the DIFF.
 * Red when, against the target branch's merge-base:
 *
 *  - a *.test.ts(x) file was deleted without a same-basename replacement
 *    anywhere in the tree (CLAUDE.md: "replace, don't delete")
 *  - a package's total test-case count (`it(`/`test(`) net-decreased
 *  - a vitest config or test file introduces `retry:` (retries MASK
 *    flakiness — fix the cause; the phase-5c flakiness gate finds it)
 *
 * The single escape is the same commit trailer the ratchet gate honours:
 * `Ratchet-Exception: <reason>` (downgrades to loud warnings; CODEOWNERS
 * review still applies).
 *
 * Run: node scripts/check-test-erosion.mjs   (CI needs fetch-depth: 0)
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const EXCEPTION_TRAILER = /^Ratchet-Exception: .+/m
const SUITES = ["packages/core", "packages/ui", "packages/tool-codegen", "examples"]

export function countTestCases(content) {
  return (content.match(/\b(?:it|test)\s*\(/g) ?? []).length
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
      `check-test-erosion: cannot compute merge-base against ${baseRef}. Check out with fetch-depth: 0. Refusing to skip silently.`,
    )
    process.exit(1)
  }

  const violations = []

  // 1. Deleted test files without replacement
  const status = git("diff", "--name-status", mergeBase)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
  const currentTestFiles = git("ls-files", "*.test.ts", "*.test.tsx").split("\n").filter(Boolean)
  for (const [flag, file] of status) {
    if (flag !== "D" || !/\.test\.tsx?$/.test(file ?? "")) continue
    const basename = path.basename(file)
    const replacement = currentTestFiles.find((f) => path.basename(f) === basename)
    if (!replacement) {
      violations.push(
        `test file ${file} was deleted without a same-name replacement. CLAUDE.md: replace a test with one that pins the NEW contract — never delete it to make CI green. Restore it or add the replacement.`,
      )
    }
  }

  // 2. Net test-count decrease per suite
  for (const suite of SUITES) {
    const countAt = (ref) => {
      const files = git("ls-tree", "-r", "--name-only", ref, suite)
        .split("\n")
        .filter((f) => /\.test\.tsx?$/.test(f))
      let n = 0
      for (const f of files) {
        try {
          n += countTestCases(git("show", `${ref}:${f}`))
        } catch {
          /* file unreadable at ref — skip */
        }
      }
      return n
    }
    const countNow = () => {
      const files = git("ls-files", `${suite}/**/*.test.ts`, `${suite}/**/*.test.tsx`)
        .split("\n")
        .filter(Boolean)
      let n = 0
      for (const f of files) {
        try {
          n += countTestCases(fs.readFileSync(path.join(repoRoot, f), "utf8"))
        } catch {
          /* deleted in worktree */
        }
      }
      return n
    }
    const before = countAt(mergeBase)
    const after = countNow()
    if (after < before) {
      violations.push(
        `${suite}: test-case count fell ${before} -> ${after}. Removing cases needs a replacement pinning the new contract (or the Ratchet-Exception trailer with a reason).`,
      )
    }
  }

  // 3. retry: creeping into vitest configs or tests
  const diffText = git(
    "diff",
    "--unified=0",
    mergeBase,
    "--",
    "*.test.ts",
    "*.test.tsx",
    "*vitest.config.ts",
  )
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++") && /\bretry\s*:/.test(line)) {
      violations.push(
        `a diff line introduces "retry:" (${line.trim().slice(0, 80)}). Retries mask flakiness — make the test deterministic instead (inject clocks, listen(0) for ports); the flakiness gate exists to find these.`,
      )
    }
  }

  if (violations.length === 0) {
    console.log("check-test-erosion: no erosion against the merge-base.")
    process.exit(0)
  }

  const hasException = EXCEPTION_TRAILER.test(git("log", `${mergeBase}..HEAD`, "--format=%B"))
  for (const v of violations) {
    if (hasException) console.log(`::warning::EROSION EXCEPTION APPLIED — ${v}`)
    else console.error(`TEST EROSION ${v}`)
  }
  if (hasException) {
    console.log(
      "check-test-erosion: waved through by Ratchet-Exception trailer — reviewers, check the reason.",
    )
    process.exit(0)
  }
  console.error(
    `\ncheck-test-erosion: ${violations.length} violation(s). The single escape (requires review): commit trailer "Ratchet-Exception: <reason>".`,
  )
  process.exit(1)
}
