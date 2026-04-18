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
}

export interface RestClient {
  /** Execute a request; throws `RestError` on non-2xx responses. */
  request<T = unknown>(options: RestRequestOptions): Promise<T>
  /** Exposed so tools can share the base URL (e.g. for link formatting). */
  readonly baseUrl: string
}
