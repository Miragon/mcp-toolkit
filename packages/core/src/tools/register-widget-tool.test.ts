import type { MCPServer } from "mcp-use"
import type { CallToolResult } from "@modelcontextprotocol/server"
import type { ToolAnnotations } from "mcp-use"
import { describe, expect, it } from "vitest"
import { createWidgetToolRegistrar } from "./register-widget-tool.js"

interface CapturedToolDefinition {
  name: string
  title?: string
  description: string
  annotations?: ToolAnnotations
  visibility?: string
  view?: { name: string; description?: string; csp?: Record<string, unknown> }
  outputSchema?: unknown
  _meta?: Record<string, unknown>
}

type ToolCallback = (args: Record<string, unknown>) => Promise<CallToolResult>

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

function firstTool(tools: CapturedTool[]): CapturedTool {
  const tool = tools[0]
  if (!tool) throw new Error("test fixture invariant: no tool registered")
  return tool
}

describe("createWidgetToolRegistrar", () => {
  it("defaults to native app-only visibility with no view binding", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "show_thing",
      title: "Show Thing",
      description: "renders a thing",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const def = firstTool(tools).definition
    expect(def.visibility).toBe("app")
    expect(def.view).toBeUndefined()
    expect(def._meta).toBeUndefined()
    expect(def.title).toBe("Show Thing")
  })

  it("binds model-visible tools to a view named after the tool", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "render_thing",
      title: "Render Thing",
      description: "renders a thing",
      visibility: "model",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const def = firstTool(tools).definition
    expect(def.visibility).toBeUndefined()
    expect(def.view).toEqual({ name: "render_thing", description: "renders a thing" })
    // A view binding requires an outputSchema — the registrar defaults one.
    expect(def.outputSchema).toBeDefined()
  })

  it("stamps the Apps SDK keys pointing at the tool's view resource", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "render_thing",
      title: "Render Thing",
      description: "renders a thing",
      visibility: "model",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    expect(firstTool(tools).definition._meta).toEqual({
      "openai/outputTemplate": "ui://views/render_thing.html",
      "openai/toolInvocation/invoking": "Loading Render Thing...",
      "openai/toolInvocation/invoked": "Render Thing ready",
      "openai/widgetAccessible": true,
      "openai/resultCanProduceWidget": true,
      "openai/widgetDescription": "renders a thing",
    })
  })

  it("derives the invocation strings from the name when no title is given", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "render_thing",
      description: "renders a thing",
      visibility: "model",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const meta = firstTool(tools).definition._meta
    expect(meta?.["openai/toolInvocation/invoking"]).toBe("Loading render_thing...")
    expect(meta?.["openai/toolInvocation/invoked"]).toBe("render_thing ready")
  })

  it("prefers explicit invoking/invoked strings over the derived defaults", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "render_thing",
      title: "Render Thing",
      description: "renders a thing",
      visibility: "model",
      invoking: "Crunching numbers...",
      invoked: "Numbers crunched",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const meta = firstTool(tools).definition._meta
    expect(meta?.["openai/toolInvocation/invoking"]).toBe("Crunching numbers...")
    expect(meta?.["openai/toolInvocation/invoked"]).toBe("Numbers crunched")
  })

  it("threads the CSP defaults into the view binding and the Apps SDK meta", () => {
    const { server, tools } = createStubServer()
    const widgetCSP = { connect_domains: ["https://api.example"] }
    const viewCsp = { connectDomains: ["https://api.example"] }
    const register = createWidgetToolRegistrar(server, {}, { widgetCSP, viewCsp })
    register({
      name: "render_thing",
      description: "renders a thing",
      visibility: "model",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const def = firstTool(tools).definition
    expect(def.view?.csp).toEqual(viewCsp)
    expect(def._meta?.["openai/widgetCSP"]).toEqual(widgetCSP)
  })

  it("keeps app-only widget tools free of the widget-rendering keys", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(
      server,
      {},
      {
        widgetCSP: { connect_domains: ["https://api.example"] },
        viewCsp: { connectDomains: ["https://api.example"] },
      },
    )
    register({
      name: "thing_data",
      description: "app-only data feed",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const def = firstTool(tools).definition
    expect(def.visibility).toBe("app")
    expect(def.view).toBeUndefined()
    expect(def._meta).toBeUndefined()
  })

  it("forwards annotations and merges extra meta on both visibilities", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "annotated_thing",
      description: "renders a thing",
      annotations: { readOnlyHint: true, idempotentHint: true },
      meta: { "openai/widgetPrefersBorder": true },
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const def = firstTool(tools).definition
    expect(def.annotations).toEqual({ readOnlyHint: true, idempotentHint: true })
    expect(def._meta).toEqual({ "openai/widgetPrefersBorder": true })
  })

  it("does not let extra meta override the registrar's Apps SDK keys", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "meta_clash",
      description: "renders a thing",
      visibility: "model",
      meta: { "openai/outputTemplate": "ui://hijacked" },
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    expect(firstTool(tools).definition._meta?.["openai/outputTemplate"]).toBe(
      "ui://views/meta_clash.html",
    )
  })

  it("returns the handler's text + structuredContent on success", async () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "show_thing",
      description: "renders a thing",
      handler: () => Promise.resolve({ text: "hello", structuredContent: { a: 1 } }),
    })
    const result = await firstTool(tools).cb({})
    expect(result.structuredContent).toEqual({ a: 1 })
    const block = result.content[0]
    expect(block && block.type === "text" ? block.text : undefined).toBe("hello")
  })

  it("translates thrown errors into the registrar's [code] message format", async () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {})
    register({
      name: "broken",
      description: "renders a thing",
      handler: () => Promise.reject(Object.assign(new Error("nope"), { status: 503 })),
    })
    const result = await firstTool(tools).cb({})
    expect(result.isError).toBe(true)
    const block = result.content[0]
    expect(block && block.type === "text" ? block.text : undefined).toBe("[503] nope")
  })
})
