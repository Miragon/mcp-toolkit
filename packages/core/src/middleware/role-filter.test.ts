import { describe, it, expect, vi } from "vitest"
import { createRoleFilterMiddleware, type RoleFilterContext } from "./role-filter.js"

const roleToModules = { viewer: ["analytics"], editor: ["analytics", "billing"] }

function ctxWithRoles(roles: unknown, params?: { name?: unknown }): RoleFilterContext {
  return { auth: { user: { roles } }, params }
}

describe("createRoleFilterMiddleware — toolsList", () => {
  const { toolsList } = createRoleFilterMiddleware(roleToModules)
  const tools = [
    { name: "analytics_query" },
    { name: "billing_invoice" },
    { name: "ping" }, // no underscore → always allowed
  ]

  it("filters out modules a restricted role can't access", async () => {
    const result = await toolsList(ctxWithRoles(["viewer"]), () => Promise.resolve(tools))
    expect(result).toEqual([{ name: "analytics_query" }, { name: "ping" }])
  })

  it("returns the union for multiple restricted roles", async () => {
    const result = await toolsList(ctxWithRoles(["viewer", "editor"]), () => Promise.resolve(tools))
    expect(result).toEqual(tools)
  })

  it("leaves the list untouched for an unrestricted (unknown) role", async () => {
    const result = await toolsList(ctxWithRoles(["admin"]), () => Promise.resolve(tools))
    expect(result).toEqual(tools)
  })

  it("is a pass-through when there are no rules", async () => {
    const { toolsList: noRules } = createRoleFilterMiddleware({})
    const result = await noRules(ctxWithRoles(["viewer"]), () => Promise.resolve(tools))
    expect(result).toEqual(tools)
  })
})

describe("createRoleFilterMiddleware — toolsCall", () => {
  it("allows a call when the resolved tool's module is permitted", async () => {
    const resolveToolName = vi.fn(() => "analytics_query")
    const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolName })
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(ctxWithRoles(["viewer"]), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  it("denies a call when the resolved tool's module is not permitted", async () => {
    const resolveToolName = vi.fn(() => "billing_invoice")
    const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolName })
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(ctxWithRoles(["viewer"]), next)).rejects.toThrow(/no access to module/)
    expect(next).not.toHaveBeenCalled()
  })

  it("prefers the resolver over a tool ARGUMENT named `name` in ctx.params", async () => {
    // mcp-use 1.28 puts tool arguments in ctx.params, so a `name` argument
    // (e.g. save-dashboard) must NOT be mistaken for the tool name.
    const resolveToolName = vi.fn(() => "billing_invoice")
    const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolName })
    const next = vi.fn(() => Promise.resolve("ok"))
    const ctx = ctxWithRoles(["viewer"], { name: "analytics_query" })
    await expect(toolsCall(ctx, next)).rejects.toThrow(/no access to module/)
    expect(next).not.toHaveBeenCalled()
  })

  it("allows tools without a module prefix regardless of role", async () => {
    const resolveToolName = vi.fn(() => "render-view")
    const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolName })
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(ctxWithRoles(["viewer"]), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  it("allows an unrestricted role to call any module", async () => {
    const resolveToolName = vi.fn(() => "billing_invoice")
    const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolName })
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(ctxWithRoles(["admin"]), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  describe("unresolvable tool name", () => {
    it("fails OPEN by default (allows the call)", async () => {
      const resolveToolName = vi.fn(() => undefined)
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolName })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall(ctxWithRoles(["viewer"]), next)).resolves.toBe("ok")
      expect(next).toHaveBeenCalledOnce()
    })

    it("fails CLOSED when failClosed is set (denies the call)", async () => {
      const resolveToolName = vi.fn(() => undefined)
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, {
        resolveToolName,
        failClosed: true,
      })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall(ctxWithRoles(["viewer"]), next)).rejects.toThrow(
        /unable to resolve the tool name/,
      )
      expect(next).not.toHaveBeenCalled()
    })
  })

  it("falls back to ctx.params.name when no resolver is provided (legacy)", async () => {
    const { toolsCall } = createRoleFilterMiddleware(roleToModules)
    const next = vi.fn(() => Promise.resolve("ok"))
    const ctx = ctxWithRoles(["viewer"], { name: "billing_invoice" })
    await expect(toolsCall(ctx, next)).rejects.toThrow(/no access to module/)
    expect(next).not.toHaveBeenCalled()
  })

  it("is a pass-through when there are no rules", async () => {
    const { toolsCall } = createRoleFilterMiddleware({})
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(ctxWithRoles(["viewer"]), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  // A JSON-RPC batch envelope can carry several tools/call requests. Checking
  // only one name would let the remaining entries bypass the module guard, so
  // the guard consumes `resolveToolNames` and denies when ANY name is
  // disallowed.
  describe("JSON-RPC batches (resolveToolNames)", () => {
    it("allows a batch when every tool's module is permitted", async () => {
      const resolveToolNames = vi.fn(() => ["analytics_query", "analytics_export", "render-view"])
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolNames })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall(ctxWithRoles(["viewer"]), next)).resolves.toBe("ok")
      expect(next).toHaveBeenCalledOnce()
    })

    it("denies a batch when ANY tool's module is not permitted", async () => {
      const resolveToolNames = vi.fn(() => ["analytics_query", "billing_invoice"])
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, { resolveToolNames })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall(ctxWithRoles(["viewer"]), next)).rejects.toThrow(
        /no access to module "billing"/,
      )
      expect(next).not.toHaveBeenCalled()
    })

    it("takes precedence over the single-name resolver", async () => {
      const resolveToolName = vi.fn(() => "analytics_query")
      const resolveToolNames = vi.fn(() => ["analytics_query", "billing_invoice"])
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, {
        resolveToolName,
        resolveToolNames,
      })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall(ctxWithRoles(["viewer"]), next)).rejects.toThrow(/no access to module/)
      expect(next).not.toHaveBeenCalled()
    })

    it("falls back to the single-name resolver when it yields no names", async () => {
      const resolveToolName = vi.fn(() => "billing_invoice")
      const resolveToolNames = vi.fn(() => undefined)
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, {
        resolveToolName,
        resolveToolNames,
      })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall(ctxWithRoles(["viewer"]), next)).rejects.toThrow(/no access to module/)
      expect(next).not.toHaveBeenCalled()
    })

    it("applies failClosed when neither resolver yields a name", async () => {
      const resolveToolNames = vi.fn(() => [])
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, {
        resolveToolNames,
        failClosed: true,
      })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall(ctxWithRoles(["viewer"]), next)).rejects.toThrow(
        /unable to resolve the tool name/,
      )
      expect(next).not.toHaveBeenCalled()
    })
  })
})
