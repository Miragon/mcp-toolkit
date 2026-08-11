import { RestError } from "./errors.js"
import type {
  HttpMethod,
  QueryValue,
  RestAuthConfig,
  RestClient,
  RestClientConfig,
  RestRequestOptions,
} from "./types.js"

/**
 * Build a `RestClient` with the given base URL, auth mode, and default
 * headers. The returned client handles URL-template expansion, query-string
 * encoding, auth header stamping, JSON serialization, and error mapping
 * (non-2xx responses throw `RestError`).
 *
 * Consumers typically instantiate one client per upstream backend and pass
 * it into `createToolRegistrar` so every tool handler receives the typed
 * client instance.
 */
const DEFAULT_TIMEOUT_MS = 30_000

export function createRestClient(config: RestClientConfig): RestClient {
  const baseUrl = stripTrailingSlash(config.baseUrl)
  const authHeaders = buildAuthHeaders(config.auth ?? { mode: "none" })
  const fetchImpl = config.fetch ?? globalThis.fetch
  const defaultTimeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (typeof fetchImpl !== "function") {
    throw new Error("createRestClient: no fetch implementation available")
  }

  async function request<T>(options: RestRequestOptions): Promise<T> {
    const url = buildUrl(baseUrl, options.path, options.pathParams, options.query)
    const headers = mergeHeaders(
      { accept: "application/json" },
      config.defaultHeaders,
      authHeaders,
      options.headers,
    )
    const init = buildInit(options, headers)
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      init,
      options.signal,
      options.timeoutMs ?? defaultTimeoutMs,
    )

    if (!response.ok) {
      const body = await safeReadText(response)
      throw new RestError(response.status, response.statusText, body, url)
    }
    return decodeBody<T>(response)
  }

  return { request, baseUrl }
}

function buildInit(options: RestRequestOptions, headers: Record<string, string>): RequestInit {
  const init: RequestInit = { method: options.method, headers }
  if (options.body !== undefined && options.body !== null && methodAllowsBody(options.method)) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body)
    if (typeof options.body !== "string" && !hasContentType(headers)) {
      headers["content-type"] = "application/json"
    }
  }
  return init
}

/**
 * A hung upstream must not block the tool call (and its MCP connection)
 * forever. Abort on timeout, and combine with the caller's signal so an
 * explicit cancellation still works. A dedicated timeout signal lets us tell
 * "timed out" from "caller aborted" in the catch.
 */
async function fetchWithTimeout(
  fetchImpl: NonNullable<RestClientConfig["fetch"]>,
  url: string,
  init: RequestInit,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
  const signal = combineSignals(callerSignal, timeoutSignal)
  if (signal) init.signal = signal
  try {
    return await fetchImpl(url, init)
  } catch (err) {
    if (timeoutSignal?.aborted && !callerSignal?.aborted) {
      throw new Error(`REST request to ${url} timed out after ${timeoutMs}ms`, { cause: err })
    }
    throw err
  }
}

async function decodeBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    return (await response.json()) as T
  }
  return (await response.text()) as unknown as T
}

/**
 * Combine an optional caller signal with an optional timeout signal into the
 * single `AbortSignal` fetch accepts. Returns `undefined` when neither is
 * present (no abort behaviour), the sole signal when only one is, or
 * `AbortSignal.any([...])` when both are — so whichever fires first aborts the
 * request.
 */
function combineSignals(
  caller: AbortSignal | undefined,
  timeout: AbortSignal | undefined,
): AbortSignal | undefined {
  if (caller && timeout) return AbortSignal.any([caller, timeout])
  return caller ?? timeout
}

function buildAuthHeaders(auth: RestAuthConfig): Record<string, string> {
  switch (auth.mode) {
    case "none":
      return {}
    case "bearer":
      return { authorization: `Bearer ${auth.token}` }
    case "header":
      return { [auth.headerName.toLowerCase()]: auth.value }
  }
}

function buildUrl(
  baseUrl: string,
  path: string,
  pathParams: Record<string, string | number> | undefined,
  query: Record<string, QueryValue | QueryValue[]> | undefined,
): string {
  const expandedPath = expandPathTemplate(path, pathParams)
  const joined = expandedPath.startsWith("/")
    ? `${baseUrl}${expandedPath}`
    : `${baseUrl}/${expandedPath}`
  const queryString = encodeQuery(query)
  return queryString ? `${joined}?${queryString}` : joined
}

function expandPathTemplate(
  path: string,
  params: Record<string, string | number> | undefined,
): string {
  return path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    if (!params || !(key in params)) {
      throw new Error(`Missing path parameter "${key}" for template "${path}"`)
    }
    return encodeURIComponent(String(params[key]))
  })
}

function encodeQuery(query: Record<string, QueryValue | QueryValue[]> | undefined): string {
  if (!query) return ""
  const params: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null) continue
        params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(entry))}`)
      }
    } else {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return params.join("&")
}

function mergeHeaders(
  ...sources: Array<Record<string, string> | undefined>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      out[key.toLowerCase()] = value
    }
  }
  return out
}

function hasContentType(headers: Record<string, string>): boolean {
  return "content-type" in headers
}

function methodAllowsBody(method: HttpMethod): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ""
  }
}
