import { describe, expect, it } from "vitest"
import { appsSdkMeta, viewResourceUri, VIEW_RESOURCE_URI_PREFIX } from "./meta.js"

/**
 * The Apps SDK half of the widget contract, pinned as literals the toolkit
 * owns. The MCP Apps half (`_meta.ui.*`, the flat `ui/resourceUri`, the view
 * resource itself) is emitted natively by mcp-use from the `view` /
 * `visibility` tool fields — `tools/view-binding.test.ts` pins that side
 * against a real server, including that these `openai/*` keys pass through
 * `tools/list` untouched.
 */
describe("viewResourceUri", () => {
  it("builds the mcp-use view resource URI convention", () => {
    expect(viewResourceUri("render-view")).toBe("ui://views/render-view.html")
    expect(viewResourceUri("show_tasks_board")).toBe("ui://views/show_tasks_board.html")
  })

  it("prefixes with the pinned scheme constant", () => {
    expect(viewResourceUri("x").startsWith(VIEW_RESOURCE_URI_PREFIX)).toBe(true)
  })
})

describe("appsSdkMeta", () => {
  const URI = viewResourceUri("show_widget")

  it("emits the Apps SDK widget-rendering keys", () => {
    expect(appsSdkMeta({ resourceUri: URI, title: "Widget" })).toEqual({
      "openai/outputTemplate": URI,
      "openai/toolInvocation/invoking": "Loading Widget...",
      "openai/toolInvocation/invoked": "Widget ready",
      "openai/widgetAccessible": true,
      "openai/resultCanProduceWidget": true,
    })
  })

  it("never emits ui-namespace keys — that namespace is mcp-use-owned", () => {
    const meta = appsSdkMeta({ resourceUri: URI })
    expect(Object.keys(meta).every((key) => key.startsWith("openai/"))).toBe(true)
  })

  it("prefers explicit invocation strings and falls back without a title", () => {
    const explicit = appsSdkMeta({ resourceUri: URI, invoking: "Working...", invoked: "Done" })
    expect(explicit["openai/toolInvocation/invoking"]).toBe("Working...")
    expect(explicit["openai/toolInvocation/invoked"]).toBe("Done")

    const untitled = appsSdkMeta({ resourceUri: URI })
    expect(untitled["openai/toolInvocation/invoking"]).toBe("Loading view...")
    expect(untitled["openai/toolInvocation/invoked"]).toBe("View ready")
  })

  it("includes description and CSP only when provided", () => {
    const bare = appsSdkMeta({ resourceUri: URI })
    expect(bare).not.toHaveProperty("openai/widgetDescription")
    expect(bare).not.toHaveProperty("openai/widgetCSP")

    const full = appsSdkMeta({
      resourceUri: URI,
      widgetDescription: "shows things",
      widgetCSP: { connect_domains: ["https://api.example"] },
    })
    expect(full["openai/widgetDescription"]).toBe("shows things")
    expect(full["openai/widgetCSP"]).toEqual({ connect_domains: ["https://api.example"] })
  })
})
