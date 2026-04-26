import { describe, it, expect } from "vitest"
import { parseNonceCookie } from "./UpstreamProxyPlugin.js"

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
