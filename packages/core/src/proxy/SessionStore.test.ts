import { describe, it, expect } from "vitest"
import { InMemorySessionStore } from "./SessionStore.js"
import { ServerSideOAuthProvider } from "./ServerSideOAuthProvider.js"
import type { PendingAuth } from "./types.js"

const provider = new ServerSideOAuthProvider({ callbackUrl: "https://example.com/callback" })

const makePending = (overrides: Partial<PendingAuth> = {}): PendingAuth => ({
  userId: "u1",
  serverName: "s1",
  provider,
  inboundSessionId: "",
  nonce: "n1",
  authorizationUrl: "https://provider.example/auth",
  expiresAt: Date.now() + 60_000,
  ...overrides,
})

describe("InMemorySessionStore TTL", () => {
  it("returns entry before expiry", () => {
    const store = new InMemorySessionStore()
    store.setPending("state1", makePending())
    expect(store.getPending("state1")).toBeDefined()
  })

  it("returns undefined and auto-deletes after expiry", () => {
    const store = new InMemorySessionStore()
    store.setPending("state2", makePending({ expiresAt: Date.now() - 1 }))
    expect(store.getPending("state2")).toBeUndefined()
    expect(store.getPending("state2")).toBeUndefined()
  })

  it("returns undefined for unknown key", () => {
    const store = new InMemorySessionStore()
    expect(store.getPending("unknown")).toBeUndefined()
  })
})
