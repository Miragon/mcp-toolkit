#!/usr/bin/env node
/**
 * Package-exports check: proves every published package's `exports` map resolves against the
 * BUILT artifacts, from a consumer's perspective. Runs after `pnpm build`.
 *
 *  - publint: exports/files/dist consistency.
 *  - attw --pack: type resolvability of every entrypoint as consumers see it.
 *  - source maps: every packed .map points only at files the tarball holds (or embeds its
 *    sources); a map into the unpacked src/ leads debuggers and stack traces nowhere.
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

const PACKAGES = [
  "packages/tool-codegen",
  "packages/tool-codegen-core",
  "packages/tool-codegen-react",
]

let failed = false

/** The packed files' paths, as `npm pack --dry-run` lists them. */
function packedFiles(dir) {
  const pack = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: dir,
    encoding: "utf8",
  })
  if (pack.status !== 0) throw new Error(`npm pack failed in ${dir}:\n${pack.stderr}`)
  const result = JSON.parse(pack.stdout)
  const [entry] = Array.isArray(result) ? result : Object.values(result)
  return new Set(entry.files.map((file) => file.path))
}

/** The sources of packed maps that are neither packed nor embedded. */
function danglingMapSources(dir) {
  const files = packedFiles(dir)
  return [...files]
    .filter((file) => file.endsWith(".map"))
    .flatMap((file) => {
      const map = JSON.parse(readFileSync(path.join(dir, file), "utf8"))
      const base = path.posix.join(path.posix.dirname(file), map.sourceRoot ?? "")
      return map.sources
        .filter((source, i) => map.sourcesContent?.[i] == null)
        .map((source) => path.posix.normalize(path.posix.join(base, source)))
        .filter((source) => !files.has(source))
        .map((source) => `${file} → ${source}`)
    })
}

for (const pkg of PACKAGES) {
  const dir = path.join(repoRoot, pkg)
  const { messages, pkg: manifest } = await publint({ pkgDir: dir, level: "warning" })
  const errors = messages.filter((m) => m.type === "error")
  for (const message of messages.filter((m) => m.type !== "error")) {
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
    ["--pack", dir, "--profile", "esm-only"],
    { cwd: repoRoot, encoding: "utf8" },
  )
  if (attw.status !== 0) {
    failed = true
    console.error(attw.error?.message ?? `${attw.stdout}${attw.stderr}`)
    console.error(
      `attw ${pkg}: an entrypoint's types do not resolve from a consumer's perspective — fix the exports map or the declaration output.`,
    )
  } else if (errors.length === 0) {
    console.log(`exports OK: ${pkg}`)
  }

  const dangling = danglingMapSources(dir)
  if (dangling.length > 0) {
    failed = true
    for (const entry of dangling) console.error(`maps ${pkg} ERROR: ${entry} is not in the tarball`)
    console.error(
      `maps ${pkg}: build without maps (tsconfig.build.json) or ship their sources; a dist left over from an earlier build needs pnpm clean && pnpm build.`,
    )
  }
}

process.exit(failed ? 1 : 0)
