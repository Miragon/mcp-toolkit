import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { MCPServer } from "mcp-use/server"
import { describe, expect, it } from "vitest"
import { createInMemoryDashboardStore } from "../framework/dashboard-store.js"
import { WidgetRegistry } from "../registry/widget-registry.js"
import type { WidgetDefinition } from "../types/widget.js"
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

function setup(widgetRegistry?: WidgetRegistry) {
  const store = createInMemoryDashboardStore()
  const { server, tools } = createStubServer()
  registerDashboardTools(server, { store, widgetRegistry })
  const byName = (name: string): CapturedTool => {
    const tool = tools.find((t) => t.definition.name === name)
    if (!tool) throw new Error(`tool not registered: ${name}`)
    return tool
  }
  return { byName }
}

const widget = (id: string): WidgetDefinition => ({ id, requires: [], size: "full" })

const sampleLayout = { rows: [{ row: [{ widget: "demo:card" }] }] }

describe("registerDashboardTools", () => {
  it("save-dashboard returns id/name/timestamps in structuredContent and a summary text", async () => {
    const { byName } = setup()
    const result = await byName("save-dashboard").cb({
      name: "Test",
      layout: sampleLayout,
    })
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload).toMatchObject({ name: "Test" })
    expect(typeof payload.id).toBe("string")
    expect(typeof payload.createdAt).toBe("string")
    expect(typeof payload.updatedAt).toBe("string")
    // No registry wired → no widget warning surfaces.
    expect(payload.unknownWidgets).toBeUndefined()
    expect(textBlock(result)).toContain("Saved dashboard")
    expect(textBlock(result)).not.toContain("Warning")
  })

  it("save-dashboard warns (never rejects) on widget ids absent from the registry", async () => {
    const registry = new WidgetRegistry()
    registry.register(widget("demo:card"))
    const { byName } = setup(registry)

    const result = await byName("save-dashboard").cb({
      name: "Mixed",
      layout: {
        rows: [{ row: [{ widget: "demo:card" }, { widget: "ghost:panel" }] }],
      },
    })

    // Not an error — remote widgets may legitimately be absent here.
    expect(result.isError).toBeUndefined()
    const payload = result.structuredContent as { id?: string; unknownWidgets?: string[] }
    expect(typeof payload.id).toBe("string")
    expect(payload.unknownWidgets).toEqual(["ghost:panel"])
    const text = textBlock(result)
    expect(text).toContain("Warning")
    expect(text).toContain("ghost:panel")
    expect(text).not.toContain("demo:card")
  })

  it("save-dashboard stays silent about widgets when no registry is injected", async () => {
    const { byName } = setup()
    const result = await byName("save-dashboard").cb({
      name: "NoRegistry",
      layout: { rows: [{ row: [{ widget: "anything:goes" }] }] },
    })
    expect(
      (result.structuredContent as { unknownWidgets?: string[] }).unknownWidgets,
    ).toBeUndefined()
    expect(textBlock(result)).not.toContain("Warning")
  })

  it("load-dashboard returns isError when the persisted layout is corrupt", async () => {
    const store = createInMemoryDashboardStore()
    // Persist a record whose layout violates layoutSchema (a row cell lacks
    // the required `widget` string), bypassing the typed save path.
    const saved = await store.save({ name: "Corrupt", layout: { rows: [] } })
    const corrupt = await store.get(saved.id, {})
    ;(corrupt as { layout: unknown }).layout = { rows: [{ row: [{ span: 4 }] }] }

    const { server, tools } = createStubServer()
    registerDashboardTools(server, { store })
    const load = tools.find((t) => t.definition.name === "load-dashboard")!

    const result = await load.cb({ id: saved.id })
    expect(result.isError).toBe(true)
    expect(textBlock(result)).toContain("invalid layout")
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
    const { id } = saved.structuredContent as { id: string }

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
    const { id } = saved.structuredContent as { id: string }

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
