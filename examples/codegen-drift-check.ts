/**
 * Self-contained codegen drift gate (FITNESS.md phase 3): boots the articles
 * codegen-source server on a free port, runs `generate:check` against it, and
 * tears the server down — so the documented "CI drift check"
 * (docs/guides/testing-with-examples.md) actually runs in CI instead of
 * requiring a manually started server on :4000.
 *
 * Exit code = the check's exit code: != 0 when the committed
 * examples/modules/articles/generated/ output drifts from what the current
 * generator + tool definitions produce. Fix: `pnpm dev:codegen-source` (keep
 * running) + `pnpm generate`, then commit generated/.
 *
 * Run: pnpm --filter @miragon/mcp-toolkit-examples run generate:check:ci
 * (needs `pnpm -r build` first — the codegen CLI runs from dist).
 */
import { spawn, spawnSync } from "node:child_process"
import net from "node:net"
import path from "node:path"

const examplesDir = import.meta.dirname

const waitForPort = async (port: number, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: "127.0.0.1" })
      socket.once("connect", () => {
        socket.destroy()
        resolve(true)
      })
      socket.once("error", () => resolve(false))
    })
    if (connected) return
    if (Date.now() > deadline) {
      throw new Error(`codegen-source did not open port ${port} within ${timeoutMs}ms`)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}

// The generated header embeds the source URL, so the check MUST run against
// the exact URL committed in generated/tools.ts (the codegen.config.ts
// default, localhost:4000) — a random free port would always "drift".
const port = Number(process.env.ARTICLES_CODEGEN_SOURCE_PORT ?? 4000)
const portFree = await new Promise<boolean>((resolve) => {
  const probe = net.createServer()
  probe.once("error", () => resolve(false))
  probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)))
})
if (!portFree) {
  console.error(
    `codegen-drift-check: port ${port} is already in use (a dev codegen-source running?). Stop it or set ARTICLES_CODEGEN_SOURCE_PORT — but note the committed generated/ header pins the default URL.`,
  )
  process.exit(1)
}

// detached => own process group, so the kill below reaches the whole
// npx -> tsx -> node chain. A surviving grandchild would keep the caller's
// stdout pipe open and hang `pnpm … | tail`-style consumers forever.
const source = spawn("npx", ["tsx", path.join("modules", "articles", "codegen-source.ts")], {
  cwd: examplesDir,
  env: { ...process.env, ARTICLES_CODEGEN_SOURCE_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
})

try {
  await waitForPort(port, 30_000)
  const check = spawnSync("pnpm", ["--filter", "articles-example", "run", "generate:check"], {
    cwd: examplesDir,
    env: process.env,
    stdio: "inherit",
  })
  process.exitCode = check.status ?? 1
} finally {
  if (source.pid) process.kill(-source.pid, "SIGTERM")
}
