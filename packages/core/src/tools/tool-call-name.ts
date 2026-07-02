import { getRequestContext, type McpServerInstance } from "mcp-use/server"

/**
 * The request-scoped Hono context `getRequestContext()` hands back. Derived
 * from the resolver's return type so we needn't take a direct `hono`
 * dependency just to name the `WeakMap` key.
 */
type HonoContext = NonNullable<ReturnType<typeof getRequestContext>>

/**
 * Resolves the tool name of the in-flight `tools/call` request, or
 * `undefined` when called outside a tool-call request scope.
 *
 * Backs the role-filter's `tools/call` guard: mcp-use 1.28 passes only the
 * tool *arguments* to `mcp:tools/call` middleware as `ctx.params`, so the
 * `params.name` its typings declare is never populated at runtime. This
 * resolver recovers the real name from the JSON-RPC envelope captured at the
 * HTTP layer.
 */
export type ToolNameResolver = () => string | undefined

/**
 * Parse a JSON-RPC request body and return the `params.name` of a
 * `tools/call` request, or `undefined` for any other shape.
 *
 * Pure and side-effect free so it can be unit-tested without an HTTP server.
 * Tolerates arbitrary `unknown` input: malformed bodies, batch arrays, and
 * non-`tools/call` methods all yield `undefined` rather than throwing.
 */
export function extractToolCallName(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined
  const { method, params } = body as { method?: unknown; params?: unknown }
  if (method !== "tools/call") return undefined
  if (typeof params !== "object" || params === null) return undefined
  const { name } = params as { name?: unknown }
  return typeof name === "string" ? name : undefined
}

/**
 * Capture the `tools/call` tool name at the HTTP layer and expose it to the
 * MCP middleware chain.
 *
 * Registers a Hono middleware on the server that, for `POST` requests to an
 * MCP transport endpoint, clones the request body (so the MCP transport can
 * still read it), parses the JSON-RPC envelope, and — when it's a
 * `tools/call` — stashes the tool name in a `WeakMap` keyed by the
 * request-scoped Hono context. The returned resolver reads that map back via
 * `getRequestContext()`, which yields the same context inside the MCP
 * middleware chain.
 *
 * mcp-use mounts the *same* Streamable-HTTP handler at both `/mcp` and `/sse`
 * (`for (const endpoint of ["/mcp", "/sse"])`), so the capture must match both
 * — otherwise a `tools/call` sent to `/sse` executes but its name is never
 * captured, and the role-filter guard that depends on this resolver silently
 * falls open. Matching both endpoints closes that bypass.
 *
 * The `WeakMap` keying keeps the capture request-isolated: entries are
 * garbage-collected with their context and never leak across concurrent
 * requests.
 */
const MCP_TRANSPORT_PATHS = new Set(["/mcp", "/sse"])

/**
 * Whether `path` is one of the MCP transport endpoints mcp-use mounts the
 * Streamable-HTTP handler at. Both `/mcp` and `/sse` accept `tools/call`, so
 * the tool-name capture (and the role-filter guard that reads it) must cover
 * both — matching only `/mcp` leaves a `tools/call` over `/sse` unguarded.
 * Exported so the endpoint contract is pinned by a unit test.
 */
export function isMcpTransportPath(path: string): boolean {
  return MCP_TRANSPORT_PATHS.has(path)
}

export function installToolCallNameCapture(server: McpServerInstance<boolean>): ToolNameResolver {
  const toolNameByRequest = new WeakMap<HonoContext, string>()

  server.use(async (c, next) => {
    if (c.req.method === "POST" && isMcpTransportPath(c.req.path)) {
      const body: unknown = await c.req.raw
        .clone()
        .json()
        .catch(() => undefined)
      const toolName = extractToolCallName(body)
      if (toolName !== undefined) {
        toolNameByRequest.set(c, toolName)
      }
    }
    await next()
  })

  return () => {
    const requestContext = getRequestContext()
    if (!requestContext) return undefined
    return toolNameByRequest.get(requestContext)
  }
}
