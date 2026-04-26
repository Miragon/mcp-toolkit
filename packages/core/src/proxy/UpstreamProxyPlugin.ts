import { randomUUID } from "node:crypto"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { MCPClient } from "mcp-use/client"
import { type MCPServer } from "mcp-use/server"

import type { AppDefinition, AppPlugin } from "../types/app.js"
import { jsonSchemaToZod } from "./jsonSchemaToZod.js"
import { ServerSideOAuthProvider } from "./ServerSideOAuthProvider.js"
import { InMemorySessionStore, type SessionStore } from "./SessionStore.js"
import { PROXY_NAME_PATTERN, type UpstreamAuthConfig } from "./types.js"

export interface UpstreamProxyPluginOptions {
  /** Short identifier; used as tool-name prefix. Must match `[a-z][a-z0-9-]*`. */
  name: string
  /** Optional display label (defaults to `name`). */
  label?: string
  /** URL of the upstream MCP server (HTTP/SSE endpoint). */
  upstreamUrl: string
  /** Auth mode & credentials for the upstream. */
  auth: UpstreamAuthConfig
  /**
   * Store for per-user oauth2 sessions. Required for `oauth2` mode, ignored
   * otherwise. Defaults to an `InMemorySessionStore` if not supplied.
   */
  sessionStore?: SessionStore
  /**
   * Public base URL the upstream IdP will redirect back to. Must resolve to
   * the MCP server this plugin is mounted on (so the `/oauth/callback/:name`
   * route fires). Required for `oauth2` mode, ignored otherwise.
   */
  callbackBaseUrl?: string
}

interface UpstreamTool {
  name: string
  description?: string
  inputSchema?: unknown
}

/**
 * Minimal shape of an mcp-use session that we actually use.
 *
 * mcp-use exposes concrete types for sessions, but they carry a wide surface
 * (prompts, resources, notifications). The proxy only needs list+call, so
 * we keep our dependency narrow.
 */
interface UpstreamSession {
  listTools(): Promise<UpstreamTool[]>
  callTool(name: string, args: unknown): Promise<unknown>
  readResource(uri: string): Promise<{
    contents: Array<
      | { uri: string; text: string; mimeType?: string }
      | { uri: string; blob: string; mimeType?: string }
    >
  }>
}

/** Shape of the `ctx` the mcp-use tool handler receives. */
interface ToolContext {
  auth?: { user?: { userId?: string } }
  session?: { sessionId?: string }
}

/** Shape of the `ctx` the mcp-use middleware receives. */
interface MiddlewareContext extends ToolContext {
  method?: string
}

type MiddlewareNext = () => Promise<unknown>
type MiddlewareHandler = (ctx: MiddlewareContext, next: MiddlewareNext) => Promise<unknown>

interface ServerWithMiddleware {
  use(pattern: string, handler: MiddlewareHandler): void
}

/**
 * An `AppPlugin` that exposes an upstream MCP server's tools through the
 * host MCP server, handling authentication for the caller.
 *
 * Auth modes:
 *
 * - **none** / **bearer** / **header**: `init(server)` connects once at boot
 *   with the shared credential and registers forwarded tools for all users.
 * - **oauth2**: `registerTools(server)` registers a `<name>_authenticate`
 *   tool and a per-user tools/list filter. When a caller runs the
 *   authenticate tool the plugin emits an authorization URL; the upstream
 *   IdP redirects to `<callbackBaseUrl>/oauth/callback/<name>?...`, the
 *   mounted callback exchanges the code, stores tokens per (userId, name),
 *   then discovers and registers the upstream's tools.
 *
 * Lifecycle (caller side):
 * 1. `const plugin = new UpstreamProxyPlugin({...})`
 * 2. `plugin.registerTools(server)` — sync, mounts route + auth tool/filter
 * 3. `await plugin.init(server)` — no-op for oauth2; connects+registers for
 *    static modes. Safe to call multiple times (idempotent).
 */
export class UpstreamProxyPlugin implements AppPlugin<MCPServer> {
  readonly definition: AppDefinition
  readonly appConfig: Record<string, unknown>

