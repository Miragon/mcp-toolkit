import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "@mcp-use/client"
import type { MCPServer } from "mcp-use"
import { createPlugin as createArticlesPlugin } from "../modules/articles/plugin.js"
import type { Article } from "../modules/articles/store.js"
import { GOLDEN_HINT, loadOrUpdateGolden, stableSort } from "./helpers/golden.js"

/**
 * In-process smoke test for the `articles` module — the tool-codegen example:
 * a self-owned module whose tool surface (`articles_*`) is the runtime twin of
 * the committed generated client. Boots a real MCP server via
 * `createFrameworkApp` with `createArticlesPlugin()` over a loopback socket and
 * drives it with an MCP client, proving the prefixed tools appear in
 * `tools/list` and round-trip through real calls.
 *
 * Runs in CI through the root `pnpm -r --if-present run test`.
 */

const FIXTURE_JS = path.join(import.meta.dirname, "fixtures", "mcp-app.js")

/** Reserve a free TCP port by binding to port 0 and releasing it again. */
async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

describe("articles module smoke", () => {
  let app: MCPServer
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    app = await createFrameworkApp({
      name: "articles-smoke-host",
      version: "0.0.0",
      host: "127.0.0.1",
      plugins: [createArticlesPlugin()],
      app: {
        bundle: { jsPath: FIXTURE_JS },
      },
    })
    const port = await getFreePort()
    await app.listen(port)

    client = MCPClient.fromDict({
      mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("host")
  })

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
  })

  it("advertises the module's own articles_* tools in tools/list", async () => {
    const names = (await session.listTools()).map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(["articles_list-articles", "articles_get-article"]),
    )
  })

  it("articles_list-articles returns the seeded articles as structuredContent", async () => {
    const result = await session.callTool("articles_list-articles", {})
    expect(result.isError).toBeFalsy()

    const sc = result.structuredContent as { articles?: Article[] } | undefined
    expect(Array.isArray(sc?.articles)).toBe(true)
    expect(sc!.articles!.length).toBeGreaterThan(0)
    const first = sc!.articles![0]!
    expect(typeof first.id).toBe("string")
    expect(typeof first.title).toBe("string")
    expect(typeof first.author).toBe("string")
  })

  it("articles_get-article round-trips an id from the list", async () => {
    const list = await session.callTool("articles_list-articles", {})
    const { articles } = list.structuredContent as { articles: Article[] }
    const wanted = articles[0]!

    const result = await session.callTool("articles_get-article", { id: wanted.id })
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toEqual(wanted)
  })

  it("articles_get-article on an unknown id surfaces a tool error (the store throws)", async () => {
    // `store.get` throws `unknown article: <id>`; the server maps the thrown
    // handler error to an `isError` tool result rather than a protocol error.
    const result = await session.callTool("articles_get-article", { id: "does-not-exist" })
    expect(result.isError).toBe(true)
  })

  it("the articles host's tools/list matches the golden", async () => {
    const tools = (await session.listTools()) as { name: string }[]
    tools.sort((a, b) => a.name.localeCompare(b.name))
    const actual = stableSort(tools)
    expect(actual, GOLDEN_HINT).toEqual(loadOrUpdateGolden("tools-articles", actual))
  })
})
