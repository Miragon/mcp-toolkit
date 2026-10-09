/**
 * Role-scoped module access for mcp-use middleware.
 *
 * Two middlewares are returned from a single role→modules mapping so they
 * stay in sync:
 *
 * - `toolsList` — filters `tools/list` responses so users only see tools
 *   belonging to modules their role(s) can access.
 * - `toolsCall` — defence-in-depth: blocks a `tools/call` for a tool whose
 *   module isn't allowed for the caller's role(s). Reads the name straight off
 *   `ctx.params.name`. When no name is present it fails *open* by default
 *   (allow) — pass `failClosed: true` to deny instead.
 *
 * The caller's roles come from {@link resolveCaller}, which reads both mcp-use 2
 * shapes — middleware receives the SDK `AuthInfo` with the provider-mapped user
 * under `ctx.auth.extra.user`, never `ctx.auth.user`.
 *
 * Batches need no special handling: mcp-use invokes `mcp:tools/call`
 * middleware once per call, so each entry of a JSON-RPC batch is guarded
 * individually (verified against 2.0.4 — a two-entry batch fires the guard
 * twice, with each name).
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

import { resolveCaller, type Caller } from "../auth/caller.js"

/**
 * The slice of an mcp-use middleware context the role filter reads. Kept
 * structural (no mcp-use import) so the root barrel stays host-agnostic; it is
 * shaped so mcp-use 2's own `MiddlewareContext` is assignable to it.
 */
export interface RoleFilterContext {
  auth?: {
    /** Callback-shaped (and 1.x-era) contexts: the provider-mapped user. */
    user?: { roles?: unknown }
    /** mcp-use 2 middleware: SDK `AuthInfo.extra`, holding the mapped `user`. */
    extra?: Record<string, unknown>
  }
  method?: string
  params?: { name?: unknown; [key: string]: unknown }
}

/**
 * A role-filter middleware as consumers type their own wrappers and test
 * doubles: the chain result is `unknown`. Kept non-generic on purpose — it is
 * the published 2.x shape, and a generic alias would no longer accept a
 * consumer function that returns a concrete type. The factory's middlewares
 * ({@link RoleFilterMiddlewareFn}) are assignable to it.
 */
export type RoleFilterMiddleware = (
  ctx: RoleFilterContext,
  next: () => Promise<unknown>,
) => Promise<unknown>

/**
 * The middleware {@link createRoleFilterMiddleware} returns. Generic over the
 * chain's result so it registers directly on
 * `server.use("mcp:tools/list" | "mcp:tools/call", …)` without a cast — the
 * result of `next()` flows back out with its type intact. Assignable to
 * {@link RoleFilterMiddleware}.
 */
export type RoleFilterMiddlewareFn = <TResult>(
  ctx: RoleFilterContext,
  next: () => Promise<TResult>,
) => Promise<TResult>

/**
 * The `tools/list` + `tools/call` pair. Without a type argument the fields are
 * the non-generic {@link RoleFilterMiddleware} (the shape consumers build by
 * hand); the factory returns `RoleFilterMiddlewares<RoleFilterMiddlewareFn>`,
 * which is assignable to it.
 */
export interface RoleFilterMiddlewares<TMiddleware = RoleFilterMiddleware> {
  /** Register with `server.use("mcp:tools/list", ...)`. */
  toolsList: TMiddleware
  /** Register with `server.use("mcp:tools/call", ...)`. */
  toolsCall: TMiddleware
}

export interface RoleFilterOptions {
  /**
   * When `true`, a `tools/call` that arrives without a readable tool name is
   * *denied* instead of allowed. Defaults to `false` (fail-open), matching the
   * prior behaviour. Opt in for deployments where an unnamed call must never
   * slip past the module guard.
   *
   * Since mcp-use 2.x the name is always present on `ctx.params.name` for a
   * well-formed call, so this now only fires on malformed input rather than on
   * the framework's own shape.
   */
  failClosed?: boolean
}

const modulePrefixOf = (toolName: string): string => toolName.split("_")[0] ?? ""

export function createRoleFilterMiddleware(
  roleToModules: Record<string, string[]>,
  opts: RoleFilterOptions = {},
): RoleFilterMiddlewares<RoleFilterMiddlewareFn> {
  const failClosed = opts.failClosed ?? false
  const hasRules = Object.keys(roleToModules).length > 0

  // Returns `null` = unrestricted (full access), array = restricted.
  const allowedModulesFor = (caller: Caller | undefined): string[] | null => {
    const restrictedRoles = (caller?.roles ?? []).filter((r) => r in roleToModules)
    if (restrictedRoles.length === 0) return null
    return [...new Set(restrictedRoles.flatMap((r) => roleToModules[r] ?? []))]
  }

  // Tools without an underscore are framework/app-level and always allowed.
  const isAllowed = (toolName: string, allowed: string[]): boolean =>
    !toolName.includes("_") || allowed.includes(modulePrefixOf(toolName))

  const toolsList = async <TResult>(
    ctx: RoleFilterContext,
    next: () => Promise<TResult>,
  ): Promise<TResult> => {
    const result = await next()
    if (!hasRules || !Array.isArray(result)) return result
    const allowed = allowedModulesFor(resolveCaller(ctx))
    if (allowed === null) return result
    // Filtering keeps the element type, so the narrowed array is still the
    // chain's `TResult` — TypeScript just cannot carry that through
    // `Array.isArray`.
    return result.filter(
      (tool: { name?: unknown }) => typeof tool.name === "string" && isAllowed(tool.name, allowed),
    ) as TResult
  }

  const toolsCall = async <TResult>(
    ctx: RoleFilterContext,
    next: () => Promise<TResult>,
  ): Promise<TResult> => {
    if (!hasRules) return next()
    const name = typeof ctx.params?.name === "string" ? ctx.params.name : undefined
    if (name === undefined) {
      if (failClosed) {
        throw new Error(
          "Access denied: unable to resolve the tool name for this call; rejecting under fail-closed policy.",
        )
      }
      return next()
    }
    const caller = resolveCaller(ctx)
    const allowed = allowedModulesFor(caller)
    if (allowed !== null && !isAllowed(name, allowed)) {
      throw new Error(
        `Access denied: role(s) "${(caller?.roles ?? []).join(", ")}" have no access to module "${modulePrefixOf(name)}".`,
      )
    }
    return next()
  }

  return { toolsList, toolsCall }
}
