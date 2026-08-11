import { execFile } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "@mcp-use/client"
import type { MCPServer } from "mcp-use"

/**
 * Real-bundle smoke test (FITNESS.md, phase 5b). The other smoke tests boot
 * the host with the tiny pre-built stand-in in `test/fixtures/mcp-app.js`, so
 * a vite/rollup regression that breaks the REAL `build:bundle` output — or a
 * host change that stops embedding it — never turns anything red. This test
 * builds the actual bundle once, hands it to `createFrameworkApp`, and proves
 * over the wire that `resources/read` of a view resource embeds the built
 * artifact byte-for-byte.
 */

const EXAMPLES_DIR = path.join(import.meta.dirname, "..")
const DIST_JS = path.join(EXAMPLES_DIR, "app-bundle", "dist", "mcp-app.js")
const DIST_CSS = path.join(EXAMPLES_DIR, "app-bundle", "dist", "mcp-app.css")

const execFileAsync = promisify(execFile)

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

/**
 * A distinctive slice of a built artifact that survives HTML embedding: the
 * first window of `size` chars containing neither `<` nor `&` (the characters
 * an HTML serializer could escape inside the inline <script>/<style> blocks).
 * The bundle is hundreds of kB of minified code — such a window always exists.
 */
function embeddableChunk(content: string, size = 300): string {
  for (let start = 0; start + size <= content.length; start += size) {
    const window = content.slice(start, start + size)
    if (!window.includes("<") && !window.includes("&")) return window
  }
  throw new Error(
    `no ${size}-char window free of "<" and "&" found in a ${content.length}-char file`,
  )
}

function bundlePlugin(): AppPlugin {
  return { definition: { name: "real-bundle", steps: [], widgets: [] } }
}

describe("real app bundle served through the view resource", () => {
  let app: MCPServer
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    // ONE real vite build for the whole suite — this is the expensive part
    // (cold CI takes tens of seconds; locally ~1s).
    await execFileAsync(
      "pnpm",
      ["--filter", "@miragon/mcp-toolkit-examples", "run", "build:bundle"],
      { cwd: path.join(EXAMPLES_DIR, ".."), maxBuffer: 16 * 1024 * 1024 },
    )

    app = await createFrameworkApp({
      name: "real-bundle-smoke-host",
      version: "0.0.0",
      host: "127.0.0.1",
      plugins: [bundlePlugin()],
      app: {
        bundle: { jsPath: DIST_JS, cssPath: DIST_CSS },
      },
    })
    const port = await getFreePort()
    await app.listen(port)

    client = MCPClient.fromDict({
      mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("host")
  }, 240_000)

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
  })

  it(
    "emits the built vite artifacts (not a stand-in) inside the render-view resource",
    { timeout: 30_000 },
    async () => {
      const js = fs.readFileSync(DIST_JS, "utf8")
      const css = fs.readFileSync(DIST_CSS, "utf8")
      // Guard the guard: an empty/missing build must fail here, not produce
      // trivially-passing empty chunks below.
      expect(js.length).toBeGreaterThan(10_000)
      expect(css.length).toBeGreaterThan(1_000)

      const read = await session.readResource("ui://views/render-view.html")
      const content = read.contents[0]
      expect(content, "the view resource must have one contents entry").toBeTruthy()
      expect(content!.mimeType).toBe("text/html;profile=mcp-app")

      const text = (content as { text?: string }).text ?? ""
      expect(text).toContain(embeddableChunk(js))
      expect(text).toContain(embeddableChunk(css))
    },
  )
})
