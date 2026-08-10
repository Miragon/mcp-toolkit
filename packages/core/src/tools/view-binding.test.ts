import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { MCPServer } from "mcp-use"
import { afterAll, describe, expect, it } from "vitest"
import type { AppPlugin } from "../types/index.js"
import { createFrameworkApp } from "./create-framework-app.js"
import { createWidgetToolRegistrar } from "./register-widget-tool.js"

/**
 * The dual-protocol widget wire contract under native mcp-use views, pinned
 * against a real booted server: the toolkit registers tools with the
 * first-class `view` / `visibility` fields and primes the view registry with
 * the app bundle; mcp-use then owns the `_meta.ui` namespace, the flat
 * `ui/resourceUri` key, and the view resources. A regression here is exactly
 * the failure mode that renders widgets as plain JSON on ext-apps hosts or
 * strands them on the loading skeleton — and it is what an upstream bump
 * that changes the wire derivation must trip over.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-binding-"))
const jsPath = path.join(tmpDir, "mcp-app.js")
const cssPath = path.join(tmpDir, "mcp-app.css")
const BUNDLE_JS = "export const marker = 'view-binding-test-bundle'"
const BUNDLE_CSS = ".marker{color:red}"
fs.writeFileSync(jsPath, BUNDLE_JS)
fs.writeFileSync(cssPath, BUNDLE_CSS)

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function rpc(
  server: MCPServer,
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await server.getHandler()(
    new Request("http://local/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    }),
  )
  const body = await response.text()
  const line = body.split("\n").find((l) => l.startsWith("data: "))
  const payload = JSON.parse(line ? line.slice(6) : body) as {
    result?: Record<string, unknown>
  }
  return payload.result ?? {}
}

function widgetPlugin(): AppPlugin {
  const plugin: AppPlugin<MCPServer> = {
    definition: { name: "binding-test", steps: [], widgets: [] },
    registerWidgetTools: (server, metaDefaults) => {
      const register = createWidgetToolRegistrar(server, {}, metaDefaults)
      register({
        name: "show_widget",
        title: "Show Widget",
        description: "renders the widget",
        visibility: "model",
        handler: () => Promise.resolve({ text: "ok", structuredContent: { ok: true } }),
      })
      register({
        name: "widget_data",
        description: "app-only data feed",
        handler: () => Promise.resolve({ text: "ok", structuredContent: { rows: [] } }),
      })
    },
  }
  return plugin as AppPlugin
}

async function bootedServer(): Promise<MCPServer> {
  return createFrameworkApp({
    name: "view-binding-test",
    plugins: [widgetPlugin()],
    app: {
      bundle: { jsPath, cssPath },
      csp: { connectDomains: ["https://api.example"] },
    },
  })
}

describe("native view binding — tools/list wire contract", () => {
  it("emits the dual-protocol resource-uri keys on a view-bound widget tool", async () => {
    const tools = (await rpc(await bootedServer(), "tools/list")).tools as {
      name: string
      _meta?: Record<string, unknown>
    }[]
    const board = tools.find((t) => t.name === "show_widget")
    const meta = board?._meta
    expect((meta?.ui as { resourceUri?: string } | undefined)?.resourceUri).toBe(
      "ui://views/show_widget.html",
    )
    expect(meta?.["ui/resourceUri"]).toBe("ui://views/show_widget.html")
    // The Apps SDK keys the registrar stamps pass through mcp-use untouched.
    expect(meta?.["openai/outputTemplate"]).toBe("ui://views/show_widget.html")
    expect(meta?.["openai/widgetAccessible"]).toBe(true)
  })

  it("emits the app-only visibility marker on a data feed, without a resource uri", async () => {
    const tools = (await rpc(await bootedServer(), "tools/list")).tools as {
      name: string
      _meta?: Record<string, unknown>
    }[]
    const feed = tools.find((t) => t.name === "widget_data")
    const ui = feed?._meta?.ui as { visibility?: string[]; resourceUri?: string } | undefined
    expect(ui?.visibility).toEqual(["app"])
    expect(ui?.resourceUri).toBeUndefined()
  })

  it("binds render-view to its own view resource", async () => {
    const tools = (await rpc(await bootedServer(), "tools/list")).tools as {
      name: string
      _meta?: Record<string, unknown>
    }[]
    const renderView = tools.find((t) => t.name === "render-view")
    expect((renderView?._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri).toBe(
      "ui://views/render-view.html",
    )
  })
})

describe("native view binding — view resources", () => {
  it("lists one mcp-app resource per bound view, CSP included", async () => {
    const resources = (await rpc(await bootedServer(), "resources/list")).resources as {
      uri: string
      mimeType?: string
      _meta?: Record<string, unknown>
    }[]
    const uris = resources.map((r) => r.uri)
    expect(uris).toContain("ui://views/render-view.html")
    expect(uris).toContain("ui://views/show_widget.html")
    // The app-only feed binds no view — no resource for it.
    expect(uris).not.toContain("ui://views/widget_data.html")

    const view = resources.find((r) => r.uri === "ui://views/show_widget.html")
    expect(view?.mimeType).toBe("text/html;profile=mcp-app")
    const csp = (view?._meta?.ui as { csp?: { connectDomains?: string[] } } | undefined)?.csp
    // Our configured origin plus the request-resolved server origin mcp-use
    // appends at emission time.
    expect(csp?.connectDomains).toContain("https://api.example")
  })

  it("serves the synthesized view document embedding the app bundle", async () => {
    const read = await rpc(await bootedServer(), "resources/read", {
      uri: "ui://views/show_widget.html",
    })
    const content = (read.contents as { mimeType?: string; text?: string }[] | undefined)?.[0]
    expect(content?.mimeType).toBe("text/html;profile=mcp-app")
    expect(content?.text).toContain(BUNDLE_JS)
    expect(content?.text).toContain(BUNDLE_CSS)
  })
})
