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

const registryOf = (ids: string[]) =>
  createBackendRegistry(
    ids.map((id) => entry(id)),
    { label: "engine" },
  )

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
    expect(registryOf(["alpha", "beta"]).list()).toEqual([
      { id: "alpha", meta: { url: "http://alpha" } },
      { id: "beta", meta: { url: "http://beta" } },
    ])
  })
})

describe("resolve precedence (stateless: explicit id > single default)", () => {
  it("resolves the only backend when one is configured and no id is given", () => {
    const resolved = registryOf(["solo"]).resolve()
    expect(resolved.id).toBe("solo")
    expect(resolved.client.tag).toBe("solo")
    expect(resolved.meta).toEqual({ url: "http://solo" })
  })

  it("resolves an explicit id in a multi-backend setup", () => {
    expect(registryOf(["alpha", "beta"]).resolve("beta").id).toBe("beta")
  })

  it("throws BackendNotSelectedError for multi-backend with no id", () => {
    const registry = registryOf(["alpha", "beta"])
    expect(() => registry.resolve()).toThrow(BackendNotSelectedError)
    // The message must name the selectable ids — error paths often serialise
    // only code + message, so this is the model's one shot at seeing them.
    expect(() => registry.resolve()).toThrow(
      "No engine specified and more than one is configured. Available engines: alpha, beta. Pass an explicit engine id.",
    )
  })

  it("throws UnknownBackendError when the id names a non-existent backend", () => {
    const registry = registryOf(["alpha", "beta"])
    expect(() => registry.resolve("gamma")).toThrow(UnknownBackendError)
    expect(() => registry.resolve("gamma")).toThrow('Unknown engine id "gamma"')
  })

  it("keeps no state between calls — the same registry answers every caller alike", () => {
    const registry = registryOf(["alpha", "beta"])
    expect(registry.resolve("alpha").id).toBe("alpha")
    // The previous explicit id must NOT linger as an implicit default.
    expect(() => registry.resolve()).toThrow(BackendNotSelectedError)
  })

  it('uses the default "backend" label when none is configured', () => {
    const registry = createBackendRegistry([entry("a"), entry("b")])
    expect(() => registry.resolve()).toThrow(/No backend specified/)
    expect(() => registry.resolve("x")).toThrow('Unknown backend id "x"')
  })
})

describe("withBackend", () => {
  it("reads the id from args[paramName] and resolves it", async () => {
    const handler = withBackend(
      registryOf(["alpha", "beta"]),
      "engine",
      (backend, args: { engine?: string; q: string }) => Promise.resolve(`${backend.id}:${args.q}`),
    )
    expect(await handler({ engine: "beta", q: "hi" })).toBe("beta:hi")
  })

  it("falls back to the single configured backend when the param is absent", async () => {
    const handler = withBackend(registryOf(["solo"]), "engine", (backend) =>
      Promise.resolve(backend.id),
    )
    expect(await handler({})).toBe("solo")
  })

  it("ignores a non-string id value", async () => {
    const handler = withBackend(registryOf(["solo"]), "engine", (backend) =>
      Promise.resolve(backend.id),
    )
    // engine is not a string → treated as no id → single default.
    expect(await handler({ engine: 123 })).toBe("solo")
  })
})
