import http from "node:http"
import net from "node:net"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fetchTools } from "./fetch-tools.js"
import { startTestServer, type TestServer } from "./test-support/server.js"

/**
 * `fetchTools` against a real mcp-use server over a loopback socket: the
 * handshake the CLI performs at build time. Unit tests cannot see transport
 * regressions (initialize, header propagation, refused connections), which
 * is what an mcp-use or @modelcontextprotocol/client bump can break.
 */

/** A free TCP port: bind port 0 and release it again. */
async function closedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

describe("fetchTools against a real mcp-use server", { timeout: 30_000 }, () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startTestServer()
  }, 30_000)

  afterAll(async () => {
    await server?.close()
  })

  beforeEach(() => {
    server.requests.length = 0
  })

  it("returns every tool with its schemas and annotations", async () => {
    const tools = await fetchTools({ url: server.url })
    const byName = new Map(tools.map((tool) => [tool.name, tool]))
    expect([...byName.keys()].sort()).toEqual(["create_task", "list_tasks"])

    const list = byName.get("list_tasks")
    expect(list?.description).toBe("Lists the tasks.")
    expect(list?.annotations).toMatchObject({ readOnlyHint: true })
    expect(list?.inputSchema).toMatchObject({
      type: "object",
      properties: { status: { type: "string", enum: ["open", "done"] } },
    })
    expect(list?.outputSchema).toMatchObject({
      type: "object",
      properties: { tasks: { type: "array", items: { type: "string" } } },
    })

    const create = byName.get("create_task")
    expect(create?.annotations).toMatchObject({ destructiveHint: false })
    expect(create?.annotations?.readOnlyHint).not.toBe(true)
    expect(create?.inputSchema).toMatchObject({
      properties: { title: { type: "string", description: "The task's title." } },
      required: ["title"],
    })
    expect(create?.title).toBe("Create task")
    expect(list?.title).toBeUndefined()
    expect(create?.outputSchema, "a tool without outputSchema must not grow one").toBeUndefined()
  })

  it("sends bearer auth as the Authorization header", async () => {
    await fetchTools({ url: server.url, auth: { mode: "bearer", token: "test-token-123" } })
    expect(server.requests.length).toBeGreaterThan(0)
    expect(
      server.requests.every((headers) => headers.authorization === "Bearer test-token-123"),
    ).toBe(true)
  })

  it("sends header-mode auth under the configured name, and the extra headers", async () => {
    await fetchTools({
      url: server.url,
      auth: { mode: "header", headerName: "X-Api-Key", value: "secret-value" },
      headers: { "x-tenant": "acme" },
    })
    expect(server.requests.length).toBeGreaterThan(0)
    for (const headers of server.requests) {
      expect(headers).toMatchObject({ "x-api-key": "secret-value", "x-tenant": "acme" })
      expect(headers.authorization).toBeUndefined()
    }
  })

  it("lets an explicit header override the auth header", async () => {
    await fetchTools({
      url: server.url,
      auth: { mode: "bearer", token: "from-auth" },
      headers: { Authorization: "Bearer from-headers" },
    })
    expect(
      server.requests.every((headers) => headers.authorization === "Bearer from-headers"),
    ).toBe(true)
  })

  it("sends no auth header in none mode", async () => {
    await fetchTools({ url: server.url, auth: { mode: "none" } })
    expect(server.requests.length).toBeGreaterThan(0)
    expect(server.requests.some((headers) => "authorization" in headers)).toBe(false)
  })

  it("rejects, rather than hangs, when the port is closed, naming the origin and the cause", async () => {
    const port = await closedPort()
    await expect(fetchTools({ url: `http://127.0.0.1:${port}/mcp` })).rejects.toMatchObject({
      cause: { message: "fetch failed" },
    })
    await expect(
      fetchTools({ url: `http://127.0.0.1:${port}/s/S3CRET/mcp?key=S3CRET` }),
    ).rejects.toThrow(
      new Error(
        `cannot list the tools of http://127.0.0.1:${port}: fetch failed (ECONNREFUSED): is the server running at that address?`,
      ),
    )
  })

  it("cuts a URL the SDK quotes, such as a redirect target, down to its origin", async () => {
    const redirecting = http.createServer((request, response) => {
      response.writeHead(307, { location: `${request.url ?? "/"}/` }).end()
    })
    await new Promise<void>((resolve) => redirecting.listen(0, "127.0.0.1", resolve))
    const { port } = redirecting.address() as net.AddressInfo
    try {
      const failure: unknown = await fetchTools({
        url: `http://127.0.0.1:${port}/mcp/s/S3CRET`,
      }).catch((error: unknown) => error)
      const { message } = failure as Error
      expect(message).toMatch(
        new RegExp(
          `^cannot list the tools of http://127\\.0\\.0\\.1:${port}: .*Redirect to http://127\\.0\\.0\\.1:${port} `,
        ),
      )
      expect(message).not.toContain("S3CRET")
    } finally {
      await new Promise((resolve) => redirecting.close(resolve))
    }
  })

  it("names the origin when the server answers with an HTTP error", async () => {
    const url = new URL(server.url)
    await expect(fetchTools({ url: `${url.origin}/wrong-path` })).rejects.toThrow(
      new RegExp(`^cannot list the tools of ${url.origin.replaceAll(".", "\\.")}: .*404`),
    )
  })
})
