/**
 * Auth configuration for a REST upstream.
 *
 * Modes mirror `UpstreamProxyPlugin` for consistency, minus `oauth2` which
 * requires per-user session plumbing (callback routes, token store) and is
 * a future iteration.
 *
 * - `none`    — no auth headers added
 * - `bearer`  — stamps `Authorization: Bearer <token>`
 * - `header`  — stamps a custom header on every request
 */
export type RestAuthConfig =
  | { mode: "none" }
  | { mode: "bearer"; token: string }
  | { mode: "header"; headerName: string; value: string }

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type QueryValue = string | number | boolean | null | undefined

export interface RestRequestOptions {
  method: HttpMethod
  path: string
  pathParams?: Record<string, string | number>
  query?: Record<string, QueryValue | QueryValue[]>
  body?: unknown
  headers?: Record<string, string>
  /**
   * Abort the request when this signal fires, in addition to the timeout. Use
   * it to cancel a request from the caller (e.g. a tool handler that received
   * its own abort signal).
   */
  signal?: AbortSignal
  /**
   * Override {@link RestClientConfig.timeoutMs} for this request. `0` disables
   * the timeout for this call only.
   */
  timeoutMs?: number
}

export interface RestClientConfig {
  baseUrl: string
  auth?: RestAuthConfig
  defaultHeaders?: Record<string, string>
  /**
   * Optional fetch implementation. Defaults to `globalThis.fetch`. Useful
   * for tests and for runtimes that require a custom fetch.
   */
  fetch?: typeof fetch
  /**
   * Default per-request timeout in milliseconds. A request that doesn't settle
   * within this window is aborted, so a hung upstream can't block a tool call
   * (and its MCP connection) indefinitely. Defaults to `30000`. Set to `0` to
   * disable the default timeout entirely.
   */
  timeoutMs?: number
}

export interface RestClient {
  /** Execute a request; throws `RestError` on non-2xx responses. */
  request<T = unknown>(options: RestRequestOptions): Promise<T>
  /** Exposed so tools can share the base URL (e.g. for link formatting). */
  readonly baseUrl: string
}
