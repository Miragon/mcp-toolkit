import { createRequire } from "node:module"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { sourceOf, withOriginsOnly } from "./safe-text.js"

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

/**
 * Connects to an MCP server over streamable HTTP, performs the initialize
 * handshake and returns its complete tools/list (every page), in the server's
 * order. Build-time only: the connection is closed before it returns. A failure
 * names the server by its origin, never its path, query or credentials.
 */
export async function fetchTools(options: FetchToolsOptions): Promise<ToolDescriptor[]> {
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: { headers: requestHeaders(options) },
  })
  const client = new Client({ name: "mcp-tool-codegen", version })
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
