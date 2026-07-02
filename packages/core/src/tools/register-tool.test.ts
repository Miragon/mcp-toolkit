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
  if (!block || block.type !== "text") throw new Error("expected text content block")
  return block.text
}

function firstTool(tools: CapturedTool[]): CapturedTool {
  const tool = tools[0]
  if (!tool) throw new Error("test fixture invariant: no tool registered")
  return tool
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
    const result = await firstTool(tools).cb({})
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
    const declared = firstTool(tools).definition.outputSchema
    expect(declared).toBeDefined()
    expect(declared!.parse({ data: [{ id: "1" }] })).toEqual({ data: [{ id: "1" }] })

    const result = await firstTool(tools).cb({})
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
    const result = await firstTool(tools).cb({})
    expect(result.structuredContent).toBeUndefined()
    expect(firstTextBlock(result)).toBe("Count: 42")
  })

  it("mirrors structuredContent on the formatResult path when an outputSchema is set", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "report_with_schema",
      description: "",
      outputSchema: z.object({ count: z.number() }),
      handler: () => Promise.resolve({ count: 42 }),
      formatResult: (raw) => `Count: ${(raw as { count: number }).count}`,
    })
    const result = await firstTool(tools).cb({})
    expect(firstTextBlock(result)).toBe("Count: 42")
    expect(result.structuredContent).toEqual({ count: 42 })
  })

  it("wraps an array result as { data } in structuredContent on the formatResult path", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "list_with_schema",
      description: "",
      outputSchema: z.array(z.object({ id: z.string() })),
      handler: () => Promise.resolve([{ id: "1" }, { id: "2" }]),
      formatResult: (raw) => `Count: ${(raw as unknown[]).length}`,
    })
    const result = await firstTool(tools).cb({})
    expect(firstTextBlock(result)).toBe("Count: 2")
    expect(result.structuredContent).toEqual({ data: [{ id: "1" }, { id: "2" }] })
  })

  it("falls back to legacy text for primitive results", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "version",
      description: "",
      handler: () => Promise.resolve("1.2.3"),
    })
    const result = await firstTool(tools).cb({})
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
    const result = await firstTool(tools).cb({})
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
    const result = await firstTool(tools).cb({})
    expect(result.isError).toBe(true)
  })

  // A declared outputSchema promises object structuredContent. A handler that
  // instead returns a scalar/null/undefined must not produce an invalid or
  // missing structuredContent (which the SDK rejects with an opaque protocol
  // error) — the registrar surfaces a clear `isError` result the SDK passes
  // through without output-schema validation.
  it.each([
    ["primitive", "1.2.3", "string"],
    ["null", null, "null"],
    ["undefined", undefined as unknown, "undefined"],
  ])(
    "returns a clear isError result for a %s result when an outputSchema is declared",
    async (_label, value, kind) => {
      const { server, tools } = createStubServer()
      const register = createToolRegistrar(server, {})
      register({
        name: "declared_but_scalar",
        description: "",
        outputSchema: z.object({ id: z.string() }),
        handler: () => Promise.resolve(value),
      })
      const result = await firstTool(tools).cb({})
      expect(result.isError).toBe(true)
      expect(firstTextBlock(result)).toContain("declares an outputSchema")
      expect(firstTextBlock(result)).toContain(kind)
      // No invalid structuredContent leaks out for the SDK to reject.
      expect(result.structuredContent).toBeUndefined()
    },
  )

  it("returns a clear isError result for a scalar on the formatResult+outputSchema path", async () => {
    const { server, tools } = createStubServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "formatted_but_scalar",
      description: "",
      outputSchema: z.object({ id: z.string() }),
      handler: () => Promise.resolve(42),
      formatResult: () => "summary",
    })
    const result = await firstTool(tools).cb({})
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
  })
})
