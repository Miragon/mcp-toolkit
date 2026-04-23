/**
 * Organisation-scope gate for mcp-use middleware.
 *
 * Built for WorkOS-style tokens that carry an `organization_id` claim on the
 * user object. If `orgId` is given, every inbound MCP RPC must come from a
 * user whose token matches — other orgs (or tokens without any org context)
 * get rejected with a thrown error.
 *
 * Register on an mcp-use server with `server.use("mcp:*", createOrgGateMiddleware(ORG_ID))`.
 * Pass `undefined` to disable (returns a pass-through middleware) — handy so
 * the caller can unconditionally wire it up and let env config decide.
 */

interface OrgGateContext {
  auth?: { user?: Record<string, unknown> }
}
type Next = () => Promise<unknown>
export type OrgGateMiddleware = (ctx: OrgGateContext, next: Next) => Promise<unknown>

export function createOrgGateMiddleware(orgId: string | undefined): OrgGateMiddleware {
  if (!orgId) return (_ctx, next) => next()

  return async (ctx, next) => {
    const user = ctx.auth?.user
    const tokenOrgId = user?.organization_id
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
