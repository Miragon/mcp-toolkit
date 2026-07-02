import { describe, it, expect } from "vitest"
import { parseNonceCookie, isUpstreamAuthFailure } from "./UpstreamProxyPlugin.js"

describe("parseNonceCookie", () => {
  it("extracts nonce from sole cookie", () => {
    expect(parseNonceCookie("oauth_nonce=abc123")).toBe("abc123")
  })

  it("extracts nonce when other cookies present", () => {
    expect(parseNonceCookie("session=xyz; oauth_nonce=abc123; foo=bar")).toBe("abc123")
  })

  it("returns undefined when cookie absent", () => {
    expect(parseNonceCookie("session=xyz; foo=bar")).toBeUndefined()
  })

  it("returns undefined for empty header", () => {
    expect(parseNonceCookie("")).toBeUndefined()
  })
})

describe("isUpstreamAuthFailure", () => {
  it("treats 401/403 status (number or string) as an auth failure", () => {
    expect(isUpstreamAuthFailure({ status: 401 })).toBe(true)
    expect(isUpstreamAuthFailure({ status: 403 })).toBe(true)
    expect(isUpstreamAuthFailure({ statusCode: 401 })).toBe(true)
    expect(isUpstreamAuthFailure({ status: "403" })).toBe(true)
  })

  it("treats unmistakable token/auth messages as an auth failure", () => {
    for (const msg of [
      "HTTP 401 Unauthorized",
      "Request failed: Unauthorized",
      "invalid_token",
      "the token expired yesterday",
      "403 Forbidden",
    ]) {
      expect(isUpstreamAuthFailure(new Error(msg))).toBe(true)
    }
  })

  it("does NOT treat transient connection/domain errors as auth failures", () => {
    // These must not force a re-login: the caller's tokens are still valid and
    // should survive an upstream restart or a plain domain error.
    for (const err of [
      new Error("connect ECONNREFUSED 127.0.0.1:8080"),
      new Error("socket hang up"),
      new Error("ECONNRESET"),
      new Error("Tool 'x' failed: invalid argument"),
      { status: 500 },
      { status: 404 },
      undefined,
      null,
    ]) {
      expect(isUpstreamAuthFailure(err)).toBe(false)
    }
  })
})
