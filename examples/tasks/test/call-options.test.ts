import {
  createTypedCallTool,
  type ToolCallProgress,
  type TypedCallTool,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import { MCPServer } from "mcp-use"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"
import { connectMcp, type McpConnection } from "../src/mcp-connection.js"

/** A tool that takes `steps × stepMs`, reporting one progress notification per step. */
interface WaitMap {
  wait: { input: { steps: number; stepMs: number }; output: { steps: number } }
}

async function startWaitServer() {
  const server = new MCPServer({ name: "wait", version: "0.0.0" })
  server.tool(
    {
      name: "wait",
      description: "Waits stepMs per step and reports each step as progress.",
      inputSchema: z.object({ steps: z.number(), stepMs: z.number() }),
    },
    async ({ steps, stepMs }, ctx) => {
      for (let step = 1; step <= steps && !ctx.signal.aborted; step++) {
        await new Promise((resolve) => setTimeout(resolve, stepMs))
        await ctx.reportProgress(step, steps, `step ${step}`)
      }
      return { content: [{ type: "text", text: JSON.stringify({ steps }) }] }
    },
  )
  const { port } = await server.listen(0, { host: "127.0.0.1" })
  return { url: new URL(`http://127.0.0.1:${port}/mcp`), close: () => server.close() }
}

/**
 * ToolCallOptions end to end: a typed call, as the generated client makes it, through
 * toolCallerFromClient and a real MCP SDK client to an mcp-use server. The SDK implements the
 * options; this pins that they reach it under its own names and mean what the docs say.
 */
describe("tool call options over the MCP SDK", () => {
  let server: Awaited<ReturnType<typeof startWaitServer>>
  let connection: McpConnection
  let call: TypedCallTool<WaitMap>

  beforeAll(async () => {
    server = await startWaitServer()
    connection = await connectMcp(server.url, "call-options-test")
    call = createTypedCallTool<WaitMap>(connection.callTool)
  })

  afterAll(async () => {
    await connection?.close()
    await server?.close()
  })

  it("reports every progress notification of the call to onprogress", async () => {
    const updates: ToolCallProgress[] = []

    const output = await call(
      "wait",
      { steps: 3, stepMs: 10 },
      { onprogress: (update) => updates.push(update) },
    )

    expect(output).toEqual({ steps: 3 })
    expect(updates).toEqual([
      { progress: 1, total: 3, message: "step 1" },
      { progress: 2, total: 3, message: "step 2" },
      { progress: 3, total: 3, message: "step 3" },
    ])
  })

  it("fails a call that outlasts its timeout", async () => {
    await expect(call("wait", { steps: 4, stepMs: 100 }, { timeout: 150 })).rejects.toThrow(
      "Request timed out",
    )
  })

  // 300 ms in all, a notification every 60: the 200 ms timeout starts again before it runs out.
  it("keeps a call past its timeout while progress arrives, with resetTimeoutOnProgress", async () => {
    const options = { timeout: 200, resetTimeoutOnProgress: true, onprogress: () => undefined }

    await expect(call("wait", { steps: 5, stepMs: 60 }, options)).resolves.toEqual({ steps: 5 })
  })

  // The SDK checks maxTotalTimeout when a notification would start the timeout again: the one at
  // 300 ms is the first past 250.
  it("fails a call that progress keeps alive past maxTotalTimeout, at its next notification", async () => {
    const options = {
      timeout: 200,
      resetTimeoutOnProgress: true,
      maxTotalTimeout: 250,
      onprogress: () => undefined,
    }

    await expect(call("wait", { steps: 6, stepMs: 60 }, options)).rejects.toThrow(
      "Maximum total timeout exceeded",
    )
  })

  // What the docs say: without resetTimeoutOnProgress the SDK never checks maxTotalTimeout.
  it("leaves a call without resetTimeoutOnProgress to its timeout, whatever maxTotalTimeout says", async () => {
    const options = { timeout: 2_000, maxTotalTimeout: 50, onprogress: () => undefined }

    await expect(call("wait", { steps: 3, stepMs: 60 }, options)).resolves.toEqual({ steps: 3 })
  })
})
