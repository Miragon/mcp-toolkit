#!/usr/bin/env node
/**
 * Standalone build gate (FITNESS.md, phase 5b): proves the mcp-use CLI can
 * still build `examples/standalone-host` — the views/ convention the docs and
 * the starter template rely on (one `views/<name>/view.tsx` per view-bound
 * tool, shared browser modules under `views/`).
 *
 * The script runs the REAL CLI build itself (after wiping the previous build
 * output so stale artifacts can never mask a broken build), then asserts the
 * artifacts the CLI promises:
 *
 *   .mcp-use/build/index.js                     — bundled server entry
 *   .mcp-use/build/manifest.json                — view manifest
 *   .mcp-use/build/views/<name>/assets/*.js/css — one built entry per view
 *
 * Expected view names are DISCOVERED from `views/<name>/view.tsx`, so adding
 * a view extends the gate automatically. Fix the views/ layout (or the CLI
 * pin), never this check.
 *
 * Run: node scripts/check-standalone-dist.mjs
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const hostDir = path.join(repoRoot, "examples", "standalone-host")
const buildDir = path.join(hostDir, ".mcp-use", "build")

const FIX_HINT =
  "the mcp-use CLI could not build standalone-host — views/<name>/view.tsx must " +
  "default-export the component; shared browser modules must live under views/ " +
  "(the dev server routes only views/* through its Vite middleware)."

function fail(reason) {
  console.error(`check-standalone-dist FAILED: ${reason}`)
  console.error(FIX_HINT)
  process.exit(1)
}

// Fresh build: a stale .mcp-use/build from an earlier run must never make a
// broken build look green.
if (fs.existsSync(buildDir)) {
  console.log(`check-standalone-dist: removing stale ${path.relative(repoRoot, buildDir)}`)
  fs.rmSync(buildDir, { recursive: true, force: true })
}

console.log("check-standalone-dist: running `mcp-use build` via build:standalone …")
const build = spawnSync(
  "pnpm",
  ["--filter", "@miragon/mcp-toolkit-examples", "run", "build:standalone"],
  { cwd: repoRoot, stdio: "inherit" },
)
if (build.error) fail(`could not spawn pnpm: ${build.error.message}`)
if (build.status !== 0) fail(`build:standalone exited with status ${build.status}`)

// The expected views are the convention itself: every views/<name>/view.tsx.
const viewsDir = path.join(hostDir, "views")
const expectedViews = fs
  .readdirSync(viewsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(viewsDir, e.name, "view.tsx")))
  .map((e) => e.name)
  .sort()
if (expectedViews.length === 0) {
  fail(
    `no views/<name>/view.tsx found under ${path.relative(repoRoot, viewsDir)} — ` +
      "the views/ convention moved and this gate no longer guards anything.",
  )
}

function assertNonEmptyFile(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} missing: ${path.relative(repoRoot, filePath)}`)
  if (fs.statSync(filePath).size === 0)
    fail(`${label} is empty: ${path.relative(repoRoot, filePath)}`)
}

assertNonEmptyFile(path.join(buildDir, "index.js"), "bundled server entry")

const manifestPath = path.join(buildDir, "manifest.json")
assertNonEmptyFile(manifestPath, "view manifest")
let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
} catch (error) {
  fail(`view manifest is not valid JSON (${error.message}): ${manifestPath}`)
}

for (const view of expectedViews) {
  const entry = manifest.views?.[view]
  if (!entry) {
    fail(
      `view "${view}" (from views/${view}/view.tsx) is missing from the build manifest — ` +
        `manifest lists: ${Object.keys(manifest.views ?? {}).join(", ") || "none"}`,
    )
  }
  const viewDir = path.join(buildDir, "views", view)
  if (typeof entry.entry !== "string" || entry.entry.length === 0) {
    fail(`view "${view}" has no js entry in the manifest`)
  }
  assertNonEmptyFile(path.join(viewDir, entry.entry), `view "${view}" js entry`)
  for (const css of entry.css ?? []) {
    assertNonEmptyFile(path.join(viewDir, css), `view "${view}" stylesheet`)
  }
}

console.log(
  `check-standalone-dist OK: index.js + manifest + built views [${expectedViews.join(", ")}]`,
)
