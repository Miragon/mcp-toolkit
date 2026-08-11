#!/usr/bin/env node
/**
 * Nightly template pack-and-install gate (FITNESS.md, phase 5b): proves the
 * starter template installs and typechecks against the packages AS PUBLISHED
 * (packed tarballs, dist types, exports maps) — not against workspace source
 * aliases. This is the deep half of the template gate; the PR-fast half is
 * `examples/tsconfig.template-check.json`.
 *
 * Flow, each step failing loudly on its own:
 *   1. pack packages/{core,ui,tool-codegen} into a fresh os.tmpdir() dir
 *      (`pnpm -r build` is assumed to have run — dist is prechecked);
 *   2. copy templates/minimal-server there (node_modules excluded);
 *   3. rewrite the copy's @miragon/* deps to the file: tarballs;
 *   4. `pnpm install --no-frozen-lockfile` + `pnpm typecheck` in the copy.
 *
 * A failure here means the SHIPPED starter is broken for consumers even
 * though the workspace is green — fix the package exports/types or the
 * template, never this check.
 *
 * Run: node scripts/check-template-install.mjs
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PACKAGES = [
  "@miragon/mcp-toolkit-core",
  "@miragon/mcp-toolkit-ui",
  "@miragon/mcp-toolkit-tool-codegen",
]
const DIST_PRECHECK = ["packages/core/dist", "packages/ui/dist", "packages/tool-codegen/dist"]

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-toolkit-template-install-"))

function fail(step, detail) {
  console.error(`check-template-install FAILED at step "${step}": ${detail}`)
  console.error(`work dir kept for inspection: ${tmpDir}`)
  process.exit(1)
}

function run(step, command, args, cwd) {
  console.log(`check-template-install [${step}]: ${command} ${args.join(" ")} (cwd ${cwd})`)
  const result = spawnSync(command, args, { cwd, stdio: "inherit" })
  if (result.error) fail(step, `could not spawn ${command}: ${result.error.message}`)
  if (result.status !== 0) fail(step, `${command} exited with status ${result.status}`)
}

// ── 0. precheck: built artifacts exist (the caller runs `pnpm -r build`) ──
for (const dist of DIST_PRECHECK) {
  if (!fs.existsSync(path.join(repoRoot, dist))) {
    fail("precheck", `${dist} is missing — run \`pnpm -r build\` before this script`)
  }
}

// ── 1. pack the workspace packages into the temp dir ──
for (const pkg of PACKAGES) {
  const result = spawnSync("pnpm", ["--filter", pkg, "pack", "--pack-destination", tmpDir], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  if (result.error) fail("pack", `could not spawn pnpm: ${result.error.message}`)
  if (result.status !== 0) {
    console.error(result.stdout)
    console.error(result.stderr)
    fail("pack", `pnpm pack of ${pkg} exited with status ${result.status}`)
  }
}
const tarballFor = (pkg) => {
  // @miragon/mcp-toolkit-core → miragon-mcp-toolkit-core-<version>.tgz
  const stem = pkg.replace(/^@/, "").replace("/", "-")
  const match = fs.readdirSync(tmpDir).find((f) => f.startsWith(`${stem}-`) && f.endsWith(".tgz"))
  if (!match) {
    fail("pack", `no tarball ${stem}-*.tgz found in ${tmpDir} — pnpm pack produced nothing?`)
  }
  return path.join(tmpDir, match)
}
const tarballs = Object.fromEntries(PACKAGES.map((pkg) => [pkg, tarballFor(pkg)]))
console.log(`check-template-install [pack]: ${Object.values(tarballs).join(", ")}`)

// ── 2. copy the template (sans node_modules) next to the tarballs ──
const templateSrc = path.join(repoRoot, "templates", "minimal-server")
const templateDir = path.join(tmpDir, "minimal-server")
fs.cpSync(templateSrc, templateDir, {
  recursive: true,
  filter: (src) => !src.split(path.sep).includes("node_modules"),
})

// ── 3. rewrite @miragon/* deps to the packed tarballs ──
const manifestPath = path.join(templateDir, "package.json")
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
let rewritten = 0
for (const section of ["dependencies", "devDependencies"]) {
  for (const dep of Object.keys(manifest[section] ?? {})) {
    if (!dep.startsWith("@miragon/")) continue
    if (!tarballs[dep]) {
      fail("rewrite", `template depends on ${dep} but this script packs no such package`)
    }
    manifest[section][dep] = `file:${tarballs[dep]}`
    rewritten += 1
  }
}
if (rewritten === 0) {
  fail("rewrite", "the template declares no @miragon/* deps — this gate no longer tests anything")
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`check-template-install [rewrite]: ${rewritten} @miragon/* dep(s) → file: tarballs`)

// ── 4. install + typecheck the copy like a consumer would ──
run("install", "pnpm", ["install", "--no-frozen-lockfile"], templateDir)
run("typecheck", "pnpm", ["typecheck"], templateDir)

fs.rmSync(tmpDir, { recursive: true, force: true })
console.log("check-template-install OK: template installs and typechecks against packed tarballs")
