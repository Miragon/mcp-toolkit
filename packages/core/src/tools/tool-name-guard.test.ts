import { MCPServer, registerViews } from "mcp-use"
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"
import type { AppPlugin } from "../types/index.js"
import { createFrameworkApp } from "./create-framework-app.js"
import { installToolkit } from "./install-toolkit.js"
import { createToolRegistrar } from "./register-tool.js"
import { createWidgetToolRegistrar } from "./register-widget-tool.js"
import { duplicateToolNameMessage, installToolNameGuard } from "./tool-name-guard.js"

/**
 * Tool-name collisions (#175, review finding N8). mcp-use's `server.tool` is
 * a plain map set — a second registration under a taken name silently
 * replaces the first. Under `installToolkit` the toolkit owns the boot order
 * (module tools → framework tools → module widget tools → refresh-view), so
 * it can name BOTH owners of a collision. 2.x keeps the boot working (warn);
 * `duplicateToolNames: "throw"` makes it a boot error.
 */

function primeRenderView(server: MCPServer): void {
  server[registerViews]({ "render-view": { kind: "inline", js: "", css: "" } })
}

async function callText(server: MCPServer, name: string): Promise<string> {
  const response = await server.fetch(
    new Request("http://local/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: {} },
      }),
    }),
  )
  const body = await response.text()
  const line = body.split("\n").find((l) => l.startsWith("data: "))
  const payload = JSON.parse(line ? line.slice(6) : body) as {
    result?: { content?: { text?: string }[] }
  }
  return payload.result?.content?.[0]?.text ?? ""
}

/** A module whose domain tool (via the registrar) answers with its own name. */
function toolModule(name: string, toolName: string): AppPlugin {
  const plugin: AppPlugin<MCPServer> = {
    definition: { name, steps: [], widgets: [] },
    registerTools: (server) => {
      const register = createToolRegistrar(server, {})
      register({ name: toolName, description: "", handler: () => Promise.resolve(`from ${name}`) })
    },
  }
  return plugin as AppPlugin
}

/** A module contributing one widget tool from its registerWidgetTools hook. */
function widgetModule(name: string, toolName: string): AppPlugin {
  const plugin: AppPlugin<MCPServer> = {
    definition: { name, steps: [], widgets: [] },
    registerWidgetTools: (server, metaDefaults) => {
      const register = createWidgetToolRegistrar(server, {}, metaDefaults)
      register({
        name: toolName,
        description: "",
        handler: () => Promise.resolve({ text: `from ${name}`, structuredContent: {} }),
      })
    },
  }
  return plugin as AppPlugin
}

describe("duplicateToolNameMessage", () => {
  it("names the tool and both owners, and how mcp-use resolves it, when warning", () => {
    const message = duplicateToolNameMessage("x", 'module "a"', 'module "b"', "warn")
    expect(message).toContain('Duplicate tool name "x"')
    expect(message).toContain('already registered by module "a"')
    expect(message).toContain('registered again by module "b"')
    expect(message).toContain("replaces")
    expect(message).toContain('duplicateToolNames: "throw"')
    // Both entry points own the setting: installToolkit's options, and the
    // `app` options of createFrameworkApp, which never calls it for you.
    expect(message).toContain("installToolkit")
    expect(message).toContain("createFrameworkApp's app options")
  })

  it("drops the last-wins note when the registration is refused", () => {
    const message = duplicateToolNameMessage("x", 'module "a"', 'module "b"', "throw")
    expect(message).toContain('Duplicate tool name "x"')
    expect(message).not.toContain("replaces")
    expect(message).toContain("rename one of them")
  })
})

