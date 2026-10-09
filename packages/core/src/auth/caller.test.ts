import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { resolveCaller, resolveCallerId } from "./caller.js"

/**
 * The fixtures below are the shapes mcp-use 2 really produces — verified
 * end-to-end in `tools/create-framework-app.auth.test.ts` — plus the 1.x-era
 * custom-provider spelling that existing consumers still map.
 */

/** Tool / resource / prompt callbacks: the flattened `ctx.auth`. */
function callbackCtx(user: unknown, payload: Record<string, unknown> = {}) {
  return {
    auth: { user, payload, accessToken: "t", scopes: [], permissions: [], expiresAt: 0 },
  }
}

/** MCP middleware: the SDK `AuthInfo`, provider mapping under `extra`. */
function middlewareCtx(user: unknown, payload: Record<string, unknown> = {}) {
  return {
    method: "tools/list",
    auth: {
      token: "t",
      clientId: "c",
      scopes: [],
      expiresAt: 0,
      extra: { user, payload, permissions: [] },
    },
  }
}

const builtInUser = { id: "alice", roles: ["viewer"], organizationId: "org-1" }

describe("resolveCaller — the two mcp-use 2 shapes", () => {
  it("reads the flattened callback shape (ctx.auth.user)", () => {
    expect(resolveCaller(callbackCtx(builtInUser))).toEqual({
      userId: "alice",
      organizationId: "org-1",
      roles: ["viewer"],
    })
  })

  it("reads the middleware shape (ctx.auth.extra.user) — there is no ctx.auth.user there", () => {
    expect(resolveCaller(middlewareCtx(builtInUser))).toEqual({
      userId: "alice",
      organizationId: "org-1",
      roles: ["viewer"],
    })
  })

  it("prefers the flattened user when a ctx carries both", () => {
    const ctx = {
      auth: {
        user: { id: "flat" },
        extra: { user: { id: "nested", roles: ["admin"] } },
      },
    }
    expect(resolveCaller(ctx)).toEqual({ userId: "flat", roles: [] })
  })
})

describe("resolveCaller — field spellings", () => {
  it("still resolves the 1.x-era custom-provider spelling (userId, organization_id)", () => {
    const legacy = { auth: { user: { userId: "bob", organization_id: "org-2", roles: ["x"] } } }
    expect(resolveCaller(legacy)).toEqual({ userId: "bob", organizationId: "org-2", roles: ["x"] })
  })

  it("takes id over userId over the token's sub", () => {
    const ctx = callbackCtx({ id: "by-id", userId: "by-userId" }, { sub: "by-sub" })
    expect(resolveCallerId(ctx)).toBe("by-id")
    expect(resolveCallerId(callbackCtx({ userId: "by-userId" }, { sub: "by-sub" }))).toBe(
      "by-userId",
    )
    expect(resolveCallerId(callbackCtx({}, { sub: "by-sub" }))).toBe("by-sub")
  })

  it("falls back to the token's sub in the middleware shape too (extra.payload)", () => {
    expect(resolveCallerId(middlewareCtx({ roles: [] }, { sub: "carol" }))).toBe("carol")
  })

  it("skips empty and non-string ids instead of coercing them", () => {
    expect(resolveCallerId(callbackCtx({ id: "", userId: "fallback" }))).toBe("fallback")
    expect(resolveCallerId(callbackCtx({ id: 42 }, { sub: 7 }))).toBeUndefined()
  })

  it("takes organizationId over organization_id and ignores non-strings", () => {
    expect(
      resolveCaller(callbackCtx({ organizationId: "camel", organization_id: "snake" }))
        ?.organizationId,
    ).toBe("camel")
    expect(resolveCaller(callbackCtx({ organization_id: "snake" }))?.organizationId).toBe("snake")
    expect(resolveCaller(callbackCtx({ organizationId: 1 }))).toEqual({ roles: [] })
  })

  it("keeps only string roles and treats a non-array as no roles", () => {
    expect(resolveCaller(callbackCtx({ roles: ["a", 1, null, "b"] }))?.roles).toEqual(["a", "b"])
    expect(resolveCaller(callbackCtx({ roles: "admin" }))?.roles).toEqual([])
  })
})

describe("resolveCaller — anonymous vs. authenticated-without-identity", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "ctx"],
    ["a ctx without auth", { method: "tools/list" }],
    ["a ctx with auth: null", { auth: null }],
    ["a ctx with a non-object auth", { auth: "bearer" }],
  ])("returns undefined for %s (no auth at all → global scope is legitimate)", (_label, ctx) => {
    expect(resolveCaller(ctx)).toBeUndefined()
    expect(resolveCallerId(ctx)).toBeUndefined()
  })

  it("returns a caller WITHOUT userId when auth is present but maps no subject", () => {
    // The distinction consumers rely on: this request is authenticated, so
    // per-user data must be refused — not widened to global scope.
    expect(resolveCaller({ auth: {} })).toEqual({ roles: [] })
    expect(resolveCaller(middlewareCtx("not-an-object"))).toEqual({ roles: [] })
    expect(resolveCaller(callbackCtx({ roles: ["viewer"] }))).toEqual({ roles: ["viewer"] })
  })

  it("never throws and always yields a well-formed caller for arbitrary input (fail-soft)", () => {
    fc.assert(
      fc.property(fc.anything(), (ctx) => {
        const caller = resolveCaller(ctx)
        if (caller === undefined) return true
        return (
          Array.isArray(caller.roles) &&
          caller.roles.every((r) => typeof r === "string") &&
          (caller.userId === undefined ||
            (typeof caller.userId === "string" && caller.userId !== "")) &&
          (caller.organizationId === undefined || typeof caller.organizationId === "string")
        )
      }),
    )
    fc.assert(
      fc.property(
        fc.record({ auth: fc.record({ user: fc.anything(), extra: fc.anything() }) }),
        (ctx) => {
          expect(resolveCaller(ctx)).toBeDefined()
        },
      ),
    )
  })
})
