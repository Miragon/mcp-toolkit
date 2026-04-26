import { describe, it, expect } from "vitest"
import type { ProxyConfigEntry } from "@miragon/mcp-toolkit-proxy-contract"
import { resolveAuthConfig, requireCallbackBaseUrl } from "./register-upstream-proxies.js"

const baseEntry: Omit<ProxyConfigEntry, "auth"> = {
  name: "billing",
  label: "Billing",
  upstreamUrl: "https://billing.example.com/mcp",
}

describe("resolveAuthConfig", () => {
  it("returns { mode: 'none' } for none mode", () => {
    const entry: ProxyConfigEntry = { ...baseEntry, auth: { mode: "none" } }
    expect(resolveAuthConfig(entry, () => undefined)).toEqual({ mode: "none" })
  })

  it("resolves a bearer token from the env-var resolver", () => {
    const entry: ProxyConfigEntry = {
      ...baseEntry,
      auth: { mode: "bearer", tokenEnvVar: "BILLING_TOKEN" },
    }
    expect(
      resolveAuthConfig(entry, (name) => (name === "BILLING_TOKEN" ? "secret" : undefined)),
    ).toEqual({ mode: "bearer", token: "secret" })
  })

  it("throws a clear error when the bearer token env var is unset", () => {
    const entry: ProxyConfigEntry = {
      ...baseEntry,
      auth: { mode: "bearer", tokenEnvVar: "BILLING_TOKEN" },
    }
    expect(() => resolveAuthConfig(entry, () => undefined)).toThrow(
      /MCP proxy "billing".*BILLING_TOKEN.*bearer token.*not set/,
    )
  })

  it("throws when bearer token resolves to an empty string", () => {
    const entry: ProxyConfigEntry = {
      ...baseEntry,
      auth: { mode: "bearer", tokenEnvVar: "BILLING_TOKEN" },
    }
    expect(() => resolveAuthConfig(entry, () => "")).toThrow(/BILLING_TOKEN/)
  })

  it("resolves a header value and preserves the header name", () => {
    const entry: ProxyConfigEntry = {
      ...baseEntry,
      auth: { mode: "header", headerName: "X-API-Key", valueEnvVar: "BILLING_HEADER" },
    }
    expect(resolveAuthConfig(entry, () => "v")).toEqual({
      mode: "header",
      headerName: "X-API-Key",
      value: "v",
    })
  })

  it("throws when the header env var is unset, naming the header", () => {
    const entry: ProxyConfigEntry = {
      ...baseEntry,
      auth: { mode: "header", headerName: "X-API-Key", valueEnvVar: "BILLING_HEADER" },
    }
    expect(() => resolveAuthConfig(entry, () => undefined)).toThrow(/X-API-Key/)
  })

  it("returns oauth2 with the entry label as clientName", () => {
    const entry: ProxyConfigEntry = { ...baseEntry, auth: { mode: "oauth2" } }
    expect(resolveAuthConfig(entry, () => undefined)).toEqual({
      mode: "oauth2",
      clientName: "Billing",
    })
  })
})

describe("requireCallbackBaseUrl", () => {
  it("returns undefined when no entry uses oauth2", () => {
    const entries: ProxyConfigEntry[] = [{ ...baseEntry, auth: { mode: "none" } }]
    expect(requireCallbackBaseUrl(entries, undefined)).toBeUndefined()
  })

  it("throws when oauth2 is present but callbackBaseUrl is not provided", () => {
    const entries: ProxyConfigEntry[] = [{ ...baseEntry, auth: { mode: "oauth2" } }]
    expect(() => requireCallbackBaseUrl(entries, undefined)).toThrow(/callbackBaseUrl is required/)
  })

  it("strips a single trailing slash", () => {
    const entries: ProxyConfigEntry[] = [{ ...baseEntry, auth: { mode: "oauth2" } }]
    expect(requireCallbackBaseUrl(entries, "https://app.example.com/")).toBe(
      "https://app.example.com",
    )
  })

  it("strips multiple trailing slashes", () => {
    const entries: ProxyConfigEntry[] = [{ ...baseEntry, auth: { mode: "oauth2" } }]
    expect(requireCallbackBaseUrl(entries, "https://app.example.com///")).toBe(
      "https://app.example.com",
    )
  })

  it("returns the URL unchanged when there is no trailing slash", () => {
    const entries: ProxyConfigEntry[] = [{ ...baseEntry, auth: { mode: "oauth2" } }]
    expect(requireCallbackBaseUrl(entries, "https://app.example.com")).toBe(
      "https://app.example.com",
    )
  })
})
