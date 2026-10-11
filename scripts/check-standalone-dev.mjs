#!/usr/bin/env node
/**
 * Standalone DEV-loop gate: the README's standard loop (`dev:standalone`, the
 * mcp-use CLI dev server over examples/standalone-host) must serve every view
 * with ONE `mcp-use/react` runtime.
 *
 * Why a dev gate next to the build gate (check-standalone-dist.mjs): the
 * production build dedupes `mcp-use`, the dev server does not. When pnpm
 * splits `mcp-use` into two peer variants (one for packages/ui, one for the
 * examples — see the peer pins in pnpm-workspace.yaml), the dev server serves
 * the toolkit's hooks from one copy and the view's `ViewRuntimeProvider` from
 * the other, and every widget renders mcp-use's bare "View error: mcp-use/react
 * hooks require a browser view mounted by bootstrapView". The build stays
 * green and only the dev loop breaks, so only a dev check catches it.
 *
 * What it does, per view discovered from `views/<name>/view.tsx`:
 *   1. boots `mcp-use dev --no-inspector` on a free port,
 *   2. reads the view resource (`ui://views/<name>.html`) over MCP,
 *   3. crawls the ES-module graph the dev server serves for that view,
 *   4. asserts the graph reaches the toolkit's view shell and loads
 *      `mcp-use/react` from exactly ONE package directory.
 *
 * No browser: this is the module graph a browser would execute, not a
 * screenshot (browser E2E against hosts stays a recorded non-goal in
 * CLAUDE.md). Requires the workspace build (packages/ui resolves through
 * dist). Fix the dependency graph, never this check.
 *
 * Run: node scripts/check-standalone-dev.mjs
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const examplesDir = path.join(repoRoot, "examples")
const viewsDir = path.join(examplesDir, "standalone-host", "views")
const BOOT_TIMEOUT_MS = 90_000
const MAX_MODULES = 3_000

const FIX_HINT =
  "the standalone dev loop serves two mcp-use instances — align the peer pins " +
  "in pnpm-workspace.yaml (overrides) so pnpm-lock.yaml resolves ONE mcp-use " +
  "variant (examples/test/peer-variants.test.ts names the split)."

let child
/** `pnpm exec` forks the CLI: stop the whole process group, not just pnpm. */
function stopServer() {
  if (child?.pid === undefined || child.exitCode !== null) return
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    child.kill("SIGTERM")
  }
}
function fail(reason) {
  console.error(`check-standalone-dev FAILED: ${reason}`)
  console.error(FIX_HINT)
  stopServer()
  process.exit(1)
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const views = fs
  .readdirSync(viewsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(viewsDir, e.name, "view.tsx")))
  .map((e) => e.name)
  .sort()
if (views.length === 0) fail(`no views/<name>/view.tsx under ${path.relative(repoRoot, viewsDir)}`)

const port = await freePort()
const base = `http://127.0.0.1:${port}`
console.log(`check-standalone-dev: booting mcp-use dev on :${port} …`)
child = spawn(
  "pnpm",
  [
    "exec",
    "mcp-use",
    "dev",
    "--path",
    "standalone-host",
    "--no-open",
    "--no-inspector",
    "--port",
    String(port),
  ],
  { cwd: examplesDir, stdio: ["ignore", "pipe", "pipe"], detached: true },
)
let output = ""
child.stdout.on("data", (d) => (output += d))
child.stderr.on("data", (d) => (output += d))
process.on("exit", stopServer)

const ready = await new Promise((resolve) => {
  const started = Date.now()
  const timer = setInterval(() => {
    if (/dev server ready/.test(output)) {
      clearInterval(timer)
      resolve(true)
    } else if (child.exitCode !== null || Date.now() - started > BOOT_TIMEOUT_MS) {
      clearInterval(timer)
      resolve(false)
    }
  }, 250)
})
if (!ready) fail(`the dev server did not report "dev server ready":\n${output.slice(-2000)}`)

async function rpc(method, params, id) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  })
  const text = await res.text()
  const line = text.split("\n").find((l) => l.startsWith("data: "))
  return JSON.parse(line ? line.slice(6) : text)
}

await rpc(
  "initialize",
  {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "check-standalone-dev", version: "1" },
  },
  1,
)

// Import specifiers as the dev server emits them (`from "…"`, `import "…"`,
// `import("…")`). Over-matching is harmless: a non-module hit 404s and is
// skipped; what matters is that no real edge is missed.
const SPECIFIER =
  /\bfrom\s*["']([^"'\n]+)["']|\bimport\s*["']([^"'\n]+)["']|\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
const MCP_USE_DIR = /\/\.pnpm\/(mcp-use@[^/]+)\/node_modules\/mcp-use\//

async function crawl(entryUrl) {
  const seen = new Set()
  const queue = [entryUrl]
  const runtimeDirs = new Set()
  let reachedShell = false
  while (queue.length > 0) {
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)
    if (seen.size > MAX_MODULES) fail(`module graph exceeds ${MAX_MODULES} modules at ${url}`)
    const res = await fetch(url)
    if (!res.ok) {
      if (url === entryUrl) fail(`view entry ${url} answered HTTP ${res.status}`)
      continue
    }
    if (!/javascript/.test(res.headers.get("content-type") ?? "")) continue
    const decoded = decodeURIComponent(url)
    const dir = MCP_USE_DIR.exec(decoded)
    if (dir && /\/dist\/react\//.test(decoded)) runtimeDirs.add(dir[1])
    if (/mcp-toolkit-ui|packages\/ui\/(dist|src)\/app\//.test(decoded)) reachedShell = true
    const code = await res.text()
    for (const m of code.matchAll(SPECIFIER)) {
      const spec = m[1] ?? m[2] ?? m[3]
      if (!spec || spec.startsWith("data:")) continue
      let next
      try {
        next = new URL(spec, url).href
      } catch {
        continue
      }
      if (next.startsWith(base) && !seen.has(next)) queue.push(next)
    }
  }
  return { modules: seen.size, runtimeDirs: [...runtimeDirs], reachedShell }
}

let id = 2
for (const view of views) {
  const read = await rpc("resources/read", { uri: `ui://views/${view}.html` }, id++)
  const html = read.result?.contents?.[0]?.text
  if (typeof html !== "string") fail(`resources/read ui://views/${view}.html returned no HTML`)
  const entry = /<script type="module" src="([^"]*virtual:mcp-use\/views\/[^"]+)"/.exec(html)?.[1]
  if (!entry) fail(`the ${view} view HTML carries no view entry script`)
  const { modules, runtimeDirs, reachedShell } = await crawl(entry)
  if (!reachedShell)
    fail(`the ${view} view graph never reaches @miragon/mcp-toolkit-ui's app shell`)
  if (runtimeDirs.length !== 1) {
    fail(
      `the ${view} view loads mcp-use/react from ${runtimeDirs.length} package directories ` +
        `(expected 1):\n  ${runtimeDirs.join("\n  ") || "(none)"}`,
    )
  }
  console.log(`check-standalone-dev: ${view} — ${modules} modules, one mcp-use/react runtime`)
}

stopServer()
console.log(`check-standalone-dev OK: [${views.join(", ")}] serve one mcp-use/react runtime`)
process.exit(0)
