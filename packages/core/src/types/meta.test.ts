import { describe, expect, it } from "vitest"
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
 * The wire keys, pinned as literals the toolkit owns.
 *
 * This used to compare `uiMeta()` against mcp-use's `McpAppsAdapter` /
 * `AppsSdkAdapter` output. That coupling bought an automatic upstream check
 * but tied our contract to types mcp-use is free to move — and did move: 2.x
 * removed both adapters along with `RESOURCE_URI_META_KEY` and
 * `UIResourceDefinition`, keeping the equivalents (`buildToolUiMeta`,
 * `UI_RESOURCE_URI_META_KEY`) in an internal `views/` module with no package
 * export.
 *
 * The regression these tests exist for — a widget tool reaching hosts without
 * a resource URI, so it renders as JSON or hangs on the loading skeleton (the
 * 0.7.x regression) — is now guarded where it actually shows up: against the
 * real `tools/list` output, in `examples/test/tasks.smoke.test.ts`. That is a
 * stronger check than comparing two implementations, and it survives an
 * upstream major.
 *
 * What is lost: a silent upstream wire-format change no longer fails here.
 * When bumping mcp-use, diff these keys against the spec and against
 * `views/constants.js` / `views/wire.js` in the new version.
 */
describe("uiMeta — dual-protocol wire keys", () => {
  const meta = uiMeta({ resourceUri: URI, title: "app" })

  it("emits the ext-apps nested key (SEP-1865 `_meta.ui.resourceUri`)", () => {
    expect(meta.ui).toEqual({ resourceUri: URI })
  })

  it("emits the flat ext-apps key hosts still read (`ui/resourceUri`)", () => {
    expect(meta["ui/resourceUri"]).toBe(URI)
  })

  it("emits the Apps-SDK template key (`openai/outputTemplate`)", () => {
    expect(meta["openai/outputTemplate"]).toBe(URI)
  })

  it("keeps all three URI spellings pointing at the same resource", () => {
    const uris = [
      (meta.ui as { resourceUri?: string }).resourceUri,
      meta["ui/resourceUri"],
      meta["openai/outputTemplate"],
    ]
    expect(new Set(uris).size).toBe(1)
  })
})
