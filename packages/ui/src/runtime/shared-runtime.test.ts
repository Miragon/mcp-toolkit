import { describe, expect, it } from "vitest"
import * as McpUseReact from "mcp-use/react"
import * as ReactQuery from "@tanstack/react-query"
import * as rootBarrel from "../index.js"
import * as appBarrel from "../app/index.js"
import * as hooksBarrel from "../hooks/index.js"
import {
  SHARED_RUNTIME_GLOBALS,
  exposeSharedRuntime,
  assertSharedRuntimeExposed,
  dataUriShim,
  buildSharedRuntimeImportMap,
  MCP_USE_REACT_EXPORTS,
  REACT_QUERY_EXPORTS,
  TOOLKIT_UI_EXPORTS,
  TOOLKIT_UI_APP_EXPORTS,
  TOOLKIT_UI_HOOKS_EXPORTS,
} from "./shared-runtime.js"

describe("dataUriShim", () => {
  it("emits a deterministic data:-URI ES module re-exporting the global namespace", () => {
    const shim = dataUriShim("X", ["a", "b"])
    expect(shim.startsWith("data:text/javascript,const M=globalThis.X;export default M;")).toBe(
      true,
    )
    expect(shim).toContain("export const a=M.a;")
    expect(shim).toContain("export const b=M.b;")
  })

  it("emits only the default export when no named exports are given", () => {
    expect(dataUriShim("Y", [])).toBe("data:text/javascript,const M=globalThis.Y;export default M;")
  })
})

describe("buildSharedRuntimeImportMap", () => {
  it("pins the bare specifier keys exactly", () => {
    const map = buildSharedRuntimeImportMap({
      mcpUseReact: true,
      toolkitUi: true,
      reactQuery: true,
    })
    expect(Object.keys(map).sort()).toEqual([
      "@miragon/mcp-toolkit-ui",
      "@miragon/mcp-toolkit-ui/app",
      "@miragon/mcp-toolkit-ui/hooks",
      "@tanstack/react-query",
      "mcp-use/react",
    ])
  })

  it("includes only the requested subset", () => {
    expect(Object.keys(buildSharedRuntimeImportMap({}))).toEqual([])
    expect(Object.keys(buildSharedRuntimeImportMap({ mcpUseReact: true }))).toEqual([
      "mcp-use/react",
    ])
    expect(Object.keys(buildSharedRuntimeImportMap({ reactQuery: true }))).toEqual([
      "@tanstack/react-query",
    ])
    expect(Object.keys(buildSharedRuntimeImportMap({ toolkitUi: true })).sort()).toEqual([
      "@miragon/mcp-toolkit-ui",
      "@miragon/mcp-toolkit-ui/app",
      "@miragon/mcp-toolkit-ui/hooks",
    ])
  })

  it("maps every specifier to a shim over its canonical global", () => {
    const map = buildSharedRuntimeImportMap({
      mcpUseReact: true,
      toolkitUi: true,
      reactQuery: true,
    })
    expect(map["mcp-use/react"]).toContain(`globalThis.${SHARED_RUNTIME_GLOBALS.mcpUseReact}`)
    expect(map["@miragon/mcp-toolkit-ui"]).toContain(
      `globalThis.${SHARED_RUNTIME_GLOBALS.toolkitUi}`,
    )
    expect(map["@miragon/mcp-toolkit-ui/app"]).toContain(
      `globalThis.${SHARED_RUNTIME_GLOBALS.toolkitUiApp}`,
    )
    expect(map["@miragon/mcp-toolkit-ui/hooks"]).toContain(
      `globalThis.${SHARED_RUNTIME_GLOBALS.toolkitUiHooks}`,
    )
    expect(map["@tanstack/react-query"]).toContain(
      `globalThis.${SHARED_RUNTIME_GLOBALS.reactQuery}`,
    )
  })
})

// ---------------------------------------------------------------------------
// Drift guards: the toolkit-ui shim lists must exactly match the real barrels'
// runtime exports IN BOTH DIRECTIONS, so the import-map shims can never lag a
// barrel change. The third-party lists are curated subsets — existence-only,
// we don't own those packages' full surfaces.
// ---------------------------------------------------------------------------

function runtimeKeys(namespace: Record<string, unknown>): string[] {
  return Object.keys(namespace).sort()
}

describe("shim export lists match the real modules", () => {
  it("TOOLKIT_UI_EXPORTS exactly matches the root barrel's runtime exports", () => {
    expect([...TOOLKIT_UI_EXPORTS].sort()).toEqual(runtimeKeys(rootBarrel))
  })

  it("TOOLKIT_UI_APP_EXPORTS exactly matches the app barrel's runtime exports", () => {
    expect([...TOOLKIT_UI_APP_EXPORTS].sort()).toEqual(runtimeKeys(appBarrel))
  })

  it("TOOLKIT_UI_HOOKS_EXPORTS exactly matches the hooks barrel's runtime exports", () => {
    expect([...TOOLKIT_UI_HOOKS_EXPORTS].sort()).toEqual(runtimeKeys(hooksBarrel))
  })

  it("every MCP_USE_REACT_EXPORTS name exists in mcp-use/react", () => {
    for (const name of MCP_USE_REACT_EXPORTS) {
      expect(
        Object.prototype.hasOwnProperty.call(McpUseReact, name),
        `${name} missing from mcp-use/react`,
      ).toBe(true)
    }
  })

  it("every REACT_QUERY_EXPORTS name exists in @tanstack/react-query", () => {
    for (const name of REACT_QUERY_EXPORTS) {
      expect(
        Object.prototype.hasOwnProperty.call(ReactQuery, name),
        `${name} missing from @tanstack/react-query`,
      ).toBe(true)
    }
  })

  it("shim identifiers are all valid JS identifiers (the shim inlines them)", () => {
    const all = [
      ...MCP_USE_REACT_EXPORTS,
      ...REACT_QUERY_EXPORTS,
      ...TOOLKIT_UI_EXPORTS,
      ...TOOLKIT_UI_APP_EXPORTS,
      ...TOOLKIT_UI_HOOKS_EXPORTS,
      ...Object.values(SHARED_RUNTIME_GLOBALS),
    ]
    for (const name of all) {
      expect(name).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/)
    }
  })
})

describe("exposeSharedRuntime / assertSharedRuntimeExposed", () => {
  it("assigns only defined module namespaces onto the target", () => {
    const target: Record<string, unknown> = {}
    const react = { version: "19.0.0" }
    const reactDom = { createRoot: () => undefined }
    exposeSharedRuntime({ React: react, ReactDOM: reactDom, McpUseReact: undefined }, target)
    expect(target.React).toBe(react)
    expect(target.ReactDOM).toBe(reactDom)
    expect("McpUseReact" in target).toBe(false)
  })

  it("assertSharedRuntimeExposed passes when all names are present", () => {
    const target = { React: {}, ReactQuery: {} }
    expect(() => assertSharedRuntimeExposed(["React", "ReactQuery"], target)).not.toThrow()
  })

  it("assertSharedRuntimeExposed throws listing the missing names", () => {
    const target = { React: {} }
    expect(() =>
      assertSharedRuntimeExposed(["React", "McpUseReact", "ReactQuery"], target),
    ).toThrow(/missing globals \[McpUseReact, ReactQuery\]/)
  })
})
