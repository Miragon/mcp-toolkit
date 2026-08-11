#!/usr/bin/env node
/**
 * Ratchet self-protection (FITNESS.md, phase 2b).
 *
 * The fastest way for an agent to turn a red build green is to lower the
 * threshold — a rule-shaped commit nobody reads as a regression. This gate
 * compares every ratchet file against the merge-base of the target branch
 * and fails on any move in the forbidden direction:
 *
 *   ratchets/coverage-thresholds.json   raise-only; entries never removed
 *   ratchets/eslint-ratchets.json       shrink-only; no new/raised entries
 *   packages/<pkg>/stryker.config.json  thresholds.break raise-only;
 *                                       `mutate` grow-only — removing a
 *                                       pattern is allowed ONLY when break
 *                                       rises in the same diff
 *   knip.json                           ignore lists shrink-only
 *   packages/ui/ui-catalog.allowlist.json  exemptions shrink-only
 *
 * The SINGLE documented escape is a commit trailer in the PR range:
 *
 *   Ratchet-Exception: <reason>
 *
 * which downgrades the failures to loud warnings (CODEOWNERS review still
 * applies to every PR). There is no other bypass.
 *
 * Run: node scripts/check-ratchets.mjs   (CI needs fetch-depth: 0)
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const EXCEPTION_TRAILER = /^Ratchet-Exception: .+/m

/** Compare one ratchet file's old and new parsed JSON; returns violation strings. */
export function compareRatchets(relPath, oldJson, newJson) {
  if (oldJson === null || oldJson === undefined) return [] // newly introduced file
  const violations = []
  const kind = path.basename(relPath)

  if (kind === "coverage-thresholds.json") {
    for (const [pkg, oldEntry] of Object.entries(oldJson)) {
      if (pkg === "$comment") continue
      const newEntry = newJson?.[pkg]
      if (!newEntry) {
        violations.push(
          `${relPath} -> "${pkg}" was removed. Coverage floors are raise-only and never deleted. Restore the entry; raise it when coverage grows.`,
        )
        continue
      }
      for (const [metric, oldValue] of Object.entries(oldEntry)) {
        const newValue = newEntry[metric]
        if (typeof newValue !== "number") {
          violations.push(
            `${relPath} -> ${pkg}.${metric} was removed (was ${oldValue}). Coverage floors are raise-only and never deleted.`,
          )
        } else if (newValue < oldValue) {
          violations.push(
            `${relPath} -> ${pkg}.${metric}: ${oldValue} -> ${newValue}. Ratchets are raise-only — lowering is forbidden. Write the missing tests instead (see the uncovered paths: pnpm --filter <pkg> run test:coverage).`,
          )
        }
      }
    }
    return violations
  }

  if (kind === "eslint-ratchets.json") {
    for (const rule of Object.keys(newJson ?? {})) {
      if (rule === "$comment") continue
      for (const [file, newValue] of Object.entries(newJson[rule] ?? {})) {
        const oldValue = oldJson[rule]?.[file]
        if (oldValue === undefined) {
          violations.push(
            `${relPath} -> new ${rule} entry "${file}" (${newValue}). The debt list only shrinks — fix the file (split it / simplify it) instead of freezing new debt.`,
          )
        } else if (newValue > oldValue) {
          violations.push(
            `${relPath} -> ${rule} "${file}": ${oldValue} -> ${newValue}. The debt list only shrinks — refactor the file back under its frozen value instead of raising it.`,
          )
        }
      }
    }
    return violations
  }

  if (kind === "stryker.config.json") {
    const oldBreak = oldJson?.thresholds?.break
    const newBreak = newJson?.thresholds?.break
    const breakRaised =
      typeof newBreak === "number" && typeof oldBreak === "number" && newBreak > oldBreak
    if (typeof oldBreak === "number" && (typeof newBreak !== "number" || newBreak < oldBreak)) {
      violations.push(
        `${relPath} -> thresholds.break: ${oldBreak} -> ${String(newBreak)}. The mutation floor is raise-only — kill the surviving mutants (write the missing assertions) instead of lowering it.`,
      )
    }
    const oldMutate = Array.isArray(oldJson?.mutate) ? oldJson.mutate : []
    const newMutate = Array.isArray(newJson?.mutate) ? newJson.mutate : []
    // Negated globs invert the direction: removing "!x" or adding "x" GROWS
    // the measured surface (allowed); removing "x" or adding "!x" SHRINKS it.
    const shrinkers = [
      ...oldMutate.filter((p) => !p.startsWith("!") && !newMutate.includes(p)),
      ...newMutate.filter((p) => p.startsWith("!") && !oldMutate.includes(p)),
    ]
    if (shrinkers.length > 0 && !breakRaised) {
      violations.push(
        `${relPath} -> mutate allowlist shrank (${shrinkers.join(", ")}) without raising thresholds.break. Shrinking the measured surface "improves" the score by measuring less — allowed ONLY together with a break raise for the remaining surface.`,
      )
    }
    return violations
  }

  if (kind === "knip.json") {
    const collectIgnores = (node, prefix, into) => {
      if (!node || typeof node !== "object") return
      for (const [key, value] of Object.entries(node)) {
        if (
          ["ignore", "ignoreDependencies", "ignoreBinaries"].includes(key) &&
          Array.isArray(value)
        ) {
          for (const item of value) into.add(`${prefix}${key}: ${String(item)}`)
        } else if (value && typeof value === "object") {
          collectIgnores(value, `${prefix}${key}.`, into)
        }
      }
    }
    const oldIgnores = new Set()
    const newIgnores = new Set()
    collectIgnores(oldJson, "", oldIgnores)
    collectIgnores(newJson ?? {}, "", newIgnores)
    for (const entry of newIgnores) {
      if (!oldIgnores.has(entry)) {
        violations.push(
          `${relPath} -> new ignore entry "${entry}". Ignore lists are shrink-only — delete the dead code / declare the dependency instead of ignoring it.`,
        )
      }
    }
    return violations
  }

  if (kind === "ui-catalog.allowlist.json") {
    const exportsOf = (json) =>
      new Set((Array.isArray(json?.allow) ? json.allow : []).map((row) => String(row?.export)))
    const oldExports = exportsOf(oldJson)
    for (const name of exportsOf(newJson)) {
      if (!oldExports.has(name)) {
        violations.push(
          `${relPath} -> new allowlist entry "${name}". The ui-catalog allowlist is shrink-only — add a ui-catalog.json entry instead (the catalog is what prompting agents read), or don't export the symbol from a barrel.`,
        )
      }
    }
    return violations
  }

  return violations
}

