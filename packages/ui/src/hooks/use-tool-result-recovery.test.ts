import { describe, expect, it } from "vitest"
import { decodeRecoveredResult, resolveRecoveryToolName } from "./use-tool-result-recovery.js"

// The hook's effect wiring (single-flight, StrictMode re-run, host-payload
// precedence) is exercised end-to-end by the consumer's Playwright host
// simulation (structuredContent keep/strip scenarios); these tests pin the
// pure decision logic.

describe("resolveRecoveryToolName", () => {
  it("reads the SEP-1865 shape toolInfo.tool.name first", () => {
    expect(
      resolveRecoveryToolName({
        toolInfo: { tool: { name: "render-view" }, name: "ignored" },
      }),
    ).toBe("render-view")
  })

  it("falls back to the flattened variants some hosts send", () => {
    expect(resolveRecoveryToolName({ toolInfo: { name: "show_cockpit" } })).toBe("show_cockpit")
    expect(resolveRecoveryToolName({ toolInfo: { toolName: "show_cockpit" } })).toBe("show_cockpit")
  })

  it("returns undefined when the tool name is missing or unusable", () => {
    expect(resolveRecoveryToolName(undefined)).toBeUndefined()
    expect(resolveRecoveryToolName({})).toBeUndefined()
    expect(resolveRecoveryToolName({ toolInfo: null })).toBeUndefined()
    expect(resolveRecoveryToolName({ toolInfo: { name: "" } })).toBeUndefined()
    expect(resolveRecoveryToolName({ toolInfo: { name: 42 } })).toBeUndefined()
  })
})

describe("decodeRecoveredResult", () => {
  const isView = (v: unknown): boolean =>
    Boolean((v as { context?: unknown; layout?: unknown } | null)?.context) &&
    Boolean((v as { layout?: unknown } | null)?.layout)

  it("decodes structuredContent-first and validates it", () => {
    const result = {
      content: [{ type: "text", text: "Cockpit rendered" }],
      structuredContent: { context: { keys: {} }, layout: { rows: [] } },
    }
    expect(decodeRecoveredResult(result, isView)).toEqual({
      context: { keys: {} },
      layout: { rows: [] },
    })
  })

  it("rejects payloads the validator refuses", () => {
    const result = {
      content: [{ type: "text", text: "just a summary" }],
      structuredContent: { unrelated: true },
    }
    expect(decodeRecoveredResult(result, isView)).toBeNull()
  })

  it("returns null for error results instead of throwing", () => {
    const result = { isError: true, content: [{ type: "text", text: "[503] engine down" }] }
    expect(decodeRecoveredResult(result, isView)).toBeNull()
  })

  it("returns null for empty results", () => {
    expect(decodeRecoveredResult(undefined, isView)).toBeNull()
    expect(decodeRecoveredResult({ content: [] }, isView)).toBeNull()
  })
})
