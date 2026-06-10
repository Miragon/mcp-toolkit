import { describe, it, expect } from "vitest"
import {
  BackendNotSelectedError,
  UnknownBackendError,
  createBackendRegistry,
  withBackend,
  type BackendEntry,
} from "./backend-registry.js"

interface FakeClient {
  tag: string
}

const entry = (id: string, tag = id): BackendEntry<FakeClient, { url: string }> => ({
  id,
  client: { tag },
  meta: { url: `http://${id}` },
})

/** Mutable session/clock harness so tests drive sticky selection deterministically. */
function harness(ids: string[], ttlMs?: number) {
  let session: string | undefined
  let clock = 1_000
  const registry = createBackendRegistry(
    ids.map((id) => entry(id)),
    {
      label: "engine",
      sessionTtlMs: ttlMs,
      getSessionId: () => session,
      now: () => clock,
    },
  )
  return {
    registry,
    actAs: (sid: string | undefined) => {
      session = sid
    },
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe("createBackendRegistry construction", () => {
  it("throws on an empty entry list", () => {
    expect(() => createBackendRegistry<FakeClient>([])).toThrow(/at least one backend/)
  })

  it("throws on duplicate ids", () => {
    expect(() => createBackendRegistry([entry("a"), entry("a")])).toThrow(
      /duplicate backend id "a"/,
    )
  })

  it("lists registered backends with their meta in registration order", () => {
    const { registry } = harness(["alpha", "beta"])
    expect(registry.list()).toEqual([
      { id: "alpha", meta: { url: "http://alpha" } },
      { id: "beta", meta: { url: "http://beta" } },
    ])
  })
})

describe("resolve precedence", () => {
  it("resolves the only backend when one is configured and nothing is selected", () => {
    const { registry } = harness(["solo"])
    const resolved = registry.resolve()
    expect(resolved.id).toBe("solo")
    expect(resolved.client.tag).toBe("solo")
    expect(resolved.meta).toEqual({ url: "http://solo" })
  })

  it("throws BackendNotSelectedError for multi-backend with no selection and no override", () => {
    const { registry } = harness(["alpha", "beta"])
    expect(() => registry.resolve()).toThrow(BackendNotSelectedError)
    // The message must name the selectable ids — error paths often serialise
    // only code + message, so this is the model's one shot at seeing them.
    expect(() => registry.resolve()).toThrow(
      "No engine selected for this session. Available engines: alpha, beta. Select one for this session first.",
    )
  })

  it("honours the sticky session selection in a multi-backend setup", () => {
    const { registry, actAs } = harness(["alpha", "beta"])
    actAs("s1")
    registry.select("beta")
    expect(registry.resolve().id).toBe("beta")
  })

  it("lets an explicit override win over the sticky selection", () => {
    const { registry, actAs } = harness(["alpha", "beta"])
    actAs("s1")
    registry.select("beta")
    expect(registry.resolve("alpha").id).toBe("alpha")
  })

  it("throws UnknownBackendError when the override names a non-existent backend", () => {
    const { registry } = harness(["alpha", "beta"])
    expect(() => registry.resolve("gamma")).toThrow(UnknownBackendError)
    expect(() => registry.resolve("gamma")).toThrow('Unknown engine id "gamma"')
  })

  it("isolates sticky selections per session", () => {
    const { registry, actAs } = harness(["alpha", "beta"])
    actAs("s1")
    registry.select("alpha")
    actAs("s2")
    // No selection for s2, multi-backend → not selected.
    expect(() => registry.resolve()).toThrow(BackendNotSelectedError)
    registry.select("beta")
    expect(registry.resolve().id).toBe("beta")
    actAs("s1")
    expect(registry.resolve().id).toBe("alpha")
  })

  it("throws on select with no session in scope", () => {
    const { registry, actAs } = harness(["alpha", "beta"])
    actAs(undefined)
    expect(() => registry.select("alpha")).toThrow(/No active MCP session/)
  })

  it("throws UnknownBackendError on select of an unregistered id", () => {
    const { registry, actAs } = harness(["alpha"])
    actAs("s1")
    expect(() => registry.select("ghost")).toThrow(UnknownBackendError)
  })
})

describe("TTL eviction", () => {
  const TTL = 1_000

  it("returns the selection while the TTL has not elapsed", () => {
    const { registry, actAs, advance } = harness(["a", "b"], TTL)
    actAs("s1")
    registry.select("a")
    advance(TTL) // exactly at the boundary — not yet expired
    expect(registry.resolve().id).toBe("a")
  })

  it("expires a stale selection lazily on read", () => {
    const { registry, actAs, advance } = harness(["a", "b"], TTL)
    actAs("s1")
    registry.select("a")
    advance(TTL + 1)
    expect(() => registry.resolve()).toThrow(BackendNotSelectedError)
  })

  it("sweeps expired selections of other sessions on select", () => {
    const { registry, actAs, advance } = harness(["a", "b"], TTL)
    actAs("stale")
    registry.select("a")

    advance(TTL + 1)
    actAs("fresh")
    registry.select("b") // triggers the sweep of "stale"

    // Even after rewinding into the stale entry's original window, it's gone:
    // only the sweep (not lazy expiry) can explain a miss here.
    actAs("stale")
    expect(() => registry.resolve()).toThrow(BackendNotSelectedError)
  })

  it("re-selecting refreshes the TTL", () => {
    const { registry, actAs, advance } = harness(["a", "b"], TTL)
    actAs("s1")
    registry.select("a")
    advance(TTL - 1)
    registry.select("b")
    advance(TTL - 1)
    expect(registry.resolve().id).toBe("b")
  })

  it("clear() drops a session's sticky selection", () => {
    const { registry, actAs } = harness(["a", "b"], TTL)
    actAs("s1")
    registry.select("a")
    registry.clear("s1")
    expect(() => registry.resolve()).toThrow(BackendNotSelectedError)
  })
})

describe("withBackend", () => {
  it("reads the override from args[paramName] and resolves it", async () => {
    const { registry } = harness(["alpha", "beta"])
    const handler = withBackend(
      registry,
      "engine",
      (backend, args: { engine?: string; q: string }) => Promise.resolve(`${backend.id}:${args.q}`),
    )
    expect(await handler({ engine: "beta", q: "hi" })).toBe("beta:hi")
  })

  it("falls back to resolution precedence when the param is absent", async () => {
    const { registry, actAs } = harness(["alpha", "beta"])
    actAs("s1")
    registry.select("alpha")
    const handler = withBackend(registry, "engine", (backend) => Promise.resolve(backend.id))
    expect(await handler({})).toBe("alpha")
  })

  it("ignores a non-string override value", async () => {
    const { registry } = harness(["solo"])
    const handler = withBackend(registry, "engine", (backend) => Promise.resolve(backend.id))
    // engine is not a string → treated as no override → single default.
    expect(await handler({ engine: 123 })).toBe("solo")
  })
})
