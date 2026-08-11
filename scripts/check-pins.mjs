#!/usr/bin/env node
/**
 * Local equivalent of the miragon/pin-npm-dependencies CI action (FITNESS.md):
 * every dependency in every tracked package.json is an exact pin — no ^ ~ >=
 * < x * ranges. Allowed non-numeric forms: workspace:, file:, npm:, catalog:.
 *
 * Run: node scripts/check-pins.mjs
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function findRangeViolations(manifest) {
  const bad = []
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (typeof version !== "string") continue
      if (/^(workspace:|file:|npm:|catalog:|https?:)/.test(version)) continue
      if (!/^\d/.test(version) || /[\^~*x<>= ]/.test(version)) {
        bad.push(`${field}.${name}: "${version}"`)
      }
    }
  }
  return bad
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const files = execFileSync(
    "git",
    ["ls-files", "package.json", "*/package.json", "**/package.json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  )
    .split("\n")
    .filter(Boolean)
  let failed = false
  for (const rel of [...new Set(files)]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"))
    const bad = findRangeViolations(manifest)
    if (bad.length > 0) {
      failed = true
      console.error(
        `check-pins: ${rel} uses version ranges: ${bad.join(", ")}. Pin the exact version (pnpm add <pkg>, then copy the resolved version from pnpm-lock.yaml — .claude/rules/package-json-fixed-versions.md).`,
      )
    }
  }
  if (!failed) console.log("check-pins: every dependency is an exact pin.")
  process.exit(failed ? 1 : 0)
}
