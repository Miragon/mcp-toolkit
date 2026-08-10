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
  /** A tools/call context as mcp-use 2.x shapes it: `{ name, arguments }`. */
  function callCtx(roles: unknown, name: string): RoleFilterContext {
    return { auth: { user: { roles } }, params: { name } }
  }

  it("allows a call when the tool's module is permitted", async () => {
    const { toolsCall } = createRoleFilterMiddleware(roleToModules)
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(callCtx(["viewer"], "analytics_query"), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  it("denies a call when the tool's module is not permitted", async () => {
    const { toolsCall } = createRoleFilterMiddleware(roleToModules)
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(callCtx(["viewer"], "billing_invoice"), next)).rejects.toThrow(
      /no access to module/,
    )
    expect(next).not.toHaveBeenCalled()
  })

  it("allows tools without a module prefix regardless of role", async () => {
    const { toolsCall } = createRoleFilterMiddleware(roleToModules)
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(callCtx(["viewer"], "render-view"), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  it("allows an unrestricted role to call any module", async () => {
    const { toolsCall } = createRoleFilterMiddleware(roleToModules)
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(callCtx(["admin"], "billing_invoice"), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  it("is a pass-through when there are no rules", async () => {
    const { toolsCall } = createRoleFilterMiddleware({})
    const next = vi.fn(() => Promise.resolve("ok"))
    await expect(toolsCall(callCtx(["viewer"], "billing_invoice"), next)).resolves.toBe("ok")
    expect(next).toHaveBeenCalledOnce()
  })

  /**
   * Batches used to need a dedicated multi-name path: mcp-use 1.28 put the
   * tool *arguments* in `ctx.params`, so the guard read names out of the
   * JSON-RPC envelope and had to check every entry at once.
   *
   * 2.x invokes `mcp:tools/call` middleware once per call, so each batch entry
   * arrives as its own guarded invocation — verified against 2.0.4, where a
   * two-entry batch fires the guard twice with each name. The bypass this
   * models is an allowed call riding alongside a disallowed one.
   */
  describe("JSON-RPC batches", () => {
    it("guards each entry independently: the allowed one passes, the disallowed one throws", async () => {
      const { toolsCall } = createRoleFilterMiddleware(roleToModules)
      const next = vi.fn(() => Promise.resolve("ok"))

      await expect(toolsCall(callCtx(["viewer"], "analytics_query"), next)).resolves.toBe("ok")
      await expect(toolsCall(callCtx(["viewer"], "billing_invoice"), next)).rejects.toThrow(
        /no access to module "billing"/,
      )
      // Only the permitted entry reached the handler.
      expect(next).toHaveBeenCalledOnce()
    })
  })

  describe("a call with no readable tool name", () => {
    it("fails OPEN by default (allows the call)", async () => {
      const { toolsCall } = createRoleFilterMiddleware(roleToModules)
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall({ auth: { user: { roles: ["viewer"] } } }, next)).resolves.toBe("ok")
      expect(next).toHaveBeenCalledOnce()
    })

    it("fails CLOSED when failClosed is set (denies the call)", async () => {
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, { failClosed: true })
      const next = vi.fn(() => Promise.resolve("ok"))
      await expect(toolsCall({ auth: { user: { roles: ["viewer"] } } }, next)).rejects.toThrow(
        /unable to resolve the tool name/,
      )
      expect(next).not.toHaveBeenCalled()
    })

    it("treats a non-string name as unreadable rather than coercing it", async () => {
      const { toolsCall } = createRoleFilterMiddleware(roleToModules, { failClosed: true })
      const next = vi.fn(() => Promise.resolve("ok"))
      const ctx: RoleFilterContext = { auth: { user: { roles: ["viewer"] } }, params: { name: 42 } }
      await expect(toolsCall(ctx, next)).rejects.toThrow(/unable to resolve the tool name/)
      expect(next).not.toHaveBeenCalled()
    })
  })
})
