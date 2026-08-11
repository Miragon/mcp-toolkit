import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { AppPlugin, PipelineStepDefinition, StepOutput } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp, createInMemoryDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "@mcp-use/client"
import type { MCPServer } from "mcp-use"
import { createPlugin as createTasksPlugin } from "../../modules/tasks/plugin.js"
import { createPlugin as createOrdersPlugin } from "../../modules/orders/plugin.js"
import { GOLDEN_HINT, loadOrUpdateGolden, stableSort } from "../helpers/golden.js"

/**
 * Golden contract of the LLM-facing tool surface (FITNESS.md, phase 5a).
 *
 * tools/list IS the API a model reads: `description`, `title`,
 * `annotations`, every `.describe()` text in `inputSchema`, `outputSchema`
 * and the full `_meta` (ui.* / openai/*) steer every consuming model. An
 * agent "improving" any of it changes runtime behaviour invisibly — so the
 * complete wire shape is frozen here, including `_meta`: an mcp-use upstream
 * bump that moves these keys (the pre-#127 failure class) turns this red
 * instead of shipping silently.
 */

const FIXTURE_JS = path.join(import.meta.dirname, "..", "fixtures", "mcp-app.js")

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

const greetStep: PipelineStepDefinition = {
  id: "smoke:greet",
  dataType: "smoke:greeting",
  requires: ["smoke:name"],
  produces: ["smoke:greeting"],
  // eslint-disable-next-line @typescript-eslint/require-await -- PipelineStepDefinition.execute is async by contract
  async execute(): Promise<StepOutput> {
    return { _app: "smoke", _step: "greet", data: {}, keys: {} }
  },
}

function createMinimalPlugin(): AppPlugin {
  return {
    definition: {
      name: "smoke",
      steps: [greetStep],
      widgets: [{ id: "smoke:greeting-card", requires: ["smoke:greeting"], size: "half" }],
    },
  }
}

interface Host {
  app: MCPServer
  client: MCPClient
  session: MCPSession
}

async function bootHost(options: {
  name: string
  plugins: AppPlugin[]
  builder?: boolean
}): Promise<Host> {
  const app = await createFrameworkApp({
    name: options.name,
    version: "0.0.0",
    host: "127.0.0.1",
    plugins: options.plugins,
    app: {
      bundle: { jsPath: FIXTURE_JS },
      ...(options.builder ? { builder: true, dashboardStore: createInMemoryDashboardStore() } : {}),
    },
  })
  const port = await getFreePort()
  await app.listen(port)
  const client = MCPClient.fromDict({
    mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
  })
  const session = await client.createSession("host")
  return { app, client, session }
}

async function sortedTools(session: MCPSession): Promise<unknown> {
  const tools = (await session.listTools()) as { name: string }[]
  tools.sort((a, b) => a.name.localeCompare(b.name))
  return stableSort(tools)
}

describe("tools/list golden contract", () => {
  let minimal: Host
  let full: Host

  beforeAll(async () => {
    minimal = await bootHost({ name: "golden-minimal-host", plugins: [createMinimalPlugin()] })
    full = await bootHost({
      name: "golden-full-host",
      plugins: [createTasksPlugin(), createOrdersPlugin()],
      builder: true,
    })
  })

  afterAll(async () => {
    await minimal?.client.closeAllSessions()
    await minimal?.app.close()
    await full?.client.closeAllSessions()
    await full?.app.close()
  })

  it("minimal host (framework trio) matches the golden", async () => {
    const actual = await sortedTools(minimal.session)
    expect(actual, GOLDEN_HINT).toEqual(loadOrUpdateGolden("tools-minimal", actual))
  })

  it("full host (tasks + orders + builder + dashboards) matches the golden", async () => {
    const actual = await sortedTools(full.session)
    expect(actual, GOLDEN_HINT).toEqual(loadOrUpdateGolden("tools-full", actual))
  })

  it("get-framework-manifest payload matches the golden", async () => {
    const result = await full.session.callTool("get-framework-manifest", {})
    expect(result.isError).toBeFalsy()
    const text = (result.content as { type: string; text?: string }[]).find(
      (c) => c.type === "text",
    )?.text
    expect(text, "manifest must arrive as text content").toBeTruthy()
    const actual = stableSort(JSON.parse(text!))
    expect(actual, GOLDEN_HINT).toEqual(loadOrUpdateGolden("framework-manifest", actual))
  })
})
