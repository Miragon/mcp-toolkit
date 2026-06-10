/**
 * Role-scoped module access for mcp-use middleware.
 *
 * Two middlewares are returned from a single role→modules mapping so they
 * stay in sync:
 *
 * - `toolsList` — filters `tools/list` responses so users only see tools
 *   belonging to modules their role(s) can access.
 * - `toolsCall` — defence-in-depth: blocks a `tools/call` for a tool whose
 *   module isn't allowed for the caller's role(s). Reads the tool name via the
 *   injected `resolveToolName` (mcp-use 1.28 does not put it in `ctx.params`);
 *   when the name can't be resolved it fails *open* by default (allow) — pass
 *   `failClosed: true` to deny instead.
 *
 * Tool-to-module mapping uses the prefix convention `<module>_<tool>`.
 * Tools without an underscore are always allowed (they're framework or
 * app-level tools that don't belong to a specific module).
 *
 * Role semantics: a role listed as a key in the mapping *restricts* users
 * with that role to the listed modules. A user with multiple restricted
 * roles sees the *union*. A user with no role that appears as a key gets
 * *unrestricted* access — this is deliberately opt-in so that adding a new
 * role doesn't silently revoke anyone's tools.
 */

export interface RoleFilterContext {
  auth?: { user?: { roles?: unknown } }
  method?: string
  params?: { name?: unknown }
}
type Next = () => Promise<unknown>
export type RoleFilterMiddleware = (ctx: RoleFilterContext, next: Next) => Promise<unknown>

export interface RoleFilterMiddlewares {
  /** Register with `server.use("mcp:tools/list", ...)`. */
  toolsList: RoleFilterMiddleware
  /** Register with `server.use("mcp:tools/call", ...)`. */
  toolsCall: RoleFilterMiddleware
}

export interface RoleFilterOptions {
  /**
   * Resolves the in-flight `tools/call` tool name. Required for the
   * `toolsCall` guard to function: mcp-use 1.28 populates `ctx.params` with the
   * tool *arguments*, not `{ name, arguments }`, so `ctx.params?.name` is never
   * the tool name at runtime (and a tool argument literally called `name` —
   * e.g. `save-dashboard`'s — would be misread as one). Wire this to
   * `installToolCallNameCapture(server)` from the `./tools` subpath, which
   * recovers the name from the JSON-RPC envelope. Falls back to
   * `ctx.params?.name` when omitted (legacy behaviour).
   */
  resolveToolName?: () => string | undefined
  /**
   * When `true`, a `tools/call` whose tool name can't be resolved is *denied*
   * instead of allowed. Defaults to `false` (fail-open) to preserve the prior
   * behaviour — opt in for stricter deployments where an unresolved name should
   * never slip past the module guard. Only meaningful alongside
   * `resolveToolName`; without a resolver the name is unavailable by design and
   * enabling this would block every call.
   */
  failClosed?: boolean
}

export function createRoleFilterMiddleware(
  roleToModules: Record<string, string[]>,
  opts: RoleFilterOptions = {},
): RoleFilterMiddlewares {
  const resolveToolName = opts.resolveToolName
  const failClosed = opts.failClosed ?? false
  const hasRules = Object.keys(roleToModules).length > 0

  // Returns `null` = unrestricted (full access), array = restricted.
  const allowedModulesFor = (user: { roles?: unknown } | undefined): string[] | null => {
    if (!hasRules) return null
    const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : []
    const restrictedRoles = roles.filter((r) => r in roleToModules)
    if (restrictedRoles.length === 0) return null
    return [...new Set(restrictedRoles.flatMap((r) => roleToModules[r] ?? []))]
  }

  const toolsList: RoleFilterMiddleware = async (ctx, next) => {
    const tools = (await next()) as { name: string }[]
    if (!hasRules || !Array.isArray(tools)) return tools
    const allowed = allowedModulesFor(ctx.auth?.user)
    if (allowed === null) return tools
    return tools.filter((t) => {
      if (!t.name.includes("_")) return true
      return allowed.includes(t.name.split("_")[0] ?? "")
    })
  }

  const toolsCall: RoleFilterMiddleware = async (ctx, next) => {
    if (!hasRules) return next()
    const resolved = resolveToolName?.()
    const toolName =
      typeof resolved === "string"
        ? resolved
        : typeof ctx.params?.name === "string"
          ? ctx.params.name
          : undefined
    if (!toolName) {
      if (failClosed) {
        throw new Error(
          "Access denied: unable to resolve the tool name for this call; rejecting under fail-closed policy.",
        )
      }
      return next()
    }
    if (!toolName.includes("_")) return next()
    const allowed = allowedModulesFor(ctx.auth?.user)
    if (allowed === null) return next()
    const modulePrefix = toolName.split("_")[0] ?? ""
    if (!allowed.includes(modulePrefix)) {
      const userRoles = (ctx.auth?.user as { roles?: string[] } | undefined)?.roles ?? []
      throw new Error(
        `Access denied: role(s) "${userRoles.join(", ")}" have no access to module "${modulePrefix}".`,
      )
    }
    return next()
  }

  return { toolsList, toolsCall }
}
