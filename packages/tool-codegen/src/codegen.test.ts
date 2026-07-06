import { describe, it, expect } from "vitest"
import { renderCodegen, toPascalCase } from "./codegen.js"
import type { UpstreamToolDescriptor } from "./fetch-tools.js"

describe("toPascalCase", () => {
  it("PascalCases a single lowercase word", () => {
    expect(toPascalCase("billing")).toBe("Billing")
  })

  it("PascalCases dash-separated input", () => {
    expect(toPascalCase("billing-api")).toBe("BillingApi")
  })

  it("PascalCases underscore-separated input", () => {
    expect(toPascalCase("billing_api")).toBe("BillingApi")
  })

  it("PascalCases space-separated input", () => {
    expect(toPascalCase("billing api")).toBe("BillingApi")
  })

  it("handles mixed separators", () => {
    expect(toPascalCase("billing-api_v2 ext")).toBe("BillingApiV2Ext")
  })

  it("collapses runs of separators", () => {
    expect(toPascalCase("billing--api")).toBe("BillingApi")
  })

  it("returns an empty string for empty input", () => {
    expect(toPascalCase("")).toBe("")
  })
})

// These assertions drive the real generator (`renderCodegen`, the network-free
// half of `generateTools`) against a fixed tool list and pin the actually
// emitted names/output — not a hand-reconstructed copy of the naming rule.
// Consumers depend on these names being deterministic for a given (proxy, tool)
// pair so generated artefacts don't churn across regeneration runs.
describe("renderCodegen — emitted contract", () => {
  const tool = (
    name: string,
    inputSchema: Record<string, unknown>,
    outputSchema?: Record<string, unknown>,
  ): UpstreamToolDescriptor => ({ name, inputSchema, outputSchema })

  const config = {
    proxyName: "billing-api",
    upstreamUrl: "https://billing.example/mcp",
    out: "out",
  }

  it("emits stable type/hook names and the tool-map/call-tool aliases", async () => {
    const { toolsFile, hooksFile } = await renderCodegen(
      [tool("get-invoice", { type: "object", properties: { id: { type: "string" } } })],
      config,
    )

    // Per-tool input/output type names + the hook name.
    expect(toolsFile).toContain("BillingApiGetInvoiceInput")
    expect(hooksFile).toContain("useBillingApiGetInvoice")
    // Proxy-level map / name / call-tool aliases.
    expect(toolsFile).toContain("export interface BillingApiToolMap")
    expect(toolsFile).toContain("export type BillingApiToolName = keyof BillingApiToolMap & string")
    expect(toolsFile).toContain("export type BillingApiCallTool = TypedCallTool<BillingApiToolMap>")
    // The full (prefixed) tool name keys the map.
    expect(toolsFile).toContain('"billing-api_get-invoice"')
    // The query key uses Prettier-style spacing — committed output must pass
    // the repo's format gate while staying byte-identical to `generate --check`.
    expect(hooksFile).toContain('["billing-api", "get-invoice"]')
    // Exactly one trailing newline, for the same reason.
    expect(toolsFile).toMatch(/[^\n]\n$/)
    expect(hooksFile).toMatch(/[^\n]\n$/)
  })

  it("defaults the output type to `unknown` when the upstream omits outputSchema", async () => {
    const { toolsFile } = await renderCodegen(
      [tool("ping", { type: "object", properties: {} })],
      config,
    )
    expect(toolsFile).toContain("output: unknown")
  })

  it("sorts tools by name so regenerations are byte-identical regardless of list order", async () => {
    const a = tool("a-tool", { type: "object", properties: {} })
    const b = tool("b-tool", { type: "object", properties: {} })

    const forward = await renderCodegen([a, b], config)
    const reversed = await renderCodegen([b, a], config)

    expect(forward.toolsFile).toBe(reversed.toolsFile)
    expect(forward.tools.map((t) => t.name)).toEqual(["a-tool", "b-tool"])
  })
})

// Kept as a focused unit on the naming primitive both templates build on.
describe("codegen naming pattern", () => {
  it("produces stable type and hook names from a (proxy, tool) pair", () => {
    const proxy = toPascalCase("billing-api")
    const tool = toPascalCase("get-invoice")
    expect(`${proxy}${tool}Input`).toBe("BillingApiGetInvoiceInput")
    expect(`${proxy}${tool}Output`).toBe("BillingApiGetInvoiceOutput")
    expect(`use${proxy}${tool}`).toBe("useBillingApiGetInvoice")
  })

  it("produces stable map / call-tool type names from a proxy", () => {
    const proxy = toPascalCase("billing-api")
    expect(`${proxy}ToolMap`).toBe("BillingApiToolMap")
    expect(`${proxy}ToolName`).toBe("BillingApiToolName")
    expect(`${proxy}CallTool`).toBe("BillingApiCallTool")
  })
})
