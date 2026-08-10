#!/usr/bin/env node
// Static pre-publish contract check for every publishable package.
//
// npm's OIDC provenance publishing verifies the tarball's package.json
// `repository.url` against the repo recorded in the signed attestation. A
// missing/mismatched field fails the real publish with E422 — and a
// `pnpm publish --dry-run` cannot catch it, because that validation only
// happens server-side on the actual PUT. This script encodes the same
// contract so it fails fast on every PR instead of at release time.
//
// Run: `pnpm verify:publish-metadata` (also wired into CI).

import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const REPO = "github.com/Miragon/mcp-toolkit"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const packagesDir = join(root, "packages")

// Normalize any npm-accepted repository URL form to `host/owner/repo`, matching
// how npm compares it against the provenance source repo.
const normalize = (url) =>
  url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^(https?:\/\/|ssh:\/\/git@|git@)/, "")
    .replace(/:/, "/") // scp-style git@github.com:owner/repo
    .replace(/\.git$/, "")
    .replace(/\/$/, "")

const errors = []

for (const name of readdirSync(packagesDir)) {
  const pkgPath = join(packagesDir, name, "package.json")
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  } catch {
    continue // no package.json in this dir
  }

  if (pkg.private === true) continue // not published, skip

  const label = pkg.name ?? `packages/${name}`
  const repo = pkg.repository

  if (!repo || typeof repo !== "object") {
    errors.push(`${label}: missing "repository" object (needed for npm provenance).`)
    continue
  }
  if (!repo.url) {
    errors.push(`${label}: "repository.url" is empty.`)
  } else if (normalize(repo.url) !== REPO) {
    errors.push(
      `${label}: "repository.url" normalizes to "${normalize(repo.url)}", expected "${REPO}".`,
    )
  }
  const expectedDir = `packages/${name}`
  if (repo.directory !== expectedDir) {
    errors.push(
      `${label}: "repository.directory" is "${repo.directory ?? "(missing)"}", expected "${expectedDir}".`,
    )
  }
}

if (errors.length > 0) {
  console.error("✗ Publish-metadata contract violated:\n")
  for (const e of errors) console.error("  - " + e)
  console.error("\nAdd/fix the `repository` field so `pnpm publish --provenance` succeeds.")
  process.exit(1)
}

console.log("✓ Publish-metadata contract OK for all published packages.")
