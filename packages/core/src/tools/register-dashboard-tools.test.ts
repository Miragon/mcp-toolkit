import type { CallToolResult } from "@modelcontextprotocol/server"
import type { MCPServer } from "mcp-use"
import { describe, expect, it } from "vitest"
import {
  createInMemoryDashboardStore,
  DashboardUnreadableError,
  type DashboardRecord,
  type DashboardStore,
} from "./dashboard-store.js"
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

function setup(
  widgetRegistry?: WidgetRegistry,
  options: { store?: DashboardStore; requireCallerIdentity?: boolean } = {},
) {
  const store = options.store ?? createInMemoryDashboardStore()
  const { server, tools } = createStubServer()
  registerDashboardTools(server, {
    store,
    widgetRegistry,
    requireCallerIdentity: options.requireCallerIdentity,
  })
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

    // Not an error — save-dashboard warns (never rejects) on unknown widget ids.
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

/** The tool-callback ctx mcp-use 2 builds from a built-in provider's `{ id }` user. */
const asUser = (id: string) => ({ auth: { user: { id, roles: [] }, payload: { sub: id } } })
/** Authenticated, but the provider mapped no subject. */
const nameless = { auth: { user: { roles: [] }, payload: {} } }

describe("registerDashboardTools — caller scope (mcp-use 2 shapes)", () => {
  it("scopes by ctx.auth.user.id — the built-in provider shape, no userId", async () => {
    const { byName } = setup()
    const saved = await byName("save-dashboard").cb(
      { name: "Alice's", layout: sampleLayout },
      asUser("alice"),
    )
    const { id } = saved.structuredContent as { id: string }

    const own = await byName("load-dashboard").cb({ id }, asUser("alice"))
    expect(own.structuredContent).toMatchObject({ id, userId: "alice" })

    const asBob = await byName("list-dashboards").cb({}, asUser("bob"))
    expect(asBob.structuredContent).toEqual({ items: [] })
    expect((await byName("load-dashboard").cb({ id }, asUser("bob"))).isError).toBe(true)
    expect((await byName("delete-dashboard").cb({ id }, asUser("bob"))).isError).toBe(true)
  })

  it.each(["save-dashboard", "list-dashboards", "load-dashboard", "delete-dashboard"])(
    "%s refuses an authenticated caller without a resolvable id instead of using global scope",
    async (tool) => {
      const { byName } = setup()
      const result = await byName(tool).cb({ id: "x", name: "n", layout: sampleLayout }, nameless)
      expect(result.isError).toBe(true)
      expect(textBlock(result)).toMatch(/carries no caller identity/)
    },
  )

  it("refuses a call without any ctx.auth when requireCallerIdentity is set (OAuth configured)", async () => {
    const { byName } = setup(undefined, { requireCallerIdentity: true })
    const result = await byName("save-dashboard").cb({ name: "Ghost", layout: sampleLayout })
    expect(result.isError).toBe(true)
    expect(textBlock(result)).toMatch(/carries no caller identity/)
    // An identified caller is unaffected by the flag.
    const ok = await byName("save-dashboard").cb(
      { name: "Mine", layout: sampleLayout },
      asUser("a"),
    )
    expect(ok.isError).toBeUndefined()
  })

  it("surfaces an ownership refusal on save as a tool error, not a crash", async () => {
    const { byName } = setup()
    const saved = await byName("save-dashboard").cb(
      { name: "Alice's", layout: sampleLayout },
      asUser("alice"),
    )
    const { id } = saved.structuredContent as { id: string }
    const hijack = await byName("save-dashboard").cb(
      { id, name: "Hijacked", layout: sampleLayout },
      asUser("bob"),
    )
    expect(hijack.isError).toBe(true)
    expect(textBlock(hijack)).toBe(`Access denied: dashboard "${id}" is owned by another user.`)
  })

  it("never hands an identified caller a foreign record, even from a lax custom store", async () => {
    const foreign: DashboardRecord = {
      id: "d1",
      name: "Someone else's",
      layout: { rows: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    const lax: DashboardStore = {
      save: () => Promise.reject(new Error("unused")),
      list: () => Promise.resolve([]),
      // Ignores the filter entirely — the 2.5-era "owner-less means everyone's" rule.
      get: () => Promise.resolve(foreign),
      delete: () => Promise.resolve(false),
    }
    const { byName } = setup(undefined, { store: lax })
    const result = await byName("load-dashboard").cb({ id: "d1" }, asUser("bob"))
    expect(result.isError).toBe(true)
    expect(textBlock(result)).toBe('Dashboard "d1" not found.')
  })

  describe("an unreadable record is reported, never treated as absent", () => {
    const unreadable = new DashboardUnreadableError("d1", "file is not valid JSON")
    const failing: DashboardStore = {
      save: () => Promise.reject(unreadable),
      list: () =>
        Promise.resolve([{ id: "d1", name: "d1", updatedAt: "", unreadable: unreadable.reason }]),
      get: () => Promise.reject(unreadable),
      delete: () => Promise.reject(unreadable),
    }

    it.each(["save-dashboard", "load-dashboard", "delete-dashboard"])(
      "%s returns the conflict as a tool error",
      async (tool) => {
        const { byName } = setup(undefined, { store: failing })
        const result = await byName(tool).cb({ id: "d1", name: "n", layout: sampleLayout })
        expect(result.isError).toBe(true)
        expect(textBlock(result)).toBe(unreadable.message)
      },
    )

    it("list-dashboards passes the unreadable entry through with its reason", async () => {
      const { byName } = setup(undefined, { store: failing })
      const result = await byName("list-dashboards").cb({})
      expect(result.structuredContent).toEqual({
        items: [{ id: "d1", name: "d1", updatedAt: "", unreadable: "file is not valid JSON" }],
      })
    })
  })

  it("lets an unexpected store failure propagate instead of disguising it as a refusal", async () => {
    const broken: DashboardStore = {
      save: () => Promise.reject(new Error("disk on fire")),
      list: () => Promise.resolve([]),
      get: () => Promise.reject(new Error("disk on fire")),
      delete: () => Promise.reject(new Error("disk on fire")),
    }
    const { byName } = setup(undefined, { store: broken })
    await expect(byName("save-dashboard").cb({ name: "x", layout: sampleLayout })).rejects.toThrow(
      "disk on fire",
    )
    await expect(byName("load-dashboard").cb({ id: "x" })).rejects.toThrow("disk on fire")
    await expect(byName("delete-dashboard").cb({ id: "x" })).rejects.toThrow("disk on fire")
  })
})
