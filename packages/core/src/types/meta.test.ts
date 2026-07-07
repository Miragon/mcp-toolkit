import { describe, expect, it } from "vitest"
import {
  AppsSdkAdapter,
  McpAppsAdapter,
  RESOURCE_URI_META_KEY,
  type UIResourceDefinition,
} from "mcp-use/server"
import { APP_ONLY_META, uiMeta } from "./meta.js"

const URI = "ui://app/mcp-app.hash.html"

describe("APP_ONLY_META", () => {
  it("is the SEP-1865 app-only visibility marker without a resourceUri", () => {
    expect(APP_ONLY_META).toEqual({ ui: { visibility: ["app"] } })
  })
})

describe("uiMeta", () => {
  it("emits the full dual-protocol contract for a model-visible widget tool", () => {
    expect(uiMeta({ resourceUri: URI, title: "Cockpit" })).toEqual({
      ui: { resourceUri: URI },
      "ui/resourceUri": URI,
      "openai/outputTemplate": URI,
      "openai/toolInvocation/invoking": "Loading Cockpit...",
      "openai/toolInvocation/invoked": "Cockpit ready",
      "openai/widgetAccessible": true,
      "openai/resultCanProduceWidget": true,
    })
  })

  it("falls back to generic invocation strings without a title", () => {
    const meta = uiMeta({ resourceUri: URI })
    expect(meta["openai/toolInvocation/invoking"]).toBe("Loading view...")
    expect(meta["openai/toolInvocation/invoked"]).toBe("View ready")
  })

  it("prefers explicit invoking/invoked strings over the title defaults", () => {
    const meta = uiMeta({
      resourceUri: URI,
      title: "Cockpit",
      invoking: "Rendering view...",
      invoked: "View rendered",
    })
    expect(meta["openai/toolInvocation/invoking"]).toBe("Rendering view...")
    expect(meta["openai/toolInvocation/invoked"]).toBe("View rendered")
  })

  it("emits widgetDescription and widgetCSP only when provided", () => {
    expect(uiMeta({ resourceUri: URI })).not.toHaveProperty("openai/widgetDescription")
    expect(uiMeta({ resourceUri: URI })).not.toHaveProperty("openai/widgetCSP")

    const csp = { connect_domains: ["http://localhost:8400"] }
    const meta = uiMeta({
      resourceUri: URI,
      widgetDescription: "Shows the cockpit",
      widgetCSP: csp,
    })
    expect(meta["openai/widgetDescription"]).toBe("Shows the cockpit")
    expect(meta["openai/widgetCSP"]).toEqual(csp)
  })

  it("keeps app-only widget tools free of the dual-protocol keys", () => {
    // Their results are consumed by an already rendered widget via callTool;
    // an output template would invite hosts to render them.
    expect(uiMeta({ resourceUri: URI, appOnly: true })).toEqual({
      ui: { resourceUri: URI, visibility: ["app"] },
    })
  })

  it("emits only visibility for an app-only tool without UI", () => {
    expect(uiMeta({ appOnly: true })).toEqual({ ui: { visibility: ["app"] } })
  })

  it("emits an empty ui object when neither option is set", () => {
    expect(uiMeta({})).toEqual({ ui: {} })
  })

  it("treats appOnly: false like a model-visible widget tool", () => {
    const meta = uiMeta({ resourceUri: URI, appOnly: false })
    expect(meta.ui).toEqual({ resourceUri: URI })
    expect(meta["ui/resourceUri"]).toBe(URI)
  })
})

/**
 * Pins our hand-written literals against what mcp-use's own protocol adapters
 * emit for native `mcpApps` widgets. If a future mcp-use bump changes the wire
 * contract, these fail loudly instead of widgets silently hanging on their
 * loading skeleton on ext-apps hosts (the 0.7.x regression).
 */
describe("uiMeta parity with mcp-use protocol adapters", () => {
  const definition: UIResourceDefinition = { type: "mcpApps", name: "app", htmlTemplate: "<div/>" }
  const meta = uiMeta({ resourceUri: URI, title: "app" })

  it("matches the ext-apps flat resource-uri key", () => {
    expect(meta[RESOURCE_URI_META_KEY]).toBe(URI)
  })

  it("matches McpAppsAdapter tool metadata (nested ui + flat key)", () => {
    const native = new McpAppsAdapter().buildToolMetadata(definition, URI)
    for (const [key, value] of Object.entries(native)) {
      expect(meta[key], `key ${key}`).toEqual(value)
    }
  })

  it("matches AppsSdkAdapter tool metadata (openai/outputTemplate)", () => {
    const native = new AppsSdkAdapter().buildToolMetadata(definition, URI)
    for (const [key, value] of Object.entries(native)) {
      expect(meta[key], `key ${key}`).toEqual(value)
    }
  })
})
