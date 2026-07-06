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
 * The resolver returned by {@link installToolCallNameCapture}: callable as a
 * plain {@link ToolNameResolver} (first `tools/call` name — the common case
 * and the logging-friendly one), with `.all()` exposing every name the
 * in-flight envelope carries. A JSON-RPC *batch* can contain several
 * `tools/call` requests, and a guard that only checks one of them can be
 * bypassed by the others — the role filter therefore consumes `.all()`.
 */
export interface ToolNameCapture extends ToolNameResolver {
  /** Every `tools/call` name in the in-flight envelope, or `undefined` outside a capture scope. */
  all: () => string[] | undefined
}

/**
 * Parse a JSON-RPC request body and return the `params.name` of every
 * `tools/call` request it carries: a single request yields zero or one entry,
 * a batch array yields one entry per `tools/call` it contains. Batches are a
 * real-world shape, not an edge case — Streamable-HTTP revision 2025-03-26
 * allows them, and claude.ai (via mcp-remote) frames single calls as
 * one-element batches.
 *
 * Pure and side-effect free so it can be unit-tested without an HTTP server.
 * Tolerates arbitrary `unknown` input: malformed bodies, malformed batch
 * entries, and non-`tools/call` methods contribute nothing rather than throw.
 */
export function extractToolCallNames(body: unknown): string[] {
  if (Array.isArray(body)) {
    return body.flatMap((entry) => extractToolCallNames(entry))
  }
  if (typeof body !== "object" || body === null) return []
  const { method, params } = body as { method?: unknown; params?: unknown }
  if (method !== "tools/call") return []
  if (typeof params !== "object" || params === null) return []
  const { name } = params as { name?: unknown }
  return typeof name === "string" ? [name] : []
}

/**
 * First `tools/call` name of a JSON-RPC request body (single request or batch
 * array), or `undefined` when it carries none. Sufficient for logging; guards
 * must use {@link extractToolCallNames} — a batch can carry several calls.
 */
export function extractToolCallName(body: unknown): string | undefined {
  return extractToolCallNames(body)[0]
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

export function installToolCallNameCapture(server: McpServerInstance<boolean>): ToolNameCapture {
  const toolNamesByRequest = new WeakMap<HonoContext, string[]>()

  server.use(async (c, next) => {
    if (c.req.method === "POST" && isMcpTransportPath(c.req.path)) {
      const body: unknown = await c.req.raw
        .clone()
        .json()
        .catch(() => undefined)
      const toolNames = extractToolCallNames(body)
      if (toolNames.length > 0) {
        toolNamesByRequest.set(c, toolNames)
      }
    }
    await next()
  })

  const all = (): string[] | undefined => {
    const requestContext = getRequestContext()
    if (!requestContext) return undefined
    return toolNamesByRequest.get(requestContext)
  }
  return Object.assign(() => all()?.[0], { all })
}
