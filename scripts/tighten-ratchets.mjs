#!/usr/bin/env node
/**
 * Tightens ratchets/eslint-ratchets.json after a refactor: re-measures every
 * listed file with the ratchet overrides DISABLED (FITNESS_RATCHET_MEASURE=1,
 * so the global budgets report true values) and then only ever LOWERS or
 * REMOVES entries — never raises one (growth is blocked by the lint gate
 * itself; the direction of this file is guarded by scripts/check-ratchets.mjs).
 *
 * Run: pnpm fitness:tighten
 */
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ratchetPath = path.join(repoRoot, "ratchets", "eslint-ratchets.json")

const roundUp10 = (n) => Math.ceil(n / 10) * 10

const ratchets = JSON.parse(await fs.readFile(ratchetPath, "utf8"))
const files = [
  ...new Set([...Object.keys(ratchets["max-lines"]), ...Object.keys(ratchets.complexity)]),
]
if (files.length === 0) {
  console.log("No ratchet entries — nothing to tighten.")
  process.exit(0)
}

let stdout
try {
  ;({ stdout } = await execFileAsync(
    path.join(repoRoot, "node_modules", ".bin", "eslint"),
    ["--format", "json", ...files],
    {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, FITNESS_RATCHET_MEASURE: "1" },
    },
  ))
} catch (error) {
  // eslint exits non-zero when the budgets fire — that IS the measurement.
  stdout = error.stdout ?? ""
  if (!stdout) throw error
}

/** measured[file] = { "max-lines": n | undefined, complexity: n | undefined } */
const measured = {}
for (const result of JSON.parse(stdout)) {
  const rel = path.relative(repoRoot, result.filePath)
  for (const message of result.messages) {
    if (message.ruleId === "max-lines") {
      const match = /too many lines \((\d+)\)/.exec(message.message)
      if (match) {
        measured[rel] ??= {}
        measured[rel]["max-lines"] = Math.max(measured[rel]["max-lines"] ?? 0, Number(match[1]))
      }
    }
    if (message.ruleId === "complexity") {
      const match = /complexity of (\d+)/.exec(message.message)
      if (match) {
        measured[rel] ??= {}
        measured[rel].complexity = Math.max(measured[rel].complexity ?? 0, Number(match[1]))
      }
    }
  }
}

const changes = []
for (const rule of ["max-lines", "complexity"]) {
  for (const [file, current] of Object.entries(ratchets[rule])) {
    const value = measured[file]?.[rule]
    if (value === undefined) {
      delete ratchets[rule][file]
      changes.push(`${rule} ${file}: ${current} -> removed (now within budget)`)
      continue
    }
    const tightened = Math.min(current, roundUp10(value))
    if (tightened < current) {
      ratchets[rule][file] = tightened
      changes.push(`${rule} ${file}: ${current} -> ${tightened} (measured ${value})`)
    }
  }
}

if (changes.length === 0) {
  console.log("Ratchets already tight — no entry can be lowered.")
  process.exit(0)
}

await fs.writeFile(ratchetPath, JSON.stringify(ratchets, null, 2) + "\n", "utf8")
console.log("Tightened ratchets/eslint-ratchets.json:")
for (const line of changes) console.log(`  ${line}`)
console.log("Run prettier and commit the shrink together with the refactor that earned it.")