  public readonly name: string
  private readonly upstreamUrl: string
  private readonly authConfig: UpstreamAuthConfig
  private readonly sessionStore: SessionStore
  private readonly callbackBaseUrl?: string

  private readonly registeredTools = new Set<string>()
  /** Shared client for static-auth modes; undefined until `init()`. */
  private staticClient?: MCPClient
  /** Shared session for static-auth modes; undefined until `init()`. */
  private staticSession?: UpstreamSession
  private initPromise?: Promise<void>
  private toolsRegistered = false

  constructor(options: UpstreamProxyPluginOptions) {
    if (!PROXY_NAME_PATTERN.test(options.name)) {
      throw new Error(
        `UpstreamProxyPlugin: invalid name "${options.name}" (must match ${String(PROXY_NAME_PATTERN)})`,
      )
    }
    if (options.auth.mode === "oauth2" && !options.callbackBaseUrl) {
      throw new Error(
        `UpstreamProxyPlugin("${options.name}"): callbackBaseUrl is required for oauth2 mode`,
      )
    }

    this.name = options.name
    this.upstreamUrl = options.upstreamUrl
    this.authConfig = options.auth
    this.sessionStore = options.sessionStore ?? new InMemorySessionStore()
    this.callbackBaseUrl = options.callbackBaseUrl

    this.definition = {
      name: options.name,
      steps: [],
      widgets: [],
    }
    this.appConfig = {
      label: options.label ?? options.name,
      upstreamUrl: options.upstreamUrl,
      authMode: options.auth.mode,
    }
  }

  /** Public callback URL for this proxy (oauth2 mode); `undefined` otherwise. */
  getCallbackUrl(): string | undefined {
    if (this.authConfig.mode !== "oauth2") return undefined
    return `${this.callbackBaseUrl!}/oauth/callback/${this.name}`
  }

  /**
   * Sync bootstrap: for oauth2 proxies this mounts the callback route,
   * registers the `_authenticate` tool, and installs the per-user tools/list
   * filter. For static modes it is a no-op.
   */
  registerTools(server: MCPServer): void {
    if (this.toolsRegistered) return
    this.toolsRegistered = true

    if (this.authConfig.mode === "oauth2") {
      this.mountOAuthInitiate(server)
      this.mountOAuthCallback(server)
      this.registerAuthenticateTool(server)
      this.installToolsListFilter(server)
    }
  }

  /**
   * Async bootstrap: for static-auth modes this connects to the upstream and
   * registers forwarded tools. For oauth2 it is a no-op. Idempotent.
   */
  async init(server: MCPServer): Promise<void> {
    if (this.authConfig.mode === "oauth2") return
    this.initPromise ??= this.initStaticClient(server)
    return this.initPromise
  }

  /**
   * Dispatch a tool call through the upstream session without going through
   * the public MCP RPC surface. Used by server-internal code (e.g. pipeline
   * steps) that needs to invoke an upstream tool typed-safely.
   *
   * `toolName` may be either the proxy-prefixed name (`"<proxy>_<tool>"`) or
   * the bare upstream name — the prefix is stripped automatically so callers
   * can use whatever is in their generated type map.
   *
   * For static-auth modes (`none`/`bearer`/`header`) the shared session is
   * used and `userId` is ignored. For `oauth2` a per-user session is looked
   * up in the SessionStore; `userId` is required, and this throws if the
   * user has no active upstream session (i.e. has not completed the
   * `<name>_authenticate` flow yet).
   */
  async callUpstream(toolName: string, args: unknown, userId?: string): Promise<unknown> {
    const prefix = `${this.name}_`
    const bareName = toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName

    if (this.authConfig.mode === "oauth2") {
      if (!userId) {
        throw new Error(
          `UpstreamProxyPlugin(${this.name}).callUpstream: userId is required for oauth2 mode`,
        )
      }
      const stored = await this.sessionStore.getSession(userId, this.name)
      const session = stored?.session as UpstreamSession | undefined
      if (!session) {
        throw new Error(
          `UpstreamProxyPlugin(${this.name}).callUpstream: no active session for user "${userId}". User must complete ${this.name}_authenticate first.`,
        )
      }
      return session.callTool(bareName, args)
    }

    if (!this.staticSession) {
      throw new Error(
        `UpstreamProxyPlugin(${this.name}).callUpstream: static session not initialised. Call init(server) before dispatching.`,
      )
    }
    return this.staticSession.callTool(bareName, args)
  }

