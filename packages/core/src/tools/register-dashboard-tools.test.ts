import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { MCPServer } from "mcp-use/server"
import { describe, expect, it } from "vitest"
import { createInMemoryDashboardStore } from "../framework/dashboard-store.js"
import { registerDashboardTools } from "./register-dashboard-tools.js"

interface CapturedToolDefinition {
  name: string
}

type ToolCallback = (args: Record<string, unknown>, ctx?: unknown) => Promise<CallToolResult>

interface CapturedTool {
  definition: CapturedToolDefinition
  cb: ToolCallback
}

function createStubServer(): { server: MCPServer; tools: CapturedTool[] } {
  const tools: CapturedTool[] = []
  const server = {
    tool(definition: CapturedToolDefinition, cb: ToolCallback) {
      tools.push({ definition, cb })
    },
  }
  return { server: server as unknown as MCPServer, tools }
}

function textBlock(result: CallToolResult): string {
  const block = result.content[0]
  if (!block || block.type !== "text") {
    throw new Error("expected text content block")
  }
  return block.text
}

function setup() {
  const store = createInMemoryDashboardStore()
  const { server, tools } = createStubServer()
  registerDashboardTools(server, { store })
  const byName = (name: string): CapturedTool => {
    const tool = tools.find((t) => t.definition.name === name)
    if (!tool) throw new Error(`tool not registered: ${name}`)
    return tool
  }
  return { byName }
}

const sampleLayout = { rows: [{ row: [{ widget: "demo:card" }] }] }

describe("registerDashboardTools", () => {
  it("save-dashboard mirrors id/name/timestamps as JSON in content[].text", async () => {
    const { byName } = setup()
    const result = await byName("save-dashboard").cb({
      name: "Test",
      layout: sampleLayout,
    })
    const payload = JSON.parse(textBlock(result)) as Record<string, unknown>
    expect(payload).toMatchObject({ name: "Test" })
    expect(typeof payload.id).toBe("string")
    expect(typeof payload.createdAt).toBe("string")
    expect(typeof payload.updatedAt).toBe("string")
    expect(result.structuredContent).toEqual(payload)
  })

  it("load-dashboard surfaces the full record (keys/steps/layout/title) in content[].text", async () => {
    const { byName } = setup()
    const saved = await byName("save-dashboard").cb({
      name: "Test",
      layout: sampleLayout,
      keys: { "demo:invoiceId": "INV-1" },
      steps: [{ id: "invoice", step: "demo:load-invoice" }],
      title: "Invoice",
      description: "fixture",
    })
    const { id } = JSON.parse(textBlock(saved)) as { id: string }

    const loaded = await byName("load-dashboard").cb({ id })
    const record = JSON.parse(textBlock(loaded)) as Record<string, unknown>
    expect(record).toMatchObject({
      id,
      name: "Test",
      layout: sampleLayout,
      keys: { "demo:invoiceId": "INV-1" },
      steps: [{ id: "invoice", step: "demo:load-invoice" }],
      title: "Invoice",
      description: "fixture",
    })
    expect(loaded.structuredContent).toEqual(record)
  })

  it("load-dashboard returns isError when the id is unknown", async () => {
    const { byName } = setup()
    const result = await byName("load-dashboard").cb({ id: "missing" })
    expect(result.isError).toBe(true)
    expect(textBlock(result)).toContain("missing")
  })

  it("load-dashboard honours ctx.auth.user.userId scoping", async () => {
    const { byName } = setup()
    const saved = await byName("save-dashboard").cb(
      { name: "Alice's", layout: sampleLayout },
      { auth: { user: { userId: "alice" } } },
    )
    const { id } = JSON.parse(textBlock(saved)) as { id: string }

    const asBob = await byName("load-dashboard").cb({ id }, { auth: { user: { userId: "bob" } } })
    expect(asBob.isError).toBe(true)
  })

  it("list-dashboards returns { items: [] } when empty", async () => {
    const { byName } = setup()
    const result = await byName("list-dashboards").cb({})
    const payload = JSON.parse(textBlock(result)) as { items: unknown[] }
    expect(payload).toEqual({ items: [] })
    expect(result.structuredContent).toEqual(payload)
  })

  it("list-dashboards returns saved entries as { items: [...] }", async () => {
    const { byName } = setup()
    await byName("save-dashboard").cb({ name: "One", layout: sampleLayout })
    await byName("save-dashboard").cb({ name: "Two", layout: sampleLayout })

    const result = await byName("list-dashboards").cb({})
    const payload = JSON.parse(textBlock(result)) as {
      items: Array<{ name: string }>
    }
    const names = payload.items.map((i) => i.name).sort()
    expect(names).toEqual(["One", "Two"])
  })
})
