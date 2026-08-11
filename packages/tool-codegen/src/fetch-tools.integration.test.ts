import net from "node:net"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MCPServer } from "mcp-use"
import { z } from "zod"
import { fetchUpstreamTools } from "./fetch-tools.js"

/**
 * Integration test for `fetchUpstreamTools` (FITNESS.md, phase 5b) against a
 * REAL mcp-use server over a loopback socket — the exact handshake the
 * codegen CLI performs at build time. The unit surface can't see transport
 * regressions (initialize handshake, header propagation, connection refusal),
 * which is precisely what an mcp-use / @modelcontextprotocol/client bump can
 * break.
 */

/** Headers of every HTTP request the upstream saw, captured via middleware. */
const seenHeaders: Record<string, string>[] = []

/** Reserve a free TCP port by binding to port 0 and releasing it again. */
async function getClosedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

describe("fetchUpstreamTools against a real mcp-use server", () => {
  let server: MCPServer
  let upstreamUrl: string

  beforeAll(async () => {
    server = new MCPServer({
      name: "fetch-tools-upstream",
      version: "0.0.0",
      description: "loopback upstream for the codegen handshake test",
    })
    server.use("*", async (c, next) => {
      seenHeaders.push(c.req.header())
      await next()
    })
    server.tool(
      {
        name: "echo_message",
        description: "Echoes the message back.",
        inputSchema: z.object({ message: z.string().describe("The message to echo.") }),
        outputSchema: z.object({ echoed: z.string().describe("The echoed message.") }),
      },
      ({ message }) => ({
        content: [{ type: "text", text: message }],
        structuredContent: { echoed: message },
      }),
    )
    server.tool(
      {
        name: "ping",
        description: "Replies pong; declares no outputSchema.",
      },
      () => ({ content: [{ type: "text", text: "pong" }] }),
    )
    // Deterministic port choice: bind an ephemeral port and read it back.
    const { port } = await server.listen(0, { host: "127.0.0.1" })
    upstreamUrl = `http://127.0.0.1:${port}/mcp`
  }, 30_000)

  afterAll(async () => {
    await server?.close()
  })

  beforeEach(() => {
    seenHeaders.length = 0
  })

  it("returns both tool descriptors with names and schemas", { timeout: 30_000 }, async () => {
    const tools = await fetchUpstreamTools({ upstreamUrl })
    const byName = new Map(tools.map((t) => [t.name, t]))

    const echo = byName.get("echo_message")
    expect(echo, "echo_message must be listed").toBeTruthy()
    expect(echo!.description).toBe("Echoes the message back.")
    expect(echo!.inputSchema).toMatchObject({
      type: "object",
      properties: { message: { type: "string", description: "The message to echo." } },
    })
    expect(echo!.outputSchema).toMatchObject({
      type: "object",
      properties: { echoed: { type: "string" } },
    })

    const ping = byName.get("ping")
    expect(ping, "ping must be listed").toBeTruthy()
    expect(ping!.outputSchema, "a tool without outputSchema must not grow one").toBeUndefined()
  })

  it("sends bearer auth as the Authorization request header", { timeout: 30_000 }, async () => {
    await fetchUpstreamTools({
      upstreamUrl,
      auth: { mode: "bearer", token: "test-token-123" },
    })
    expect(seenHeaders.length).toBeGreaterThan(0)
    expect(seenHeaders.every((h) => h.authorization === "Bearer test-token-123")).toBe(true)
  })

  it("sends header-mode auth under the configured header name", { timeout: 30_000 }, async () => {
    await fetchUpstreamTools({
      upstreamUrl,
      auth: { mode: "header", headerName: "X-Api-Key", value: "secret-value" },
    })
    expect(seenHeaders.length).toBeGreaterThan(0)
    expect(seenHeaders.every((h) => h["x-api-key"] === "secret-value")).toBe(true)
  })

  it("rejects (does not hang) when the upstream port is closed", { timeout: 30_000 }, async () => {
    const closedPort = await getClosedPort()
    await expect(
      fetchUpstreamTools({ upstreamUrl: `http://127.0.0.1:${closedPort}/mcp` }),
    ).rejects.toThrow()
  })
})
