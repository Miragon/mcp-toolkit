import type { MCPClient } from "mcp-use/client"
import type { ServerSideOAuthProvider } from "./ServerSideOAuthProvider.js"

/**
 * Auth configuration for an upstream MCP server.
 *
 * - `none`    — no auth headers added
 * - `bearer`  — stamps `Authorization: Bearer <token>` (via mcp-use `authToken`)
 * - `header`  — stamps a custom header on every request
 * - `oauth2`  — runs an MCP-SDK OAuth 2.1 dance per-user with the upstream
 */
export type UpstreamAuthConfig =
  | { mode: "none" }
  | { mode: "bearer"; token: string }
  | { mode: "header"; headerName: string; value: string }
  | { mode: "oauth2"; clientName?: string }

/** Pattern for valid proxy names — used as tool-name prefix. */
export const PROXY_NAME_PATTERN = /^[a-z][a-z0-9-]*$/

/** A completed per-user upstream session (oauth2 mode). */
export interface UserUpstreamSession {
  client: MCPClient
  /**
   * Concrete type is `MCPSession` from mcp-use, but we keep it loose so the
   * toolkit barrel does not pull session internals into consumers that only
   * need the types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any
}

/** In-flight OAuth dance awaiting the browser redirect (oauth2 mode). */
export interface PendingAuth {
  userId: string
  serverName: string
  provider: ServerSideOAuthProvider
  /** Inbound transport session id — used to push tools/list_changed. */
  inboundSessionId: string
  /** Unix ms timestamp after which this entry is considered expired. */
  expiresAt: number
  /** Random UUID set in a cookie on the initiate redirect; verified on callback. */
  nonce: string
  /** Real OAuth provider URL; the initiate endpoint redirects here. */
  authorizationUrl: string
}