/** All monitored ratchet files, present or not. */
export function monitoredFiles(root) {
  const files = [
    "ratchets/eslint-ratchets.json",
    "ratchets/coverage-thresholds.json",
    "packages/ui/ui-catalog.allowlist.json",
    "knip.json",
  ]
  const packagesDir = path.join(root, "packages")
  if (fs.existsSync(packagesDir)) {
    for (const pkg of fs.readdirSync(packagesDir)) {
      files.push(`packages/${pkg}/stryker.config.json`)
    }
  }
  return files
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

  const baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/main"

  let mergeBase
  try {
    mergeBase = git("merge-base", baseRef, "HEAD").trim()
  } catch {
    console.error(
      `check-ratchets: cannot compute merge-base against ${baseRef}. In CI, check out with fetch-depth: 0; locally, fetch origin first. Refusing to skip silently.`,
    )
    process.exit(1)
  }

  // No skip path: comparing identical states yields zero violations anyway
  // (push to the base branch), and skipping would let uncommitted local
  // tampering through. The working tree is always the "new" side.
  const head = git("rev-parse", "HEAD").trim()
  if (mergeBase === head) {
    console.log(
      `check-ratchets: HEAD is the merge-base with ${baseRef} — comparing the working tree against it.`,
    )
  }

  const violations = []
  for (const rel of monitoredFiles(repoRoot)) {
    let oldJson = null
    try {
      oldJson = JSON.parse(git("show", `${mergeBase}:${rel}`))
    } catch {
      oldJson = null // absent on the base — introduction is allowed
    }
    let newJson = null
    const abs = path.join(repoRoot, rel)
    if (fs.existsSync(abs)) {
      try {
        newJson = JSON.parse(fs.readFileSync(abs, "utf8"))
      } catch {
        violations.push(`${rel} is not valid JSON — a broken ratchet file disables the gate.`)
        continue
      }
    }
    violations.push(...compareRatchets(rel, oldJson, newJson))
  }

  if (violations.length === 0) {
    console.log("check-ratchets: all ratchets move in the right direction.")
    process.exit(0)
  }

  const commitMessages = git("log", `${mergeBase}..HEAD`, "--format=%B")
  const hasException = EXCEPTION_TRAILER.test(commitMessages)

  for (const violation of violations) {
    if (hasException) {
      console.log(`::warning::RATCHET EXCEPTION APPLIED — ${violation}`)
    } else {
      console.error(`RATCHET VIOLATION ${violation}`)
    }
  }

  if (hasException) {
    const reason = commitMessages.match(EXCEPTION_TRAILER)?.[0] ?? ""
    console.log(
      `check-ratchets: ${violations.length} violation(s) waved through by commit trailer "${reason}". Reviewers: this is the single documented escape — check the reason.`,
    )
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### ⚠️ Ratchet exception applied\n\n\`${reason}\`\n\n${violations.map((v) => `- ${v}`).join("\n")}\n`,
      )
    }
    process.exit(0)
  }

  console.error(
    `\ncheck-ratchets: ${violations.length} violation(s). Ratchets only move one way — fix the code, not the threshold. The single escape (requires review): add a commit trailer "Ratchet-Exception: <reason>".`,
  )
  process.exit(1)
}
