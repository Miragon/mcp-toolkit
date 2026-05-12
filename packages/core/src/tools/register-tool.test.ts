import type { MCPServer } from "mcp-use/server"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createToolRegistrar } from "./register-tool.js"

interface CapturedToolDefinition {
  name: string
  outputSchema?: z.ZodTypeAny
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

function firstTextBlock(result: CallToolResult): string {
  const block = result.content[0]
  if (block.type !== "text") throw new Error("expected text content block")
  return block.text
}

describe("createToolRegistrar", () => {
  it("emits structuredContent + text mirror when handler returns an object", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "get_widget",
      description: "",
      outputSchema: z.object({ id: z.string(), name: z.string() }),
      handler: () => Promise.resolve({ id: "1", name: "Foo" }),
    })
    const result = await tools[0].cb({})
    expect(result.structuredContent).toEqual({ id: "1", name: "Foo" })
    expect(JSON.parse(firstTextBlock(result))).toEqual({ id: "1", name: "Foo" })
  })

  it("wraps arrays as { data: [...] } in structuredContent and outputSchema", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    const itemSchema = z.object({ id: z.string() })
    register({
      name: "list_widgets",
      description: "",
      outputSchema: z.array(itemSchema),
      handler: () => Promise.resolve([{ id: "1" }, { id: "2" }]),
    })
    const declared = tools[0].definition.outputSchema
    expect(declared).toBeDefined()
    expect(declared!.parse({ data: [{ id: "1" }] })).toEqual({ data: [{ id: "1" }] })

    const result = await tools[0].cb({})
    expect(result.structuredContent).toEqual({ data: [{ id: "1" }, { id: "2" }] })
  })

  it("keeps formatResult text-only (no structuredContent)", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "report",
      description: "",
      handler: () => Promise.resolve({ count: 42 }),
      formatResult: (raw) => `Count: ${(raw as { count: number }).count}`,
    })
    const result = await tools[0].cb({})
    expect(result.structuredContent).toBeUndefined()
    expect(firstTextBlock(result)).toBe("Count: 42")
  })

  it("falls back to legacy text for primitive results", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "version",
      description: "",
      handler: () => Promise.resolve("1.2.3"),
    })
    const result = await tools[0].cb({})
    expect(result.structuredContent).toBeUndefined()
    expect(firstTextBlock(result)).toBe('"1.2.3"')
  })

  it("emits success text for null/undefined results", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "noop",
      description: "",
      handler: () => Promise.resolve(null),
    })
    const result = await tools[0].cb({})
    expect(result.structuredContent).toBeUndefined()
    expect(firstTextBlock(result)).toBe("Success (no content returned)")
  })

  it("propagates errors via the error helper", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "broken",
      description: "",
      handler: () => Promise.reject(new Error("boom")),
    })
    const result = await tools[0].cb({})
    expect(result.isError).toBe(true)
  })
})
