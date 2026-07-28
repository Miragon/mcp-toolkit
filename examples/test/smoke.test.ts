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
 * I/O, satisfying a host-bundled widget — no external servers involved.
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

  it("advertises the layout JSON-string branch next to the three object forms on the wire", async () => {
    // Regression guard for the layoutInputSchema string branch: the zod
    // transform/pipe must survive the zod→JSON-Schema conversion as a plain
    // `type: "string"` anyOf branch (not `{}`, not a conversion error) while
    // the three original layout forms stay untouched.
    const tools = await session.listTools()
    const renderView = tools.find((t) => t.name === "render-view")
    expect(renderView, "render-view must be listed").toBeTruthy()

    const layout = (
      renderView!.inputSchema as {
        properties?: Record<string, { anyOf?: { type?: string; required?: string[] }[] }>
      }
    ).properties?.layout
    expect(layout?.anyOf, "layout must surface as a top-level anyOf").toBeTruthy()

    const branches = layout!.anyOf!
    expect(branches.map((b) => b.type)).toEqual(["array", "object", "object", "string"])
    expect(branches[1]!.required).toEqual(["rows"])
    expect(branches[2]!.required).toEqual(["tabs"])
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

  it("accepts the layout as a JSON-encoded string, equivalent to the object call", async () => {
    // Some hosts serialize the type-less `anyOf` layout parameter as a JSON
    // string; the string branch of layoutInputSchema must make that call
    // succeed and produce the exact same result as the object form.
    const layout = [{ row: [{ widget: "smoke:greeting-card", span: 6 }] }]
    const args = {
      keys: { "smoke:name": "world" },
      steps: [{ id: "greeting", step: "smoke:greet" }],
      title: "Smoke view",
    }

    const objectCall = await session.callTool("render-view", { ...args, layout })
    const stringCall = await session.callTool("render-view", {
      ...args,
      layout: JSON.stringify(layout),
    })

    expect(objectCall.isError).toBeFalsy()
    expect(stringCall.isError).toBeFalsy()
    // The string was parsed server-side: same rendered view, same refresh
    // envelope — including the already-parsed (object-form) layout.
    expect(stringCall.structuredContent).toEqual(objectCall.structuredContent)
    const sc = stringCall.structuredContent as { layout?: unknown } | undefined
    expect(sc?.layout).toEqual(layout)
  })

  it("accepts a DOUBLE-encoded string layout, equivalent to the object call", async () => {
    // Observed claude.ai traffic: the model writes the layout as a JSON string
    // (the advertised string branch) and the host layer stringifies the
    // argument once more — the server must unwrap the nesting.
    const layout = [{ row: [{ widget: "smoke:greeting-card", span: 6 }] }]
    const args = {
      keys: { "smoke:name": "world" },
      steps: [{ id: "greeting", step: "smoke:greet" }],
      title: "Smoke view",
    }

    const objectCall = await session.callTool("render-view", { ...args, layout })
    const doubleEncodedCall = await session.callTool("render-view", {
      ...args,
      layout: JSON.stringify(JSON.stringify(layout)),
    })

    expect(objectCall.isError).toBeFalsy()
    expect(doubleEncodedCall.isError).toBeFalsy()
    expect(doubleEncodedCall.structuredContent).toEqual(objectCall.structuredContent)
    const sc = doubleEncodedCall.structuredContent as { layout?: unknown } | undefined
    expect(sc?.layout).toEqual(layout)
  })
})
