/**
 * Caller identity — the ONE place the toolkit reads who is calling.
 *
 * mcp-use 2 hands out two `ctx.auth` shapes, and every auth consumer in the
 * toolkit (role filter, org gate, dashboard scoping, the render-view /
 * refresh-view pipeline context, the builder catalogue) has to read both:
 *
 * - **MCP middleware** (`server.use("mcp:…")`) receives the SDK `AuthInfo`.
 *   The provider-mapped `{ user, payload, permissions }` sit under
 *   `ctx.auth.extra` — there is no `ctx.auth.user`.
 * - **Tool / resource / prompt callbacks** receive the flattened
 *   `ctx.auth = { user, payload, accessToken, scopes, … }`.
 *
 * The built-in providers (Keycloak, Auth0, WorkOS, Clerk, Supabase, Scalekit,
 * …) map the user as `{ id, organizationId?, roles? }`; 1.x-era custom
 * providers used `userId` / `organization_id`. Both spellings resolve here.
 *
 * Browser-safe on purpose (no mcp-use import): the shapes are read
 * structurally, so the helper works on any `ctx` — including hosts that omit
 * auth entirely.
 */

/** The caller identity the toolkit's auth consumers act on. */
export interface Caller {
  /**
   * Stable subject id: `user.id`, else `user.userId`, else the verified
   * token's `payload.sub`. `undefined` when the provider maps none — an
   * authenticated caller WITHOUT an id is not anonymous; consumers that
   * scope data per user must refuse it rather than fall back to global scope.
   */
  userId?: string
  /** `user.organizationId`, else `user.organization_id`. */
  organizationId?: string
  /** String entries of `user.roles`; empty when the provider maps none. */
  roles: string[]
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null
}

function firstString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate
  }
  return undefined
}

/**
 * Locate the provider-mapped `{ user, payload }` pair in either mcp-use 2
 * shape. The flattened callback shape wins when both are present.
 */
function identitySource(auth: UnknownRecord): { user?: UnknownRecord; payload?: UnknownRecord } {
  const extra = isRecord(auth.extra) ? auth.extra : undefined
  const user = isRecord(auth.user) ? auth.user : isRecord(extra?.user) ? extra.user : undefined
  const payload = isRecord(auth.payload)
    ? auth.payload
    : isRecord(extra?.payload)
      ? extra.payload
      : undefined
  return { user, payload }
}

/**
 * Resolve the caller from a middleware or tool/resource/prompt `ctx`.
 *
 * Returns `undefined` when the request carries no auth at all (a server
 * without OAuth, or a signed-out call to a `noauth` tool) — that is the only
 * case where global, owner-less scope is legitimate. Any `ctx.auth` yields a
 * {@link Caller}, even when no id can be resolved from it.
 *
 * @example
 * ```ts
 * server.tool({ name: "whoami", description: "…" }, (_args, ctx) => {
 *   const caller = resolveCaller(ctx)
 *   return textResult(caller?.userId ?? "anonymous")
 * })
 * ```
 */
export function resolveCaller(ctx: unknown): Caller | undefined {
  if (!isRecord(ctx) || !isRecord(ctx.auth)) return undefined
  const { user, payload } = identitySource(ctx.auth)
  const userId = firstString(user?.id, user?.userId, payload?.sub)
  const organizationId = firstString(user?.organizationId, user?.organization_id)
  const roles = Array.isArray(user?.roles)
    ? user.roles.filter((role): role is string => typeof role === "string")
    : []
  return {
    ...(userId === undefined ? {} : { userId }),
    ...(organizationId === undefined ? {} : { organizationId }),
    roles,
  }
}

/** Convenience for `resolveCaller(ctx)?.userId`. */
export function resolveCallerId(ctx: unknown): string | undefined {
  return resolveCaller(ctx)?.userId
}
