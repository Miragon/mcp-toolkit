#!/usr/bin/env node
/**
 * The ONE verification command (FITNESS.md, phase 5c): runs the gate
 * manifest from scripts/gates.mjs in order, NO fail-fast (an agent should
 * see every finding in one run), prints the fix instruction per failed gate
 * and a summary table. No caches, no hidden state — every cmd is the naked
 * command; CI runs subsets of the SAME manifest via --only=<ids>.
 *
 * Run: pnpm verify            (all gates)
 *      node scripts/verify.mjs --only=lint,format
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { GATES } from "./gates.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const onlyArg = process.argv.find((a) => a.startsWith("--only="))
const only = onlyArg
  ? onlyArg
      .slice("--only=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null

if (only) {
  const known = new Set(GATES.map((g) => g.id))
  const unknown = only.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    console.error(
      `verify: unknown gate id(s): ${unknown.join(", ")}. Known: ${[...known].join(", ")}`,
    )
    process.exit(1)
  }
}

const selected = only ? GATES.filter((g) => only.includes(g.id)) : GATES
const results = []

for (const gate of selected) {
  console.log(`\n━━━ ${gate.id}: ${gate.title} ━━━`)
  const run = spawnSync(gate.cmd[0], gate.cmd.slice(1), { cwd: repoRoot, stdio: "inherit" })
  const ok = run.status === 0
  results.push({ id: gate.id, ok })
  if (!ok) console.error(`✖ ${gate.id} FAILED — fix: ${gate.fix}`)
}

console.log("\n━━━ verify summary ━━━")
for (const r of results) console.log(`${r.ok ? "✔" : "✖"} ${r.id}`)
const failed = results.filter((r) => !r.ok)
if (failed.length > 0) {
  console.error(`\nverify: ${failed.length} gate(s) red: ${failed.map((r) => r.id).join(", ")}`)
  process.exit(1)
}
console.log("\nverify: all gates green.")
