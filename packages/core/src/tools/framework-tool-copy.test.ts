import { MCPServer, registerViews } from "mcp-use"
import { describe, expect, it } from "vitest"
import { appsSdkMeta } from "../types/meta.js"
import { installToolkit } from "./install-toolkit.js"

/**
 * The words the framework itself puts into a host's chat chrome: tool titles
 * (a host lists them next to every call) and the Apps SDK status lines
 * ("Loading …", "… ready"). They follow the toolkit's English rules: a title
 * on every tool, sentence case, and a real ellipsis ("…", never "...").
 */

/** Words that keep their capital inside a title (product and protocol names). */
const PROPER_NOUNS = new Set(["MCP", "AI", "API", "ID", "JSON", "UI", "URL"])

/** Every word after the first starts lower-case unless it is a proper noun. */
const isSentenceCase = (title: string) =>
  title
    .split(/\s+/)
    .slice(1)
    .every((word) => PROPER_NOUNS.has(word) || !/^[A-Z]/.test(word))

interface ListedTool {
  name: string
  title?: string
  _meta?: Record<string, unknown>
}

async function listTools(server: MCPServer): Promise<ListedTool[]> {
  server[registerViews]({ "render-view": { kind: "inline", js: "", css: "" } })
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
  const payload = JSON.parse(line ? line.slice(6) : body) as { result?: { tools?: ListedTool[] } }
  return payload.result?.tools ?? []
}

describe("framework tool copy (titles and status lines a host shows)", () => {
  it("gives every framework tool a sentence-case title without '...'", async () => {
    const server = new MCPServer({ name: "copy-server", version: "0.0.0" })
    installToolkit(server, { builder: true })
    const tools = await listTools(server)

    expect(tools.map((t) => t.name).sort()).toEqual([
      "delete-dashboard",
      "get-builder-catalogue",
      "get-framework-manifest",
      "list-dashboards",
      "load-dashboard",
      "refresh-view",
      "render-view",
      "save-dashboard",
    ])
    for (const tool of tools) {
      expect(tool.title, `${tool.name} needs a title`).toEqual(expect.stringMatching(/\S/))
      expect(isSentenceCase(tool.title ?? ""), `${tool.name}: "${tool.title}"`).toBe(true)
      expect(tool.title, tool.name).not.toContain("...")
      for (const key of ["openai/toolInvocation/invoking", "openai/toolInvocation/invoked"]) {
        const line = tool._meta?.[key]
        if (line !== undefined) expect(line, `${tool.name} ${key}`).not.toContain("...")
      }
    }
  })

  it("defaults the Apps SDK status lines to a real ellipsis", () => {
    const titled = appsSdkMeta({ resourceUri: "ui://views/x.html", title: "Task board" })
    expect(titled["openai/toolInvocation/invoking"]).toBe("Loading Task board…")
    expect(titled["openai/toolInvocation/invoked"]).toBe("Task board ready")
    const untitled = appsSdkMeta({ resourceUri: "ui://views/x.html" })
    expect(untitled["openai/toolInvocation/invoking"]).toBe("Loading view…")
    expect(untitled["openai/toolInvocation/invoked"]).toBe("View ready")
  })

  it("tells sentence case from title case (self-test)", () => {
    expect(isSentenceCase("Render view")).toBe(true)
    expect(isSentenceCase("Get MCP manifest")).toBe(true)
    expect(isSentenceCase("Render View")).toBe(false)
    expect(isSentenceCase("Get Builder Catalogue")).toBe(false)
  })
})
