import { describe, expect, it } from "vitest"
import * as coreRoot from "@miragon/mcp-toolkit-core"
import * as coreTools from "@miragon/mcp-toolkit-core/tools"
import * as coreRest from "@miragon/mcp-toolkit-core/rest"
import * as codegenRoot from "@miragon/mcp-toolkit-tool-codegen"
import * as codegenRuntime from "@miragon/mcp-toolkit-tool-codegen/runtime"
import { GOLDEN_HINT, loadOrUpdateGolden } from "../helpers/golden.js"

/**
 * Golden contract of the published runtime export surfaces (FITNESS.md,
 * phase 5a) — the core/tool-codegen analogue of packages/ui's catalog guard.
 * Resolves through node_modules (the BUILT dist, exactly what a consumer
 * gets), so `pnpm -r build` must run first — CI and `pnpm verify` both do.
 *
 * A disappeared export is a breaking change (feat!/fix! + docs update in
 * docs/reference/api-*.md, CONTRIBUTING "documentation" section); a new
 * export needs the golden updated AND a reference-docs row (R14/R17).
 *
 * Limitation (recorded): type-only exports are erased at runtime and are
 * covered by typecheck, not by this golden.
 */

const runtimeExports = (ns: object): string[] => Object.keys(ns).sort()

describe("runtime export surface goldens", () => {
  it("core root / tools / rest barrels match the golden", () => {
    const actual = {
      ".": runtimeExports(coreRoot),
      "./tools": runtimeExports(coreTools),
      "./rest": runtimeExports(coreRest),
    }
    expect(actual, GOLDEN_HINT).toEqual(loadOrUpdateGolden("exports-core", actual))
  })

  it("tool-codegen root barrel matches the golden", () => {
    const actual = { ".": runtimeExports(codegenRoot) }
    expect(actual, GOLDEN_HINT).toEqual(loadOrUpdateGolden("exports-tool-codegen", actual))
  })

  it("tool-codegen /runtime stays types-only (empty at runtime)", () => {
    // R4: widget bundles import ONLY types from /runtime — the moment a
    // VALUE ships here, build-time code leaks into runtime bundles.
    expect(runtimeExports(codegenRuntime)).toEqual([])
  })
})
