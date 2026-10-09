/**
 * Organisation-scope gate for mcp-use middleware.
 *
 * If `orgId` is given, every inbound MCP RPC must come from a user whose
 * token carries that organization — other orgs (or tokens without any org
 * context) get rejected with a thrown error. The organization comes from
 * {@link resolveCaller}: the provider-mapped `user.organizationId` (WorkOS,
 * Clerk, Scalekit, …), or the 1.x-era `user.organization_id`, read from
 * either mcp-use 2 shape — middleware receives the SDK `AuthInfo` with the
 * mapped user under `ctx.auth.extra.user`.
 *
 * Register on an mcp-use server with `server.use("mcp:*", createOrgGateMiddleware(ORG_ID))`.
 * Pass `undefined` to disable (returns a pass-through middleware) — handy so
 * the caller can unconditionally wire it up and let env config decide.
 */

import { resolveCaller } from "../auth/caller.js"

/**
 * The slice of an mcp-use middleware context the gate reads. Structural (no
 * mcp-use import), shaped so mcp-use 2's own `MiddlewareContext` is
 * assignable to it.
 */
interface OrgGateContext {
  auth?: {
    /** Callback-shaped (and 1.x-era) contexts: the provider-mapped user. */
    user?: Record<string, unknown>
    /** mcp-use 2 middleware: SDK `AuthInfo.extra`, holding the mapped `user`. */
    extra?: Record<string, unknown>
  }
}

/**
 * Generic over the chain's result so it registers directly on
 * `server.use("mcp:*", …)` (and on any exact `mcp:` method).
 */
export type OrgGateMiddleware = <TResult>(
  ctx: OrgGateContext,
  next: () => Promise<TResult>,
) => Promise<TResult>

export function createOrgGateMiddleware(orgId: string | undefined): OrgGateMiddleware {
  if (!orgId) return (_ctx, next) => next()

  return async (ctx, next) => {
    const tokenOrgId = resolveCaller(ctx)?.organizationId
    if (!tokenOrgId) {
      throw new Error(
        "Access denied: no organization context in the token. Authenticate with the correct organization.",
      )
    }
    if (tokenOrgId !== orgId) {
      throw new Error("Access denied: user is not a member of this organization.")
    }
    return next()
  }
}
