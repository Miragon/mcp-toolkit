import type { MCPServer } from "mcp-use"
import { describe, expect, it } from "vitest"
import {
  createFrameworkApp,
  type CreateFrameworkAppOptionsWithoutOAuth,
} from "./create-framework-app.js"
import { parseDashboardRecord } from "./index.js"

/**
 * Ask the booted server for its tool surface the way a client would.
 *
 * mcp-use 2.x dropped the `registeredTools` array this used to read, and its
 * transport is session-less, so a single `tools/list` through the server's own
 * fetch boundary needs no handshake and no socket. Asserting on the real
 * listing is also the stronger check: it covers registration *and* everything
 * the middleware chain does to the listing on the way out.
 */
async function toolNames(server: MCPServer): Promise<string[]> {
  const response = await server.getHandler()(
    new Request("http://local/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  )
  const body = await response.text()
  // Streamable HTTP answers as SSE; the JSON-RPC payload is the `data:` line.
  const line = body.split("\n").find((l) => l.startsWith("data: "))
  const payload = JSON.parse(line ? line.slice(6) : body) as {
    result?: { tools?: { name: string }[] }
  }
  return (payload.result?.tools ?? []).map((t) => t.name)
}

/** Builds hermetic options with the given `app.builder` setting (or omit). */
function options(builder?: boolean): CreateFrameworkAppOptionsWithoutOAuth {
  return {
    name: "builder-gate-test",
    version: "0.0.0",
    // No plugins: keeps the boot hermetic.
    plugins: [],
    app: {
      // Pin the resource URI so we don't hash a (missing) bundle file.
      resourceUri: "ui://builder-gate-test/mcp-app.html",
      htmlPath: "/nonexistent/mcp-app.html",
      ...(builder === undefined ? {} : { builder }),
    },
  }
}

// Always-on core surface — widget rendering must work regardless of the flag.
const CORE_TOOLS = ["get-framework-manifest", "render-view", "refresh-view"]
// Opt-in builder platform: catalogue (its data source) + dashboard CRUD.
const BUILDER_TOOLS = [
  "get-builder-catalogue",
  "save-dashboard",
  "list-dashboards",
  "load-dashboard",
  "delete-dashboard",
]

describe("createFrameworkApp — app.builder gate", () => {
  it("registers the core widget tools but NOT the builder/dashboard tools by default (builder omitted)", async () => {
    const server = await createFrameworkApp(options())
    const names = await toolNames(server)

    for (const t of CORE_TOOLS) expect(names).toContain(t)
    for (const t of BUILDER_TOOLS) expect(names).not.toContain(t)
  })

  it("does not register the builder/dashboard tools when builder is explicitly false", async () => {
    const server = await createFrameworkApp(options(false))
    const names = await toolNames(server)

    for (const t of CORE_TOOLS) expect(names).toContain(t)
    for (const t of BUILDER_TOOLS) expect(names).not.toContain(t)
  })

  it("registers the core tools AND the builder/dashboard tools when builder is true", async () => {
    const server = await createFrameworkApp(options(true))
    const names = await toolNames(server)

    for (const t of CORE_TOOLS) expect(names).toContain(t)
    for (const t of BUILDER_TOOLS) expect(names).toContain(t)
  })
})

describe("createFrameworkApp — serverOptions pass-through", () => {
  /**
   * Observed on the wire rather than by reading the server's config object.
   *
   * mcp-use 2.x stopped exposing `config`, and reaching for it through a cast
   * would pin an internal. Everything this guarantee is about shows up in an
   * `initialize` exchange anyway: `instructions` is a pass-through option the
   * toolkit does not mirror, `serverInfo.name` is a toolkit-owned key that has
   * to win the spread, and the CORS response header only appears if the `cors`
   * object reached the constructor.
   */
  it("hands serverOptions to the MCPServer while the toolkit-owned keys win", async () => {
    const cors = { enabled: true, origin: "https://example.test" }
    const server = await createFrameworkApp({
      ...options(),
      serverOptions: { instructions: "test-instructions", cors },
    })

    const response = await server.getHandler()(
      new Request("http://local/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Origin: "https://example.test",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          },
        }),
      }),
    )
    const body = await response.text()
    const line = body.split("\n").find((l) => l.startsWith("data: "))
    const payload = JSON.parse(line ? line.slice(6) : body) as {
      result?: { instructions?: string; serverInfo?: { name?: string } }
    }

    // An option the toolkit doesn't mirror reaches the mcp-use server …
    expect(payload.result?.instructions).toBe("test-instructions")
    // … including an object one, proven by the header it produces.
    expect(response.headers.get("access-control-allow-origin")).toBe("https://example.test")
    // Toolkit-owned keys stay authoritative (spread order: toolkit wins).
    expect(payload.result?.serverInfo?.name).toBe("builder-gate-test")
  })
})

describe("tools barrel — parseDashboardRecord re-export", () => {
  it("exposes the fail-soft record guard for custom DashboardStore implementations", () => {
    const valid = {
      id: "d1",
      name: "Ok",
      layout: { rows: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    }
    expect(parseDashboardRecord(valid)).toMatchObject({ id: "d1" })
    expect(parseDashboardRecord({ garbage: true })).toBeUndefined()
  })
})
