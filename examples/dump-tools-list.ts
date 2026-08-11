/**
 * Dumps the canonical tools/list wire surface of the examples host (tasks +
 * orders plugins, builder on) as sorted, stable JSON on stdout.
 *
 * Behaviour-neutrality anchor for refactors (FITNESS.md phase 3): dump
 * before, dump after, `diff` must be empty. Phase 5a freezes the same
 * surface permanently as golden files.
 *
 * Run: pnpm dump:tools <out.json>   (root) — boots the host in-process.
 * The dump goes to the FILE argument (the mcp-use server logs to stdout).
 */
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { createFrameworkApp, createInMemoryDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient } from "@mcp-use/client"
import { createPlugin as createTasksPlugin } from "./modules/tasks/plugin.js"
import { createPlugin as createOrdersPlugin } from "./modules/orders/plugin.js"

const FIXTURE_JS = path.join(import.meta.dirname, "test", "fixtures", "mcp-app.js")

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

const app = await createFrameworkApp({
  name: "dump-tools-list",
  version: "0.0.0",
  host: "127.0.0.1",
  plugins: [createTasksPlugin(), createOrdersPlugin()],
  app: {
    bundle: { jsPath: FIXTURE_JS },
    builder: true,
    dashboardStore: createInMemoryDashboardStore(),
  },
})
const port = await getFreePort()
await app.listen(port)
const client = MCPClient.fromDict({
  mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
})
const session = await client.createSession("host")
const tools = (await session.listTools()) as { name: string }[]
tools.sort((a, b) => a.name.localeCompare(b.name))
const out = process.argv[2]
if (!out) {
  console.error(
    "usage: pnpm dump:tools <out.json> — the dump goes to a file, stdout carries server logs",
  )
  process.exit(1)
}
fs.writeFileSync(out, JSON.stringify(sortKeys(tools), null, 2) + "\n", "utf8")
console.error(`wrote ${tools.length} tools to ${out}`)
await client.closeAllSessions()
await app.close()
process.exit(0)
