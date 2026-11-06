import { describe, expect, it } from "vitest"
import { toolCallerFromClient, type McpClientLike } from "./mcp-client.js"
import { createTypedCallTool } from "./typed-call-tool.js"

type Params = Parameters<McpClientLike["callTool"]>[0]
type Options = Parameters<McpClientLike["callTool"]>[1]

/**
 * Shaped like the MCP SDK's `Client`: a class whose method needs its receiver, params with more
 * optional fields, options with more fields and a result whose `content` is required.
 */
class FakeClient {
  readonly calls: { params: Params; options: Options }[] = []

  constructor(private readonly respond: (params: Params) => Promise<FakeResult>) {}

  callTool(
    params: Params & { _meta?: Record<string, unknown> },
    options?: Options & { timeout?: number; onprogress?: (progress: unknown) => void },
  ): Promise<FakeResult> {
    this.calls.push({ params, options })
    return this.respond(params)
  }
}

interface FakeResult {
  content: { type: "text"; text: string }[]
  structuredContent?: unknown
  isError?: boolean
}

const signal: AbortSignal = { aborted: false }

describe("toolCallerFromClient", () => {
  it("calls the client's callTool with name, arguments and options", async () => {
    const client = new FakeClient(() => Promise.resolve({ content: [] }))
    const args = { id: 7 }
    const options = { signal }

    await toolCallerFromClient(client)("get_order", args, options)

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]?.params).toEqual({ name: "get_order", arguments: args })
    expect(client.calls[0]?.params.arguments).toBe(args)
    expect(client.calls[0]?.options).toBe(options)
  })

  it("passes no options when the call has none", async () => {
    const client = new FakeClient(() => Promise.resolve({ content: [] }))

    await toolCallerFromClient(client)("ping", {})

    expect(client.calls[0]?.options).toBeUndefined()
  })

  it("resolves with the client's raw result, a tool failure included", async () => {
    const result = { content: [{ type: "text" as const, text: "nope" }], isError: true }
    const client = new FakeClient(() => Promise.resolve(result))

    await expect(toolCallerFromClient(client)("t", {})).resolves.toBe(result)
  })

  it("rejects with the client's own error", async () => {
    const failure = new Error("MCP error -32602: Unknown tool")
    const client = new FakeClient(() => Promise.reject(failure))

    await expect(toolCallerFromClient(client)("t", {})).rejects.toBe(failure)
  })

  it("feeds createTypedCallTool", async () => {
    interface Map {
      get_order: { input: { id: number }; output: { id: number; status: string } }
    }
    const client = new FakeClient(({ arguments: args }) =>
      Promise.resolve({ content: [], structuredContent: { ...args, status: "open" } }),
    )

    const order = await createTypedCallTool<Map>(toolCallerFromClient(client))("get_order", {
      id: 7,
    })

    expect(order).toEqual({ id: 7, status: "open" })
  })
})
