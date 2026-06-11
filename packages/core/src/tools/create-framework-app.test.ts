import type { McpServerInstance } from "mcp-use/server"
import { describe, expect, it } from "vitest"
import {
  createFrameworkApp,
  type CreateFrameworkAppOptionsWithoutOAuth,
} from "./create-framework-app.js"

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
    // No upstream proxies / plugins: keeps the boot hermetic. An empty proxy
    // list short-circuits proxy registration + module discovery.
    proxies: [],
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
