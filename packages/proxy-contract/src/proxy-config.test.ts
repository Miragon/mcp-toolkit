import { describe, it, expect } from "vitest"
import {
  ProxyConfigSchema,
  parseProxyConfigEnv,
  proxySecretEnvVar,
  proxySecretEnvVars,
  type ProxyConfigEntry,
} from "./index.js"

const validEntry: ProxyConfigEntry = {
  name: "billing",
  label: "Billing",
  upstreamUrl: "https://billing.example.com/mcp",
  auth: { mode: "none" },
}

describe("ProxyConfigSchema", () => {
  it("parses a minimal valid config", () => {
    expect(ProxyConfigSchema.parse([validEntry])).toEqual([validEntry])
  })

  it("rejects duplicate proxy names", () => {
    const result = ProxyConfigSchema.safeParse([validEntry, validEntry])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("duplicate proxy name"))).toBe(true)
    }
  })

  it("rejects names that violate PROXY_NAME_PATTERN", () => {
    const bad: ProxyConfigEntry = { ...validEntry, name: "Billing-API" }
    expect(ProxyConfigSchema.safeParse([bad]).success).toBe(false)
  })

  it("rejects auth env vars that are not UPPER_SNAKE_CASE", () => {
    const bad: ProxyConfigEntry = {
      ...validEntry,
      auth: { mode: "bearer", tokenEnvVar: "lowercase_token" },
    }
    expect(ProxyConfigSchema.safeParse([bad]).success).toBe(false)
  })

  it("accepts the four supported auth modes", () => {
    const entries: ProxyConfigEntry[] = [
      { ...validEntry, name: "a", auth: { mode: "none" } },
      { ...validEntry, name: "b", auth: { mode: "bearer", tokenEnvVar: "TOKEN" } },
      {
        ...validEntry,
        name: "c",
        auth: { mode: "header", headerName: "X-Key", valueEnvVar: "VAL" },
      },
      { ...validEntry, name: "d", auth: { mode: "oauth2" } },
    ]
    expect(ProxyConfigSchema.safeParse(entries).success).toBe(true)
  })
})

describe("parseProxyConfigEnv", () => {
  it("returns an empty array for undefined / empty / whitespace input", () => {
    expect(parseProxyConfigEnv(undefined)).toEqual([])
    expect(parseProxyConfigEnv("")).toEqual([])
    expect(parseProxyConfigEnv("   ")).toEqual([])
  })

  it("parses a JSON string into a validated config", () => {
    expect(parseProxyConfigEnv(JSON.stringify([validEntry]))).toEqual([validEntry])
  })

  it("throws on malformed JSON", () => {
    expect(() => parseProxyConfigEnv("not json")).toThrow()
  })

  it("throws when JSON parses but fails schema validation", () => {
    expect(() => parseProxyConfigEnv("[{}]")).toThrow()
  })
})

describe("proxySecretEnvVar", () => {
  it("returns <PREFIX>_<NAME>_TOKEN for bearer mode", () => {
    expect(proxySecretEnvVar("billing", "bearer")).toBe("MCP_PROXY_BILLING_TOKEN")
  })

  it("returns <PREFIX>_<NAME>_VALUE for header mode", () => {
    expect(proxySecretEnvVar("billing", "header")).toBe("MCP_PROXY_BILLING_VALUE")
  })

  it("returns undefined for none and oauth2", () => {
    expect(proxySecretEnvVar("billing", "none")).toBeUndefined()
    expect(proxySecretEnvVar("billing", "oauth2")).toBeUndefined()
  })

  it("honours a custom prefix", () => {
    expect(proxySecretEnvVar("billing", "bearer", "MIRANUM")).toBe("MIRANUM_BILLING_TOKEN")
  })

  it("converts dashes to underscores and uppercases the proxy name", () => {
    expect(proxySecretEnvVar("billing-api-v2", "bearer")).toBe("MCP_PROXY_BILLING_API_V2_TOKEN")
  })
})

describe("proxySecretEnvVars", () => {
  it("returns the token env var for bearer mode", () => {
    expect(
      proxySecretEnvVars({
        ...validEntry,
        auth: { mode: "bearer", tokenEnvVar: "MY_TOKEN" },
      }),
    ).toEqual(["MY_TOKEN"])
  })

  it("returns the value env var for header mode", () => {
    expect(
      proxySecretEnvVars({
        ...validEntry,
        auth: { mode: "header", headerName: "X-K", valueEnvVar: "MY_VAL" },
      }),
    ).toEqual(["MY_VAL"])
  })

  it("returns an empty array for none and oauth2 modes", () => {
    expect(proxySecretEnvVars({ ...validEntry, auth: { mode: "none" } })).toEqual([])
    expect(proxySecretEnvVars({ ...validEntry, auth: { mode: "oauth2" } })).toEqual([])
  })
})