describe("installToolNameGuard", () => {
  const noop = () => Promise.resolve({ content: [] })

  it('keeps one wrapper per server and lets a later "throw" escalate the policy', () => {
    const server = new MCPServer({ name: "escalate", version: "0.0.0" })
    installToolNameGuard(server, "warn")
    installToolNameGuard(server, "throw")
    server.tool({ name: "once" }, noop)

    expect(() => server.tool({ name: "once" }, noop)).toThrow(/"once".*application code/)
  })

  it('never downgrades an installed "throw" to "warn"', () => {
    const server = new MCPServer({ name: "no-downgrade", version: "0.0.0" })
    installToolNameGuard(server, "throw")
    installToolNameGuard(server, "warn")
    server.tool({ name: "once" }, noop)

    expect(() => server.tool({ name: "once" }, noop)).toThrow(/Duplicate tool name "once"/)
  })

  it("leaves a name free when mcp-use rejects the registration", () => {
    const server = new MCPServer({ name: "rejected", version: "0.0.0" })
    installToolNameGuard(server, "throw")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    // mcp-use refuses both before it stores the tool: `noauth` needs an
    // OAuth server with mixedAuth, a view binding needs an outputSchema.
    expect(() =>
      server.tool({ name: "fallback", securitySchemes: [{ type: "noauth" }] }, noop),
    ).toThrow(/noauth/)
    expect(() =>
      server.tool({ name: "fallback", view: { name: "fallback" } } as { name: string }, noop),
    ).toThrow(/outputSchema/)

    // The module's fallback registration under the same name is not a duplicate…
    expect(() => server.tool({ name: "fallback" }, noop)).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
    // …and the registration mcp-use accepted does claim the name.
    expect(() => server.tool({ name: "fallback" }, noop)).toThrow(/Duplicate tool name "fallback"/)
    warn.mockRestore()
  })

  it("reports no replacement when mcp-use refuses the duplicate itself", () => {
    const server = new MCPServer({ name: "refused-duplicate", version: "0.0.0" })
    installToolNameGuard(server, "warn")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    server.tool({ name: "kept" }, noop)

    // mcp-use throws before storing it, so the first tool is NOT replaced —
    // a "replaces the one from …" warning would be false.
    expect(() =>
      server.tool({ name: "kept", securitySchemes: [{ type: "noauth" }] }, noop),
    ).toThrow(/noauth/)
    expect(warn).not.toHaveBeenCalled()

    server.tool({ name: "kept" }, noop)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe("installToolkit — duplicate tool names", () => {
  let warn: MockInstance<typeof console.warn>

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it("stays silent for a collision-free install", () => {
    const server = new MCPServer({ name: "clean", version: "0.0.0" })

    installToolkit(server, {
      modules: [toolModule("alpha", "alpha_list"), widgetModule("alpha-ui", "alpha_feed")],
      builder: true,
    })

    expect(warn).not.toHaveBeenCalled()
  })

  it("warns by default, naming both modules, and keeps mcp-use's last-wins result", async () => {
    const server = new MCPServer({ name: "warn", version: "0.0.0" })

    installToolkit(server, {
      modules: [toolModule("alpha", "shared_tool"), toolModule("beta", "shared_tool")],
    })
    primeRenderView(server)

    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('Duplicate tool name "shared_tool"')
    expect(message).toContain('already registered by module "alpha"')
    expect(message).toContain('registered again by module "beta"')
    // Unchanged 2.x behaviour: the boot works, the later registration wins.
    expect(await callText(server, "shared_tool")).toContain("from beta")
  })

  it('throws with duplicateToolNames: "throw", naming both modules', () => {
    const server = new MCPServer({ name: "throw", version: "0.0.0" })

    expect(() =>
      installToolkit(server, {
        modules: [toolModule("alpha", "shared_tool"), toolModule("beta", "shared_tool")],
        duplicateToolNames: "throw",
      }),
    ).toThrow(/"shared_tool".*module "alpha".*module "beta"/)
  })

  it("reserves the framework tool names against module tools", () => {
    const server = new MCPServer({ name: "reserved", version: "0.0.0" })

    expect(() =>
      installToolkit(server, {
        modules: [toolModule("rogue", "render-view")],
        duplicateToolNames: "throw",
      }),
    ).toThrow(/"render-view".*module "rogue".*the toolkit framework/)
  })

  it("attributes widget tools to their module, not to the framework", () => {
    const server = new MCPServer({ name: "widget-collision", version: "0.0.0" })

    expect(() =>
      installToolkit(server, {
        modules: [widgetModule("rogue-ui", "get-framework-manifest")],
        duplicateToolNames: "throw",
      }),
    ).toThrow(/"get-framework-manifest".*the toolkit framework.*module "rogue-ui"/)
  })

  it("reserves a custom refresh tool name and the opt-in builder tools", () => {
    expect(() =>
      installToolkit(new MCPServer({ name: "refresh", version: "0.0.0" }), {
        modules: [toolModule("rogue", "reload-view")],
        refreshToolName: "reload-view",
        duplicateToolNames: "throw",
      }),
    ).toThrow(/"reload-view".*module "rogue".*the toolkit framework/)

    expect(() =>
      installToolkit(new MCPServer({ name: "builder", version: "0.0.0" }), {
        modules: [toolModule("rogue", "save-dashboard")],
        builder: true,
        duplicateToolNames: "throw",
      }),
    ).toThrow(/"save-dashboard".*module "rogue".*the toolkit framework/)
  })

  it("guards the standard path — own tools registered after installToolkit", () => {
    const server = new MCPServer({ name: "standard", version: "0.0.0" })
    installToolkit(server, {
      modules: [toolModule("tasks", "create_task")],
      duplicateToolNames: "throw",
    })
    const noop = () => Promise.resolve({ content: [] })

    expect(() => server.tool({ name: "render-view" }, noop)).toThrow(
      /"render-view".*the toolkit framework.*application code/,
    )
    expect(() => server.tool({ name: "create_task" }, noop)).toThrow(
      /"create_task".*module "tasks".*application code/,
    )
    expect(() => server.tool({ name: "echo" }, noop)).not.toThrow()
  })

  it("cannot see own tools registered BEFORE installToolkit — why they go after it", () => {
    // mcp-use has no public tool listing, so the guard installed by
    // installToolkit knows nothing about earlier registrations: the
    // framework's render-view silently replaces this one. The documented
    // standard path (examples/standalone-host) therefore installs first.
    const server = new MCPServer({ name: "too-early", version: "0.0.0" })
    server.tool({ name: "render-view", description: "app's own" }, () =>
      Promise.resolve({ content: [] }),
    )

    expect(() => installToolkit(server, { duplicateToolNames: "throw" })).not.toThrow()
  })

  it("keeps guarding registrations made by application code after the install", () => {
    const server = new MCPServer({ name: "late", version: "0.0.0" })
    installToolkit(server, { duplicateToolNames: "throw" })

    expect(() =>
      server.tool({ name: "refresh-view", description: "late shadow" }, () =>
        Promise.resolve({ content: [] }),
      ),
    ).toThrow(/"refresh-view".*the toolkit framework.*application code/)
  })

  it("is threaded through createFrameworkApp's app.duplicateToolNames", async () => {
    await expect(
      createFrameworkApp({
        name: "framework-app",
        version: "0.0.0",
        plugins: [toolModule("alpha", "shared_tool"), toolModule("beta", "shared_tool")],
        app: {
          bundle: { jsPath: "/nonexistent/mcp-app.js" },
          duplicateToolNames: "throw",
        },
      }),
    ).rejects.toThrow(/"shared_tool".*module "alpha".*module "beta"/)
  })
})
