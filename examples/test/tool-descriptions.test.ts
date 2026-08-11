import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFrameworkApp, createInMemoryDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "@mcp-use/client"
import type { MCPServer } from "mcp-use"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"
import { createPlugin as createOrdersPlugin } from "../modules/orders/plugin.js"
import { findUndescribedFields } from "./helpers/assert-described.js"

/**
 * Fitness gate (FITNESS.md, phase 1): the tool surface is the API a model
 * reads. Every model-visible tool must carry a non-empty `description`, and
 * every field of its input schema a non-empty `.describe(...)` — checked on
 * the wire (tools/list), so composed and referenced Zod schemas are covered
 * exactly as a host sees them.
 */

const FIXTURE_JS = path.join(import.meta.dirname, "fixtures", "mcp-app.js")

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

describe("tool descriptions are complete on the wire", () => {
  let app: MCPServer
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    app = await createFrameworkApp({
      name: "tool-descriptions-host",
      version: "0.0.0",
      host: "127.0.0.1",
      plugins: [createTasksPlugin(), createOrdersPlugin()],
      app: {
        bundle: { jsPath: FIXTURE_JS },
        // builder on, so the dashboard CRUD tools are part of the gate too
        builder: true,
        dashboardStore: createInMemoryDashboardStore(),
      },
    })
    const port = await getFreePort()
    await app.listen(port)
    client = MCPClient.fromDict({
      mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("host")
  })

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
  })

  it("every model-visible tool has a non-empty description", async () => {
    const tools = await session.listTools()
    expect(tools.length).toBeGreaterThan(0)
    const missing = tools
      .filter((t) => !(typeof t.description === "string" && t.description.trim().length > 0))
      .map((t) => t.name)
    expect(
      missing,
      `Tools without a description: ${missing.join(", ")} — the description is the model's ONLY guidance for choosing the tool. Add one at the registration site.`,
    ).toEqual([])
  })

  it("every input-schema field of every model-visible tool is .describe()d", async () => {
    const tools = await session.listTools()
    const offenders = tools
      .map((t) => ({ name: t.name, fields: findUndescribedFields(t.inputSchema) }))
      .filter((t) => t.fields.length > 0)
    const report = offenders.map((o) => `${o.name}: ${o.fields.join(", ")}`).join("\n")
    expect(
      offenders,
      `Input-schema fields without a description:\n${report}\nAdd .describe("…") to each Zod field at the tool's registration site — it is the only documentation the model sees for the argument.`,
    ).toEqual([])
  })
})
