import { describe, it, expect } from "vitest"
import { toPascalCase } from "./codegen.js"

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

// The names emitted by `generateTools` are composed as:
//   `${proxyPascal}${toolPascal}Input`  — input type
//   `${proxyPascal}${toolPascal}Output` — output type
//   `use${proxyPascal}${toolPascal}`    — TanStack Query hook
// Consumers depend on these being deterministic for a given (proxy, tool)
// pair so generated artefacts don't churn across regeneration runs.
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
