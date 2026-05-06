import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

export interface UpstreamToolDescriptor {
  name: string
  description?: string
  title?: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

export interface FetchToolsOptions {
  upstreamUrl: string
  /**
   * Static auth for the build-time handshake. OAuth2 is not supported here —
   * run the OAuth2 flow once in dev, paste the resulting access token, and
   * use `{ mode: "bearer", token }` for subsequent regenerations.
   */
  auth?:
    | { mode: "none" }
    | { mode: "bearer"; token: string }
    | { mode: "header"; headerName: string; value: string }
  /** Optional request headers to merge on top of the auth header. */
  headers?: Record<string, string>
}

function authHeaders(auth: FetchToolsOptions["auth"]): Record<string, string> {
  if (!auth || auth.mode === "none") return {}
  if (auth.mode === "bearer") return { authorization: `Bearer ${auth.token}` }
  return { [auth.headerName.toLowerCase()]: auth.value }
}

/**
 * Connects to an upstream MCP server over streamable HTTP, performs the
 * initialize handshake, and returns the `tools/list` response. The
 * connection is closed before returning.
 *
 * Used by the codegen CLI (`generate` / `inspect`) to snapshot an upstream's
 * tool surface. Not intended for request-path use at runtime — the toolkit's
 * runtime proxy goes through `UpstreamProxyPlugin` instead.
 */
export async function fetchUpstreamTools(
  options: FetchToolsOptions,
): Promise<UpstreamToolDescriptor[]> {
  const url = new URL(options.upstreamUrl)
  const requestInit: RequestInit = {
    headers: { ...authHeaders(options.auth), ...(options.headers ?? {}) },
  }
  const transport = new StreamableHTTPClientTransport(url, { requestInit })
  const client = new Client({ name: "mcp-tool-codegen", version: "0.1.0" }, { capabilities: {} })

  try {
    await client.connect(transport)
    const result = await client.listTools()
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      title: t.title,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
    }))
  } finally {
    await client.close().catch(() => {})
  }
}
