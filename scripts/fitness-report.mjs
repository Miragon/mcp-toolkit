#!/usr/bin/env node
/**
 * Aggregated fitness report (FITNESS.md, phase 4).
 *
 * READS EXISTING ARTIFACTS ONLY — never measures anything itself:
 *   packages/<pkg>/coverage/coverage-summary.json   (vitest json-summary)
 *   packages/<pkg>/reports/mutation/mutation.json   (stryker json reporter)
 *   reports/mutation/SKIPPED.json                   (mutation-diff loud skip)
 *   reports/knip.json                               (knip:report)
 *   reports/depcruise.json                          (depcruise:report)
 *   ratchets/*.json                                 (current floors/debt)
 *
 * A missing source renders as "no run" — never as a green cell and never as
 * an error (the artifact may legitimately not exist for this pipeline shape).
 * Numbers carry their scope: a diff-scoped mutation score is labelled as
 * such, and surfaces the mutation runner does not measure are named.
 *
 * Output: markdown to stdout; appended to $GITHUB_STEP_SUMMARY when set.
 *
 * Run: pnpm fitness
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PACKAGES = ["core", "ui", "tool-codegen"]

const readJson = (rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"))
  } catch {
    return null
  }
}

const lines = []
lines.push("## Fitness report")
lines.push("")

// ── Coverage per package ──
lines.push("### Coverage (floors are raise-only)")
lines.push("")
lines.push("| Package | Statements | Branches | Functions | Lines | Floor (st/br/fn/ln) |")
lines.push("| --- | --- | --- | --- | --- | --- |")
const floors = readJson("ratchets/coverage-thresholds.json")
for (const pkg of PACKAGES) {
  const summary = readJson(`packages/${pkg}/coverage/coverage-summary.json`)
  const floor = floors?.[pkg]
  const floorText = floor
    ? `${floor.statements}/${floor.branches}/${floor.functions}/${floor.lines}`
    : "—"
  if (!summary?.total) {
    lines.push(`| ${pkg} | no run | no run | no run | no run | ${floorText} |`)
    continue
  }
  const t = summary.total
  lines.push(
    `| ${pkg} | ${t.statements.pct}% | ${t.branches.pct}% | ${t.functions.pct}% | ${t.lines.pct}% | ${floorText} |`,
  )
}
lines.push("")
lines.push("_examples' smoke surface is deliberately not coverage-measured (FITNESS.md)._")
lines.push("")

// ── Mutation ──
lines.push("### Mutation (allowlist = tested surface, grow-only; break raise-only)")
lines.push("")
const skipped = readJson("reports/mutation/SKIPPED.json")
if (skipped?.skipped) {
  lines.push(
    `No mutation run this pipeline: **${skipped.reason}** (${JSON.stringify(skipped.detail)}).`,
  )
  lines.push("")
}
lines.push("| Package | Score | Killed | Survived | No coverage | Scope | break |")
lines.push("| --- | --- | --- | --- | --- | --- | --- |")
for (const pkg of PACKAGES) {
  const report = readJson(`packages/${pkg}/reports/mutation/mutation.json`)
  const config = readJson(`packages/${pkg}/stryker.config.json`)
  const breakAt = config?.thresholds?.break ?? "—"
  if (!report?.files) {
    lines.push(`| ${pkg} | no run | — | — | — | — | ${breakAt} |`)
    continue
  }
  let killed = 0
  let survived = 0
  let noCoverage = 0
  let timeout = 0
  const mutatedFiles = Object.keys(report.files).length
  for (const file of Object.values(report.files)) {
    for (const m of file.mutants) {
      if (m.status === "Killed") killed++
      else if (m.status === "Survived") survived++
      else if (m.status === "NoCoverage") noCoverage++
      else if (m.status === "Timeout") timeout++
    }
  }
  const valid = killed + timeout + survived + noCoverage
  const score = valid ? (((killed + timeout) / valid) * 100).toFixed(2) : "n/a"
  const allowlistCount = (config?.mutate ?? []).filter((g) => !g.startsWith("!")).length
  const scope = mutatedFiles < allowlistCount ? `diff (${mutatedFiles} file(s))` : `full allowlist`
  lines.push(
    `| ${pkg} | ${score}% | ${killed + timeout} | ${survived} | ${noCoverage} | ${scope} | ${breakAt} |`,
  )
}
lines.push("")
lines.push(
  "_The mutation score covers the mutate allowlists only — React/JSX render surfaces are NOT measured here (the render-coverage ratchet is the compensating control, phase 5c)._",
)
lines.push("")

// ── Dead code ──
lines.push("### Dead code (knip; ignore lists are shrink-only)")
lines.push("")
const knip = readJson("reports/knip.json")
if (!knip) {
  lines.push("no run")
} else {
  const count = (k) => (Array.isArray(knip[k]) ? knip[k].length : 0)
  const files = count("files")
  const issues = Array.isArray(knip.issues) ? knip.issues : []
  const sum = (k) => issues.reduce((n, i) => n + (Array.isArray(i[k]) ? i[k].length : 0), 0)
  lines.push(
    `Unused files: **${files}** · unused deps: **${sum("dependencies") + sum("devDependencies")}** · unlisted deps: **${sum("unlisted")}** · unused exports (report-only): **${sum("exports")}** · unused types (report-only): **${sum("types")}**`,
  )
}
lines.push("")

// ── Dependency rules ──
lines.push("### Dependency rules (dependency-cruiser)")
lines.push("")
const depcruise = readJson("reports/depcruise.json")
if (!depcruise?.summary) {
  lines.push("no run")
} else {
  const s = depcruise.summary
  lines.push(
    `Violations: **${s.violations.length}** (${s.error} errors, ${s.warn} warnings) over ${s.totalCruised} modules / ${s.totalDependenciesCruised} dependencies.`,
  )
}
lines.push("")

// ── Evals ──
lines.push("### Evals (nightly, pass rate is raise-only)")
lines.push("")
const evals = readJson("examples/evals/results.json")
const evalFloor = readJson("ratchets/eval-pass-rate.json")
if (!evals) {
  lines.push(
    "no run — evals execute nightly via eval.yml against a real model (needs ANTHROPIC_API_KEY).",
  )
} else {
  lines.push(
    `Model **${evals.model}** · pass rate **${(evals.passRate * 100).toFixed(1)}%** (floor ${((evalFloor?.minPassRate ?? 0) * 100).toFixed(1)}%) · ${evals.cases.length} cases x ${evals.runsPerCase} runs`,
  )
  for (const c of evals.cases) {
    const passes = c.runs.filter((r) => r.pass).length
    lines.push(`- ${c.id}: ${passes}/${c.runs.length}`)
  }
}
lines.push("")

// ── Debt ──
lines.push("### Ratchet debt (shrink-only)")
lines.push("")
const debt = readJson("ratchets/eslint-ratchets.json")
if (!debt) {
  lines.push("no ratchet file")
} else {
  const maxLines = Object.entries(debt["max-lines"] ?? {})
  const complexity = Object.entries(debt.complexity ?? {})
  if (maxLines.length === 0 && complexity.length === 0) {
    lines.push(
      "**Debt list is empty** — every file is within the global budgets (400 effective lines, complexity 15).",
    )
  } else {
    for (const [file, v] of maxLines) lines.push(`- max-lines ${file}: ${v}`)
    for (const [file, v] of complexity) lines.push(`- complexity ${file}: ${v}`)
  }
}
lines.push("")

const report = lines.join("\n")
console.log(report)
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n")
}