  /**
   * Read an MCP resource from the upstream, returning the text payload of
   * the first text-shaped content block. Used by the framework's
   * `read-widget-bundle` tool so the browser-side widget loader can pull
   * widget JS over the same transport (and authentication) as regular tool
   * calls. Binary blobs are rejected — widget bundles are always ES
   * modules, so a `blob` content is a protocol mismatch, not a valid
   * alternative.
   */
  async readUpstreamResourceText(uri: string, userId?: string): Promise<string> {
    let session: UpstreamSession | undefined
    if (this.authConfig.mode === "oauth2") {
      if (!userId) {
        throw new Error(
          `UpstreamProxyPlugin(${this.name}).readUpstreamResourceText: userId is required for oauth2 mode`,
        )
      }
      const stored = await this.sessionStore.getSession(userId, this.name)
      session = stored?.session as UpstreamSession | undefined
      if (!session) {
        throw new Error(
          `UpstreamProxyPlugin(${this.name}).readUpstreamResourceText: no active session for user "${userId}".`,
        )
      }
    } else {
      if (!this.staticSession) {
        throw new Error(
          `UpstreamProxyPlugin(${this.name}).readUpstreamResourceText: static session not initialised.`,
        )
      }
      session = this.staticSession
    }

    const result = await session.readResource(uri)
    const textBlock = result.contents.find(
      (c): c is { uri: string; text: string; mimeType?: string } => "text" in c,
    )
    if (!textBlock) {
      throw new Error(
        `UpstreamProxyPlugin(${this.name}): resource "${uri}" has no text content — widget bundles must be served as text/javascript.`,
      )
    }
    return textBlock.text
  }

  // --- Static-auth init -----------------------------------------------------

  private async initStaticClient(server: MCPServer): Promise<void> {
    // mcp-use's `mcpServers` entry accepts `{ url, authToken?, headers? }`
    // (plus other fields we don't use here). Typed loosely because the
    // underlying `HttpServerConfig` isn't publicly re-exported.
    const serverConfig: Record<string, unknown> = { url: this.upstreamUrl }
    if (this.authConfig.mode === "bearer") {
      serverConfig.authToken = this.authConfig.token
    } else if (this.authConfig.mode === "header") {
      serverConfig.headers = { [this.authConfig.headerName]: this.authConfig.value }
    }

    const client = new MCPClient({
      mcpServers: { [this.name]: serverConfig },
    })
    const session = (await client.createSession(this.name)) as unknown as UpstreamSession
    this.staticClient = client
    this.staticSession = session

    const tools = await session.listTools()
    for (const tool of tools) {
      this.registerForwardedTool(server, tool, {
        resolveSession: () => Promise.resolve(this.staticSession),
      })
    }
  }

  // --- OAuth2 wiring --------------------------------------------------------

  private mountOAuthInitiate(server: MCPServer): void {
    const app = (server as unknown as { app: HonoLike }).app
    app.get(`/oauth/initiate/${this.name}`, async (c: HonoContext): Promise<HonoResponse> => {
      const state = c.req.query("state")
      if (!state) return c.text("Missing state", 400)
      const pending = await this.sessionStore.getPending(state)
      if (!pending || pending.serverName !== this.name) {
        return c.text("Unknown or expired OAuth state", 400)
      }
      c.header(
        "Set-Cookie",
        `oauth_nonce=${pending.nonce}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/`,
      )
      return c.redirect(pending.authorizationUrl, 302)
    })
  }

