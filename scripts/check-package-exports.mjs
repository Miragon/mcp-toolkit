#!/usr/bin/env node
/**
 * Package-exports gate (FITNESS.md, phase 5a): proves every published
 * package's `exports` map resolves against the BUILT artifacts, from a
 * consumer's perspective. Runs after `pnpm -r build`.
 *
 *  - publint: exports/files/dist consistency (catches e.g. the load-bearing
 *    `"./globals.css" -> ./src/globals.css` + `files: ["dist","src",…]`
 *    coupling in ui, and tool-codegen's `./templates/*`).
 *  - attw --pack: type resolvability of every subpath as consumers see it.
 *
 * Fix the package.json exports/files (or the build), never this check.
 *
 * Run: node scripts/check-package-exports.mjs
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { publint } from "publint"
import { formatMessage } from "publint/utils"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * The CSS asset exports of a package (`./globals.css`, `./theme.css`, …).
 * attw models entrypoints as JS/TS and can never type-resolve a stylesheet;
 * publint still verifies each file exists. Derived from the exports map, so
 * a new stylesheet export needs no edit here.
 */
function cssEntrypoints(pkgDir) {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, pkgDir, "package.json"), "utf8"))
  return Object.keys(manifest.exports ?? {}).filter((key) => key.endsWith(".css"))
}

const PACKAGES = [
  { dir: "packages/core", attwArgs: [] },
  { dir: "packages/ui", attwArgs: ["--exclude-entrypoints", ...cssEntrypoints("packages/ui")] },
  { dir: "packages/tool-codegen", attwArgs: [] },
]

let failed = false

for (const { dir: pkgDir, attwArgs } of PACKAGES) {
  const pkg = pkgDir
  const dir = path.join(repoRoot, pkgDir)
  const { messages, pkg: manifest } = await publint({ pkgDir: dir, level: "warning" })
  const errors = messages.filter((m) => m.type === "error")
  const warnings = messages.filter((m) => m.type !== "error")
  for (const message of warnings) {
    console.warn(`publint ${pkg}: ${formatMessage(message, manifest)}`)
  }
  if (errors.length > 0) {
    failed = true
    for (const message of errors) {
      console.error(`publint ${pkg} ERROR: ${formatMessage(message, manifest)}`)
    }
    console.error(
      `publint ${pkg}: the exports map does not match the built package — fix package.json exports/files or the build output, never this check.`,
    )
  }

  const attw = spawnSync(
    path.join(repoRoot, "node_modules", ".bin", "attw"),
    ["--pack", dir, "--profile", "esm-only", ...attwArgs],
    { cwd: repoRoot, encoding: "utf8" },
  )
  if (attw.status !== 0) {
    failed = true
    console.error(attw.stdout)
    console.error(
      `attw ${pkg}: a subpath's types do not resolve from a consumer's perspective — fix the exports map / declaration output.`,
    )
  } else {
    console.log(`exports OK: ${pkg} (publint ${errors.length} errors, attw clean)`)
  }
}

process.exit(failed ? 1 : 0)
