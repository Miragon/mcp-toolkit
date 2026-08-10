import { MCPServer, registerViews } from "mcp-use"
import { z } from "zod"
import { describe, expect, it } from "vitest"
import type { AppPlugin } from "../types/index.js"
import { installToolkit } from "./install-toolkit.js"

/**
 * The "standard mcp-use project, toolkit on top" contract: `installToolkit`
 * must add the framework surface to a server the USER constructed — without
 * owning the boot, the views, or the process. View building/serving is out of
 * scope here (the mcp-use CLI or `createFrameworkApp` own that); what this
 * pins is the tool surface and the module hooks.
 */

/**
 * Stand in for the view-delivery owner: mcp-use validates at mount (first
 * request) that every `view`-bound tool has a primed view and fails loud
 * otherwise. In real runs the CLI (or `createFrameworkApp`) primes; these
 * wire tests take that role with an empty inline entry.
 */
function primeRenderView(server: MCPServer): void {
  server[registerViews]({ "render-view": { kind: "inline", js: "", css: "" } })
}

async function listToolNames(server: MCPServer): Promise<string[]> {
  const response = await server.getHandler()(
    new Request("http://local/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  )
  const body = await response.text()
  const line = body.split("\n").find((l) => l.startsWith("data: "))
  const payload = JSON.parse(line ? line.slice(6) : body) as {
    result?: { tools?: { name: string }[] }
  }
  return (payload.result?.tools ?? []).map((t) => t.name)
}

const CORE_TOOLS = ["get-framework-manifest", "render-view", "refresh-view"]
const BUILDER_TOOLS = [
  "get-builder-catalogue",
  "save-dashboard",
  "list-dashboards",
  "load-dashboard",
  "delete-dashboard",
]

describe("installToolkit — toolkit features on a user-owned server", () => {
  it("adds the framework trio next to the user's own tools", async () => {
    const server = new MCPServer({ name: "user-server", version: "0.0.0" })
    server.tool({ name: "ping", description: "user tool" }, () =>
      Promise.resolve({ content: [{ type: "text" as const, text: "pong" }] }),
    )

    installToolkit(server)
    primeRenderView(server)

    const names = await listToolNames(server)
    expect(names).toContain("ping")
    for (const t of CORE_TOOLS) expect(names).toContain(t)
    for (const t of BUILDER_TOOLS) expect(names).not.toContain(t)
  })

  it("registers the builder platform only when opted in", async () => {
    const server = new MCPServer({ name: "builder-server", version: "0.0.0" })
    installToolkit(server, { builder: true })
    primeRenderView(server)

    const names = await listToolNames(server)
    for (const t of [...CORE_TOOLS, ...BUILDER_TOOLS]) expect(names).toContain(t)
  })

  it("loads apps and modules into the returned registries and runs module hooks", () => {
    const server = new MCPServer({ name: "module-server", version: "0.0.0" })
    const hookOrder: string[] = []
    const module: AppPlugin<MCPServer> = {
      definition: {
        name: "mod",
        steps: [],
        widgets: [{ id: "mod:card", description: "card", requires: [], size: "full" }],
      },
      registerTools: (s) => {
        hookOrder.push("registerTools")
        s.tool({ name: "mod_list", description: "module tool", schema: z.object({}) }, () =>
          Promise.resolve({ content: [{ type: "text" as const, text: "[]" }] }),
        )
      },
      registerWidgetTools: () => {
        hookOrder.push("registerWidgetTools")
      },
    }

    const { stepRegistry, widgetRegistry } = installToolkit(server, {
      apps: [
        {
          name: "flat",
          steps: [],
          widgets: [{ id: "flat:kpi", description: "kpi", requires: [], size: "half" }],
        },
      ],
      modules: [module as AppPlugin],
    })

    expect(widgetRegistry.get("flat:kpi")).toBeDefined()
    expect(widgetRegistry.get("mod:card")).toBeDefined()
    expect(stepRegistry.getAll()).toEqual([])
    // Module tools register before the framework tools, widget tools inside.
    expect(hookOrder).toEqual(["registerTools", "registerWidgetTools"])
  })
})