  private mountOAuthCallback(server: MCPServer): void {
    // `server.app` is the underlying Hono app on mcp-use.
    const app = (server as unknown as { app: HonoLike }).app
    app.get(`/oauth/callback/${this.name}`, async (c: HonoContext): Promise<HonoResponse> => {
      const code = c.req.query("code")
      const state = c.req.query("state")
      if (!code || !state) {
        return c.text("Missing code or state parameter", 400)
      }
      const pending = await this.sessionStore.getPending(state)
      if (!pending || pending.serverName !== this.name) {
        return c.text("Unknown or expired OAuth state", 400)
      }

      const cookieNonce = parseNonceCookie(c.req.header("cookie") ?? "")
      if (!cookieNonce || cookieNonce !== pending.nonce) {
        return c.text("Nonce mismatch — possible callback hijack attempt", 403)
      }

      try {
        const result = await auth(pending.provider, {
          serverUrl: this.upstreamUrl,
          authorizationCode: code,
        })
        if (result !== "AUTHORIZED") {
          return c.text("Token exchange failed", 500)
        }

        await this.createUpstreamSession(server, pending.userId, pending.provider)
        await this.notifyToolsListChanged(server, pending.inboundSessionId)
        await this.sessionStore.deletePending(state)

        return c.html(
          "<html><body><h1>Authentication successful</h1><p>You can close this window and continue in your MCP client.</p></body></html>",
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return c.text(`OAuth error: ${message}`, 500)
      }
    })
  }

  private registerAuthenticateTool(server: MCPServer): void {
    const callbackUrl = this.getCallbackUrl()!
    const clientName =
      (this.authConfig.mode === "oauth2" && this.authConfig.clientName) || this.name
    const toolName = `${this.name}_authenticate`

    server.tool(
      {
        name: toolName,
        description:
          `Start OAuth authentication with ${clientName}. Returns a URL the user must open ` +
          `in their browser. After completing the browser login the proxy automatically wires ` +
          `up the upstream tools and pushes a tools/list_changed notification.`,
      },
      async (_params, ctx) => {
        const typedCtx = ctx as ToolContext
        const userId = typedCtx.auth?.user?.userId
        const inboundSessionId = typedCtx.session?.sessionId
        if (!userId) {
          return toolError("Not authenticated with the proxy server.")
        }

        if (await this.sessionStore.hasSession(userId, this.name)) {
          return toolText(`Already authenticated with ${this.name}.`)
        }

        const provider = new ServerSideOAuthProvider({ callbackUrl, clientName })
        const result = await auth(provider, { serverUrl: this.upstreamUrl })

        if (result === "AUTHORIZED") {
          await this.createUpstreamSession(server, userId, provider)
          if (inboundSessionId) await this.notifyToolsListChanged(server, inboundSessionId)
          return toolText(`Authenticated with ${this.name} (no redirect needed).`)
        }

        const authUrl = provider.authorizationUrl
        if (!authUrl) {
          return toolError(`Failed to generate authorization URL for ${this.name}.`)
        }

        const sdkState = authUrl.searchParams.get("state") ?? randomUUID()
        const nonce = randomUUID()
        await this.sessionStore.setPending(sdkState, {
          userId,
          serverName: this.name,
          provider,
          inboundSessionId: inboundSessionId ?? "",
          expiresAt: Date.now() + 10 * 60 * 1000,
          nonce,
          authorizationUrl: authUrl.toString(),
        })

        const initiateUrl = new URL(this.callbackBaseUrl!)
        initiateUrl.pathname = `/oauth/initiate/${this.name}`
        initiateUrl.searchParams.set("state", sdkState)

        return toolText(
          `Please open this URL to authenticate with ${this.name}:\n\n${initiateUrl.toString()}`,
        )
      },
    )
  }

  private installToolsListFilter(server: MCPServer): void {
    const typed = server as unknown as ServerWithMiddleware
    typed.use("mcp:*", async (ctx, next): Promise<unknown> => {
      const result: unknown = await next()
      if (ctx.method !== "tools/list" || !Array.isArray(result)) return result
      const tools = result as Array<{ name: string }>
      const userId = ctx.auth?.user?.userId
      if (!userId) return tools
      const filtered: Array<{ name: string }> = []
      for (const tool of tools) {
        if (!tool.name.startsWith(`${this.name}_`)) {
          filtered.push(tool)
          continue
        }
        if (tool.name === `${this.name}_authenticate`) {
          filtered.push(tool)
          continue
        }
        if (await this.sessionStore.hasSession(userId, this.name)) {
          filtered.push(tool)
        }
      }
      return filtered
    })
  }

  private async createUpstreamSession(
    server: MCPServer,
    userId: string,
    provider: ServerSideOAuthProvider,
  ): Promise<void> {
    const client = new MCPClient({
      mcpServers: {
        [this.name]: { url: this.upstreamUrl, authProvider: provider },
      },
    })
    const session = (await client.createSession(this.name)) as unknown as UpstreamSession
    await this.sessionStore.setSession(userId, this.name, { client, session })

    const tools = await session.listTools()
    for (const tool of tools) {
      this.registerForwardedTool(server, tool, {
        resolveSession: async (ctx) => {
          const callerUserId = (ctx as ToolContext).auth?.user?.userId
          if (!callerUserId) return undefined
          const stored = await this.sessionStore.getSession(callerUserId, this.name)
          return stored?.session as UpstreamSession | undefined
        },
      })
    }
  }

  // --- Tool registration (shared static + oauth2) ---------------------------

  private registerForwardedTool(
    server: MCPServer,
    tool: UpstreamTool,
    opts: {
      resolveSession: (ctx: unknown) => Promise<UpstreamSession | undefined>
    },
  ): void {
    const proxyToolName = `${this.name}_${tool.name}`
    if (this.registeredTools.has(proxyToolName)) return
    this.registeredTools.add(proxyToolName)

    const toolDef: Parameters<MCPServer["tool"]>[0] = {
      name: proxyToolName,
      description: tool.description ?? `[${this.name}] ${tool.name}`,
    }
    if (tool.inputSchema) {
      ;(toolDef as { schema?: unknown }).schema = jsonSchemaToZod(tool.inputSchema)
    }

    type ToolCallback = NonNullable<Parameters<MCPServer["tool"]>[1]>
    type ToolResult = Awaited<ReturnType<ToolCallback>>
    const handler: ToolCallback = async (params, ctx) => {
      const session = await opts.resolveSession(ctx)
      if (!session) {
        return toolError(
          `Not authenticated with ${this.name}. Please call ${this.name}_authenticate first.`,
        ) as unknown as ToolResult
      }
      try {
        return (await session.callTool(tool.name, params)) as ToolResult
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return toolError(`Error calling ${tool.name}: ${message}`) as unknown as ToolResult
      }
    }
    server.tool(toolDef, handler)
  }

  private async notifyToolsListChanged(server: MCPServer, sessionId: string): Promise<void> {
    try {
      if (sessionId) {
        const delivered = await server.sendNotificationToSession(
          sessionId,
          "notifications/tools/list_changed",
        )
        if (delivered) return
      }
      await server.sendToolsListChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[UpstreamProxyPlugin(${this.name})] notifyToolsListChanged failed: ${message}`)
    }
  }
}

// --- Lightweight structural types for Hono & mcp-use internals -------------

interface HonoLike {
  get(path: string, handler: (c: HonoContext) => Promise<HonoResponse> | HonoResponse): void
}

interface HonoContext {
  req: {
    query(key: string): string | undefined
    param(key: string): string
    header(key: string): string | undefined
  }
  text(body: string, status?: number): HonoResponse
  html(body: string): HonoResponse
  header(key: string, value: string): void
  redirect(url: string, status?: number): HonoResponse
}

interface HonoResponse {
  readonly __honoResponse: true
}

// --- Tool-response helpers (match mcp-use `text`/`error` shape) ------------

function toolText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true }
}

/** Exported for testing. Extracts the `oauth_nonce` value from a raw Cookie header string. */
export function parseNonceCookie(cookieHeader: string): string | undefined {
  return cookieHeader
    .split(";")
    .map((p) => p.trim().split("="))
    .find(([k]) => k === "oauth_nonce")?.[1]
}
