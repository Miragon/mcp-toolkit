import type { MCPServer } from "mcp-use/server"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { ToolAnnotations } from "mcp-use/server"
import { describe, expect, it } from "vitest"
import { createWidgetToolRegistrar } from "./register-widget-tool.js"

interface CapturedToolDefinition {
  name: string
  title?: string
  description: string
  annotations?: ToolAnnotations
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

const RESOURCE_URI = "ui://app/widget.html"

describe("createWidgetToolRegistrar", () => {
  it("defaults to app-only _meta (resourceUri + visibility)", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {}, RESOURCE_URI)
    register({
      name: "show_thing",
      title: "Show Thing",
      description: "renders a thing",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    expect(firstTool(tools).definition._meta).toEqual({
      ui: { resourceUri: RESOURCE_URI, visibility: ["app"] },
    })
    expect(firstTool(tools).definition.title).toBe("Show Thing")
  })

  it("omits the visibility marker for model-visible tools", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {}, RESOURCE_URI)
    register({
      name: "render_thing",
      description: "renders a thing",
      visibility: "model",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    expect(firstTool(tools).definition._meta).toEqual({ ui: { resourceUri: RESOURCE_URI } })
  })

  it("keeps visibility when both app and model surfaces are requested", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {}, RESOURCE_URI)
    register({
      name: "dual_thing",
      description: "renders a thing",
      visibility: ["app", "model"],
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    // Advertised to the model, so it must not be hidden by the app-only marker.
    expect(firstTool(tools).definition._meta).toEqual({ ui: { resourceUri: RESOURCE_URI } })
  })

  it("forwards annotations and merges extra meta flat under the ui block", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {}, RESOURCE_URI)
    register({
      name: "annotated_thing",
      description: "renders a thing",
      annotations: { readOnlyHint: true, idempotentHint: true },
      meta: { "openai/widgetPrefersBorder": true },
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    const def = firstTool(tools).definition
    expect(def.annotations).toEqual({ readOnlyHint: true, idempotentHint: true })
    expect(def._meta).toEqual({
      "openai/widgetPrefersBorder": true,
      ui: { resourceUri: RESOURCE_URI, visibility: ["app"] },
    })
  })

  it("does not let extra meta override the registrar's ui block", () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {}, RESOURCE_URI)
    register({
      name: "meta_clash",
      description: "renders a thing",
      meta: { ui: { resourceUri: "ui://hijacked" } },
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })
    expect(firstTool(tools).definition._meta).toEqual({
      ui: { resourceUri: RESOURCE_URI, visibility: ["app"] },
    })
  })

  it("returns the handler's text + structuredContent on success", async () => {
    const { server, tools } = createStubServer()
    const register = createWidgetToolRegistrar(server, {}, RESOURCE_URI)
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
    const register = createWidgetToolRegistrar(server, {}, RESOURCE_URI)
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
