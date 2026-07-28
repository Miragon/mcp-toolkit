import type { McpServerInstance, SessionStore } from "mcp-use/server"
import { describe, expect, it } from "vitest"
import {
  createFrameworkApp,
  type CreateFrameworkAppOptionsWithoutOAuth,
} from "./create-framework-app.js"
import { parseDashboardRecord } from "./index.js"

/**
 * `registeredTools` on the booted MCPServer is an array of the registered
 * tool *names* — exactly what we need to assert which tools the framework
 * surface exposes for a given `app.builder` setting.
 */
function toolNames(server: McpServerInstance<boolean>): string[] {
  return (server as unknown as { registeredTools: string[] }).registeredTools
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
    const names = toolNames(server)

    for (const t of CORE_TOOLS) expect(names).toContain(t)
    for (const t of BUILDER_TOOLS) expect(names).not.toContain(t)
  })

  it("does not register the builder/dashboard tools when builder is explicitly false", async () => {
    const server = await createFrameworkApp(options(false))
    const names = toolNames(server)

    for (const t of CORE_TOOLS) expect(names).toContain(t)
    for (const t of BUILDER_TOOLS) expect(names).not.toContain(t)
  })

  it("registers the core tools AND the builder/dashboard tools when builder is true", async () => {
    const server = await createFrameworkApp(options(true))
    const names = toolNames(server)

    for (const t of CORE_TOOLS) expect(names).toContain(t)
    for (const t of BUILDER_TOOLS) expect(names).toContain(t)
  })
})

describe("createFrameworkApp — serverOptions pass-through", () => {
  it("hands serverOptions to the MCPServer while the toolkit-owned keys win", async () => {
    const sessionStore: SessionStore = {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      has: () => Promise.resolve(false),
      keys: () => Promise.resolve([]),
    }
    const server = await createFrameworkApp({
      ...options(),
      serverOptions: { instructions: "test-instructions", sessionStore },
    })

    // Options the toolkit doesn't mirror reach the mcp-use server config …
    expect(server.config.instructions).toBe("test-instructions")
    // … and injected backends arrive by reference, not as a copy.
    expect(server.config.sessionStore).toBe(sessionStore)
    // Toolkit-owned keys stay authoritative (spread order: toolkit wins).
    expect(server.config.name).toBe("builder-gate-test")
    expect(server.config.host).toBe("localhost")
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
