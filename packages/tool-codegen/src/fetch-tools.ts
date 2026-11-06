import { AsyncLocalStorage } from "node:async_hooks"
import { createRequire } from "node:module"
import { format } from "node:util"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { logText, sourceOf, withOriginsOnly } from "./safe-text.js"

/** Static auth for the build-time handshake. */
export type CodegenAuth =
  | { mode: "none" }
  | { mode: "bearer"; token: string }
  | { mode: "header"; headerName: string; value: string }

/** The behaviour hints of a tool (MCP `ToolAnnotations`). */
export interface ToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/** One entry of a server's tools/list. Every field is the server's word: untrusted. */
export interface ToolDescriptor {
  name: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: ToolAnnotations
}

export interface FetchToolsOptions {
  /** Streamable HTTP endpoint of the MCP server. */
  url: string
  /**
   * OAuth is not supported here: run the flow once, then pass the access
   * token as `{ mode: "bearer", token }`.
   */
  auth?: CodegenAuth
  /** Extra request headers, sent after the auth header. */
  headers?: Record<string, string>
}

const { version } = createRequire(import.meta.url)("../package.json") as { version: string }

function authHeaders(auth: CodegenAuth | undefined): Record<string, string> {
  if (auth?.mode === "bearer") return { authorization: `Bearer ${auth.token}` }
  if (auth?.mode === "header") return { [auth.headerName]: auth.value }
  return {}
}

/** The request headers; names compare case-insensitively, so a later `X-Key` replaces `x-key`. */
function requestHeaders(options: FetchToolsOptions): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...authHeaders(options.auth), ...options.headers }).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  )
}

/**
 * Why a request failed: the error's message, and for a failed connection the
 * system's code (ECONNREFUSED, ENOTFOUND), which fetch hides in its cause.
 */
function failureOf(error: unknown): string {
  const { message, cause } = error as Error & { cause?: { code?: unknown } }
  const code = cause?.code
  const text = withOriginsOnly(String(message))
  return typeof code === "string"
    ? `${text} (${code}): is the server running at that address?`
    : text
}

/** The console methods that print a message; the MCP client SDK writes through them. */
const CONSOLE_METHODS = ["debug", "error", "info", "log", "trace", "warn"] as const

type Print = (...data: unknown[]) => void

/** The console's printing methods, which the routing replaces by name. */
const printing: Record<(typeof CONSOLE_METHODS)[number], Print> = console

/** Set in the async context of a fetch: what is printed there is the SDK's. */
const inFetch = new AsyncLocalStorage<true>()
/** The fetches running; the first routes the console, the last restores it. */
let fetches = 0
let restoreConsole = (): void => undefined

/**
 * Prints what is logged in a fetch's async context through `logText`, on stderr: the SDK quotes
 * the server in its messages (it names a tool it drops by its raw name, and the declaration that
 * made it drop the tool), and a line of server text must not start a line of a CI log. Other
 * code's output passes as it was. Returns what restores the console's methods, each only while
 * it is still the one routed here.
 */
function routeConsole(): () => void {
  const warn = printing.warn
  const routed = CONSOLE_METHODS.map((method) => {
    const original = printing[method]
    const route: Print = (...data) => {
      if (inFetch.getStore()) warn.call(console, logText(format(...data)))
      else original.apply(console, data)
    }
    printing[method] = route
    return { method, original, route }
  })
  return () => {
    for (const { method, original, route } of routed) {
      if (printing[method] === route) printing[method] = original
    }
  }
}

/**
 * Runs `fetch` with the console routed as `routeConsole` says, also when several fetches
 * overlap. Exported for tests.
 */
export async function withSdkOutputCleaned<T>(fetch: () => Promise<T>): Promise<T> {
  if (fetches++ === 0) restoreConsole = routeConsole()
  try {
    return await inFetch.run(true, fetch)
  } finally {
    if (--fetches === 0) restoreConsole()
  }
}

/**
 * Connects to an MCP server over streamable HTTP, performs the initialize
 * handshake and returns its complete tools/list (every page), in the server's
 * order. Build-time only: the connection is closed before it returns. A failure
 * names the server by its origin, never its path, query or credentials, and
 * what the SDK prints meanwhile reaches stderr cleaned like an error message.
 */
export async function fetchTools(options: FetchToolsOptions): Promise<ToolDescriptor[]> {
  return await withSdkOutputCleaned(() => listTools(options))
}

async function listTools(options: FetchToolsOptions): Promise<ToolDescriptor[]> {
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: { headers: requestHeaders(options) },
  })
  // The 2025 handshake, named rather than left to the SDK's default, which the SDK calls a
  // one-line flip. In the 2026-07-28 era, listTools drops every tool with an invalid
  // x-mcp-header: the generated files would lose it without an error, and the SDK prints its raw
  // name and declaration with console.warn (withSdkOutputCleaned catches that too).
  const client = new Client(
    { name: "mcp-tool-codegen", version },
    { versionNegotiation: { mode: "legacy" } },
  )
  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    return tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
    }))
  } catch (error) {
    throw new Error(`cannot list the tools of ${sourceOf(options.url)}: ${failureOf(error)}`, {
      cause: error,
    })
  } finally {
    await client.close().catch(() => undefined)
  }
}
