import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { AppPlugin, PipelineStepDefinition, StepOutput } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "mcp-use/client"
import type { McpServerInstance } from "mcp-use/server"

/**
 * In-process smoke test for the `examples/` host wiring. Boots a real MCP
 * server via `createFrameworkApp` over a loopback socket and drives it with an
 * MCP client — the lightest regression guard the toolkit has, equivalent to
 * the curl flows in `examples/README.md` but runnable in CI (`pnpm -r test`).
 *
 * The scenario is fully self-contained: a local step produces a key with no
 * I/O, satisfying a host-bundled widget. This keeps the smoke test independent
 * of the external `articles-upstream` / `customers-upstream` servers, which are
 * only available when running the playground by hand.
 */

const FIXTURE_HTML = path.join(import.meta.dirname, "fixtures", "mcp-app.html")

/** Reserve a free TCP port by binding to port 0 and releasing it again. */
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
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(ctx): Promise<StepOutput> {
    const name = String(ctx.keys["smoke:name"])
    const greeting = { message: `Hello, ${name}!` }
    return {
      _app: "smoke",
      _step: "greet",
      data: greeting,
      keys: { "smoke:greeting": greeting },
    }
  },
}

function createSmokePlugin(): AppPlugin {
  return {
    definition: {
      name: "smoke",
      steps: [greetStep],
      widgets: [{ id: "smoke:greeting-card", requires: ["smoke:greeting"], size: "half" }],
    },
  }
}

describe("examples host smoke", () => {
  let app: McpServerInstance<false>
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    app = await createFrameworkApp({
      name: "examples-smoke-host",
      version: "0.0.0",
      host: "127.0.0.1",
      plugins: [createSmokePlugin()],
      proxies: [],
      app: {
        resourceUri: "ui://examples-smoke/mcp-app.html",
        htmlPath: FIXTURE_HTML,
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

  it("exposes the framework tool trio in tools/list", async () => {
    const names = (await session.listTools()).map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(["get-framework-manifest", "render-view", "refresh-view"]),
    )
  })

  it("render-view returns a structuredContent envelope of the expected shape", async () => {
    const result = await session.callTool("render-view", {
      keys: { "smoke:name": "world" },
      steps: [{ id: "greeting", step: "smoke:greet" }],
      layout: { rows: [{ row: [{ widget: "smoke:greeting-card", span: 6 }] }] },
      title: "Smoke view",
    })

    expect(result.isError).toBeFalsy()

    const sc = result.structuredContent as
      | {
          title?: string
          layout?: { rows: unknown[] }
          context?: {
            keys: Record<string, unknown>
            stepIds: string[]
            stepData: Record<string, { data: unknown; _app?: string; _dataType?: string }>
            errors: { stepId: string; reason: string }[]
          }
          _refreshParams?: { layout: unknown }
        }
      | undefined

    expect(sc, "render-view must return structuredContent").toBeTruthy()
    expect(sc!.title).toBe("Smoke view")
    expect(sc!.layout).toEqual({ rows: [{ row: [{ widget: "smoke:greeting-card", span: 6 }] }] })

    // The step ran, produced its key, and recorded no errors.
    expect(sc!.context!.errors).toEqual([])
    expect(sc!.context!.stepIds).toContain("greeting")
    expect(sc!.context!.keys["smoke:greeting"]).toEqual({ message: "Hello, world!" })

    const step = sc!.context!.stepData.greeting
    expect(step, "stepData must carry the 'greeting' entry").toBeTruthy()
    expect(step!._app).toBe("smoke")
    expect(step!._dataType).toBe("smoke:greeting")
    expect(step!.data).toEqual({ message: "Hello, world!" })

    // The refresh envelope echoes the input so the in-iframe refresh re-issues
    // the same call.
    expect(sc!._refreshParams!.layout).toEqual(sc!.layout)
  })
})
