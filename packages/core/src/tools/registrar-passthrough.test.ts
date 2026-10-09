import { MCPServer, type ToolRef } from "mcp-use"
import { oauthCustomProvider } from "mcp-use/oauth"
import { describe, expect, expectTypeOf, it } from "vitest"
import { z } from "zod"
import { createRestTool } from "../rest/tool.js"
import type { RestClient } from "../rest/types.js"
import { createToolRegistrar, type ToolConfig } from "./register-tool.js"
import { createWidgetToolRegistrar, type WidgetToolConfig } from "./register-widget-tool.js"
import type { ToolDefinitionPassthrough, ToolHandlerContext } from "./registrar-shared.js"

/**
 * The registrars as a thin superset of mcp-use's `ToolDefinition` (#175),
 * pinned against REAL `MCPServer`s through their own fetch boundary — the
 * per-call ctx, the definition passthrough (incl. `securitySchemes`, which
 * only mcp-use's OAuth gate can prove enforced), `strictInput`, the returned
 * `ToolRef`, and the existing-consumer shapes that must keep compiling and
 * behaving unchanged in 2.x.
 */

const ENDPOINT = "http://localhost/mcp"

interface RpcResponse {
  status: number
  challenge: string | null
  result?: Record<string, unknown>
}

interface CallResult {
  isError?: boolean
  content?: { type: string; text?: string }[]
  structuredContent?: Record<string, unknown>
}

interface ListedTool {
  name: string
  title?: string
  inputSchema?: Record<string, unknown>
  securitySchemes?: unknown
  _meta?: Record<string, unknown>
}

interface FetchHandler {
  fetch: (request: Request) => Promise<Response>
}

function rpcRequest(
  method: string,
  params?: Record<string, unknown>,
  init: { token?: string; signal?: AbortSignal } = {},
): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    signal: init.signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  })
}

async function rpc(
  server: FetchHandler,
  method: string,
  params?: Record<string, unknown>,
  init: { token?: string } = {},
): Promise<RpcResponse> {
  const response = await server.fetch(rpcRequest(method, params, init))
  const body = await response.text()
  if (!response.ok) {
    return { status: response.status, challenge: response.headers.get("www-authenticate") }
  }
  // Streamable HTTP answers as SSE; the JSON-RPC payload is the `data:` line.
  const line = body.split("\n").find((l) => l.startsWith("data: "))
  const payload = JSON.parse(line ? line.slice(6) : body) as { result?: Record<string, unknown> }
  return { status: response.status, challenge: null, result: payload.result }
}

async function listTools(server: FetchHandler): Promise<ListedTool[]> {
  const { result } = await rpc(server, "tools/list")
  return (result?.tools ?? []) as ListedTool[]
}

async function findTool(server: FetchHandler, name: string): Promise<ListedTool> {
  const tool = (await listTools(server)).find((t) => t.name === name)
  if (!tool) throw new Error(`tool ${name} is not listed`)
  return tool
}

async function callTool(
  server: FetchHandler,
  name: string,
  args: Record<string, unknown>,
  init: { token?: string } = {},
): Promise<{ status: number; challenge: string | null; result: CallResult }> {
  const response = await rpc(server, "tools/call", { name, arguments: args }, init)
  return { ...response, result: response.result ?? {} }
}

function text(result: CallResult): string {
  return (result.content ?? []).map((block) => block.text ?? "").join("\n")
}

function plainServer(): MCPServer {
  return new MCPServer({ name: "registrar-passthrough", version: "0.0.0" })
}

interface TestUser {
  id: string
}

/**
 * An OAuth server whose verifier accepts every token: the token string is
 * the client id, and only tokens starting with `writer` carry the
 * `orders:write` scope. `mixedAuth` lets signed-out callers list tools and
 * reach `noauth` tools — the only setup in which mcp-use enforces per-tool
 * `securitySchemes` at all.
 */
function oauthServer(): MCPServer<TestUser> {
  const oauth = oauthCustomProvider<TestUser>({
    resource: ENDPOINT,
    createTokenVerifier: (resource) => ({
      verifyAccessToken: (token: string) =>
        Promise.resolve({
          token,
          clientId: token,
          scopes: token.startsWith("writer") ? ["orders:write"] : [],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          resource,
        }),
    }),
    oauthMetadata: {
      issuer: "https://issuer.example",
      authorization_endpoint: "https://issuer.example/authorize",
      token_endpoint: "https://issuer.example/token",
      response_types_supported: ["code"],
    },
    mapAuthInfo: (info) => ({ user: { id: info.clientId }, payload: {}, permissions: [] }),
  })
  return new MCPServer<TestUser>({
    name: "registrar-oauth",
    version: "0.0.0",
    oauth,
    mixedAuth: true,
  })
}

/** Resolves to `"timeout"` instead of hanging the suite when an event never fires. */
function within<T>(promise: Promise<T>, ms = 2000): Promise<T | "timeout"> {
  return Promise.race([
    promise,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ])
}

/**
 * A handler that parks until its `ctx.signal` aborts. Without a ctx (the
 * pre-#175 registrars called handlers as `(client, args)`) it reports
 * `false` immediately instead of parking, so the guard fails fast.
 */
function cancellationProbe() {
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => (markStarted = resolve))
  let markAborted!: (aborted: boolean) => void
  const aborted = new Promise<boolean>((resolve) => (markAborted = resolve))
  const handler = (ctx: ToolHandlerContext | undefined): Promise<never> => {
    markStarted()
    const signal = ctx?.signal
    if (!signal) {
      markAborted(false)
      return Promise.reject(new Error("handler received no ctx.signal"))
    }
    return new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          markAborted(signal.aborted)
          reject(new Error("cancelled"))
        },
        { once: true },
      )
    })
  }
  return { started, aborted, handler }
}

/** Starts a `tools/call`, waits until the handler runs, then drops the request. */
async function cancelMidCall(
  server: FetchHandler,
  name: string,
  probe: ReturnType<typeof cancellationProbe>,
): Promise<void> {
  const controller = new AbortController()
  const pending = server.fetch(
    rpcRequest("tools/call", { name, arguments: {} }, { signal: controller.signal }),
  )
  pending.catch(() => undefined)
  expect(await within(probe.started)).toBeUndefined()
  controller.abort()
}

describe("registrar handlers receive mcp-use's per-call ctx", () => {
  it("createToolRegistrar: ctx.signal aborts when the client cancels the call", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    const probe = cancellationProbe()
    register({
      name: "slow_read",
      description: "Parks until the client cancels.",
      handler: (_client, _args, ctx) => probe.handler(ctx),
    })

    await cancelMidCall(server, "slow_read", probe)

    expect(await within(probe.aborted)).toBe(true)
  })

  it("createWidgetToolRegistrar: ctx.signal aborts when the client cancels the call", async () => {
    const server = plainServer()
    const register = createWidgetToolRegistrar(server, {})
    const probe = cancellationProbe()
    register({
      name: "slow_feed",
      description: "Parks until the client cancels.",
      handler: (_client, _args, ctx) => probe.handler(ctx),
    })

    await cancelMidCall(server, "slow_feed", probe)

    expect(await within(probe.aborted)).toBe(true)
  })

  it("passes the whole ctx — client capabilities, progress and logging reach the handler", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "inspect_ctx",
      description: "Reports which ctx members it received.",
      handler: (_client, _args, ctx) =>
        Promise.resolve({
          signal: ctx?.signal instanceof AbortSignal,
          clientCan: typeof ctx?.client.can,
          reportProgress: typeof ctx?.reportProgress,
          sendLog: typeof ctx?.sendLog,
        }),
    })

    const { result } = await callTool(server, "inspect_ctx", {})

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toEqual({
      signal: true,
      clientCan: "function",
      reportProgress: "function",
      sendLog: "function",
    })
  })
})

describe("definition passthrough", () => {
  it("forwards title, _meta and visibility from `definition` onto tools/list", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "described_tool",
      description: "A tool with the extra ToolDefinition fields.",
      definition: {
        title: "Described Tool",
        _meta: { "acme/owner": "team-a" },
        visibility: "app",
      },
      handler: () => Promise.resolve({ ok: true }),
    })

    const listed = await findTool(server, "described_tool")

    expect(listed.title).toBe("Described Tool")
    expect(listed._meta?.["acme/owner"]).toBe("team-a")
    // mcp-use derives the ui namespace from the first-class field.
    expect(listed._meta?.ui).toMatchObject({ visibility: ["app"] })
  })

  it("keeps the registrar-owned keys authoritative over the passthrough", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    // The type forbids owned keys; a cast must still not let them win.
    const definition = {
      name: "hijacked",
      description: "hijacked",
    } as unknown as ToolDefinitionPassthrough
    register({
      name: "owned_tool",
      description: "The registrar's description.",
      definition,
      handler: () => Promise.resolve({ ok: true }),
    })

    const names = (await listTools(server)).map((t) => t.name)

    expect(names).toEqual(["owned_tool"])
  })

  it("securitySchemes set via the registrars are advertised and enforced by mcp-use", async () => {
    const server = oauthServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "write_order",
      description: "Needs the orders:write scope.",
      definition: { securitySchemes: [{ type: "oauth2", scopes: ["orders:write"] }] },
      handler: (_client, _args, ctx) => Promise.resolve({ by: ctx?.auth?.user.id ?? null }),
    })
    const registerWidget = createWidgetToolRegistrar(server, {})
    registerWidget({
      name: "public_feed",
      description: "Callable signed out.",
      definition: { securitySchemes: [{ type: "noauth" }] },
      handler: (_client, _args, ctx) =>
        Promise.resolve({ text: "ok", structuredContent: { signedIn: ctx?.auth !== undefined } }),
    })

    expect((await findTool(server, "write_order")).securitySchemes).toEqual([
      { type: "oauth2", scopes: ["orders:write"] },
    ])
    expect((await findTool(server, "public_feed")).securitySchemes).toEqual([{ type: "noauth" }])

    const anonymous = await callTool(server, "write_order", {})
    expect(anonymous.status).toBe(401)

    const reader = await callTool(server, "write_order", {}, { token: "reader-1" })
    expect(reader.status).toBe(403)
    expect(reader.challenge).toContain("insufficient_scope")

    const writer = await callTool(server, "write_order", {}, { token: "writer-1" })
    expect(writer.status).toBe(200)
    expect(writer.result.structuredContent).toEqual({ by: "writer-1" })

    const open = await callTool(server, "public_feed", {})
    expect(open.status).toBe(200)
    expect(open.result.structuredContent).toEqual({ signedIn: false })
  })
})

describe("strictInput", () => {
  it("default (non-strict) input keeps stripping unknown keys silently — 2.x behaviour", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    const seen: unknown[] = []
    register({
      name: "loose_search",
      description: "Non-strict input.",
      inputSchema: { query: z.string().describe("Search text.") },
      handler: (_client, args) => {
        seen.push(args)
        return Promise.resolve({ ok: true })
      },
    })

    const { result } = await callTool(server, "loose_search", { query: "a", extra: 1 })

    expect(result.isError).toBeUndefined()
    expect(seen).toEqual([{ query: "a" }])
    expect((await findTool(server, "loose_search")).inputSchema).not.toHaveProperty(
      "additionalProperties",
    )
  })

  it("rejects an unknown key with a tool error naming the valid keys", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    let calls = 0
    register({
      name: "strict_search",
      description: "Strict input.",
      strictInput: true,
      inputSchema: {
        query: z.string().describe("Search text."),
        limit: z.number().optional().describe("Max rows."),
      },
      handler: () => {
        calls++
        return Promise.resolve({ ok: true })
      },
    })

    const listed = await findTool(server, "strict_search")
    expect(listed.inputSchema).toMatchObject({ additionalProperties: false })

    const { result } = await callTool(server, "strict_search", { query: "a", qury: "typo" })

    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Unknown key "qury"')
    expect(text(result)).toContain('Valid keys: "query", "limit"')
    expect(calls).toBe(0)

    const ok = await callTool(server, "strict_search", { query: "a" })
    expect(ok.result.isError).toBeUndefined()
    expect(calls).toBe(1)
  })

  it("applies the registrar-level default, and a per-tool flag overrides it", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {}, { strictInput: true })
    const ok = () => Promise.resolve({ ok: true })
    register({
      name: "inherits_strict",
      description: "",
      inputSchema: { a: z.string() },
      handler: ok,
    })
    register({
      name: "opts_out",
      description: "",
      strictInput: false,
      inputSchema: { a: z.string() },
      handler: ok,
    })

    const strict = await callTool(server, "inherits_strict", { a: "x", b: 1 })
    const loose = await callTool(server, "opts_out", { a: "x", b: 1 })

    expect(strict.result.isError).toBe(true)
    expect(text(strict.result)).toContain('Unknown key "b"')
    expect(loose.result.isError).toBeUndefined()
  })

  it("a strict tool without an inputSchema accepts no arguments at all", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    register({
      name: "strict_noargs",
      description: "",
      strictInput: true,
      handler: () => Promise.resolve({ ok: true }),
    })

    const { result } = await callTool(server, "strict_noargs", { stray: true })

    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Unknown key "stray"')
    expect(text(result)).toContain("This tool takes no arguments")
  })

  it("honours the per-tool flag on createWidgetToolRegistrar", async () => {
    const server = plainServer()
    const register = createWidgetToolRegistrar(server, {})
    const feed = () => Promise.resolve({ text: "ok", structuredContent: {} })
    register({
      name: "strict_widget",
      description: "",
      strictInput: true,
      inputSchema: { page: z.number().describe("Page index.") },
      handler: feed,
    })
    register({
      name: "loose_widget",
      description: "",
      inputSchema: { page: z.number().describe("Page index.") },
      handler: feed,
    })

    const strict = await callTool(server, "strict_widget", { page: 0, extra: true })
    const loose = await callTool(server, "loose_widget", { page: 0, extra: true })

    expect(strict.result.isError).toBe(true)
    expect(text(strict.result)).toContain('Unknown key "extra"')
    expect(loose.result.isError).toBeUndefined()
  })

  it("works the same on createWidgetToolRegistrar", async () => {
    const server = plainServer()
    const register = createWidgetToolRegistrar(server, {}, undefined, { strictInput: true })
    register({
      name: "strict_feed",
      description: "",
      inputSchema: { page: z.number().describe("Page index.") },
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })

    const { result } = await callTool(server, "strict_feed", { page: 0, pageSize: 10 })

    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Unknown key "pageSize"')
    expect(text(result)).toContain('Valid keys: "page"')
  })
})

describe("register() returns mcp-use's ToolRef", () => {
  it("returns the ToolRef at runtime from both registrars", () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {})
    const registerWidget = createWidgetToolRegistrar(server, {})

    const ref: unknown = register({
      name: "plain_ref",
      description: "",
      handler: () => Promise.resolve(null),
    })
    const widgetRef: unknown = registerWidget({
      name: "widget_ref",
      description: "",
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })

    expect(ref).toEqual({ name: "plain_ref" })
    expect(widgetRef).toEqual({ name: "widget_ref" })
  })

  it("types the ToolRef (name, input, output) with `toolRefs: true`", () => {
    const server = plainServer()
    const register = createToolRegistrar(server, {}, { toolRefs: true })
    const registerWidget = createWidgetToolRegistrar(server, {}, undefined, { toolRefs: true })

    const listRef = register({
      name: "list_things",
      description: "",
      inputSchema: { q: z.string().optional().describe("Filter.") },
      outputSchema: z.array(z.object({ id: z.string() })),
      handler: () => Promise.resolve([]),
    })
    const getRef = register({
      name: "get_thing",
      description: "",
      inputSchema: { id: z.string().describe("Id.") },
      outputSchema: z.object({ id: z.string() }),
      handler: (_client, args) => Promise.resolve({ id: args.id }),
    })
    const textRef = register({
      name: "text_only",
      description: "",
      handler: () => Promise.resolve("done"),
    })
    const feedRef = registerWidget({
      name: "things_feed",
      description: "",
      inputSchema: { page: z.number().describe("Page.") },
      handler: () => Promise.resolve({ text: "ok", structuredContent: {} }),
    })

    expect([listRef.name, getRef.name, textRef.name, feedRef.name]).toEqual([
      "list_things",
      "get_thing",
      "text_only",
      "things_feed",
    ])
    expectTypeOf(listRef).toEqualTypeOf<
      ToolRef<"list_things", { q?: string | undefined }, { data: { id: string }[] }>
    >()
    expectTypeOf(getRef).toEqualTypeOf<ToolRef<"get_thing", { id: string }, { id: string }>>()
    // No outputSchema → `never`, mirroring mcp-use's own InferToolOutput.
    expectTypeOf(textRef).toEqualTypeOf<ToolRef<"text_only", Record<string, unknown>, never>>()
    // Widget tools always return a structuredContent record.
    expectTypeOf(feedRef).toEqualTypeOf<
      ToolRef<"things_feed", { page: number }, Record<string, unknown>>
    >()
  })
})

// ── Existing-consumer compatibility (the 2.x additive contract) ──────────────

interface FakeClient {
  greet: (name: string) => string
}

const fakeClient: FakeClient = { greet: (name) => `hello ${name}` }

type Register = ReturnType<typeof createToolRegistrar<FakeClient>>
type WidgetRegister = ReturnType<typeof createWidgetToolRegistrar<FakeClient>>
type ZodShape = Record<string, z.ZodType>

/**
 * miragon-ai's toolset filter, verbatim in shape: a void-returning wrapper
 * typed as the registrar's own `ReturnType`. It must keep compiling, which is
 * why the registrars' default static return type stays `void`.
 */
function withFilter(register: Register, allow: (name: string) => boolean): Register {
  const filtered = <TShape extends ZodShape>(config: ToolConfig<FakeClient, TShape>) => {
    if (allow(config.name)) register(config)
  }
  return Object.assign(filtered, { getRegisteredTools: () => register.getRegisteredTools() })
}

function withWidgetFilter(register: WidgetRegister, allow: (name: string) => boolean) {
  const filtered: WidgetRegister = <TShape extends ZodShape>(
    config: WidgetToolConfig<FakeClient, TShape>,
  ) => {
    if (allow(config.name)) register(config)
  }
  return filtered
}

describe("existing consumers compile and behave unchanged", () => {
  it("runs old two-argument handlers through a real server", async () => {
    const server = plainServer()
    const register = createToolRegistrar(server, fakeClient)
    register({
      name: "greet",
      description: "",
      inputSchema: { name: z.string().describe("Who.") },
      outputSchema: z.object({ message: z.string() }),
      handler: (client, args) => Promise.resolve({ message: client.greet(args.name) }),
    })

    const { result } = await callTool(server, "greet", { name: "ada" })

    expect(result.structuredContent).toEqual({ message: "hello ada" })
  })

  it("keeps a void-returning registrar wrapper (toolset filter) working", async () => {
    const server = plainServer()
    const register = withFilter(createToolRegistrar(server, fakeClient), (n) => n !== "hidden")
    const registerWidget = withWidgetFilter(
      createWidgetToolRegistrar(server, fakeClient),
      (n) => n !== "hidden_feed",
    )
    const ok = () => Promise.resolve({ ok: true })
    const feed = () => Promise.resolve({ text: "ok", structuredContent: {} })
    register({ name: "visible", description: "", handler: ok })
    register({ name: "hidden", description: "", handler: ok })
    registerWidget({ name: "visible_feed", description: "", handler: feed })
    registerWidget({ name: "hidden_feed", description: "", handler: feed })

    const names = (await listTools(server)).map((t) => t.name).sort()

    expect(names).toEqual(["visible", "visible_feed"])
    expect(register.getRegisteredTools()).toEqual([{ name: "visible", category: undefined }])
  })

  it("keeps captured handlers callable with two arguments (handler-capture test stubs)", async () => {
    type Handler = ToolConfig<FakeClient>["handler"]
    const handlers = new Map<string, Handler>()
    const capture = Object.assign(
      (config: ToolConfig<FakeClient>) => {
        handlers.set(config.name, config.handler)
      },
      { getRegisteredTools: () => [] },
    )
    const registerModule = (register: Register) =>
      register({
        name: "greet",
        description: "",
        inputSchema: { name: z.string().describe("Who.") },
        handler: (client, args) => Promise.resolve(client.greet(args.name)),
      })
    registerModule(capture as unknown as Register)

    const greet = handlers.get("greet")
    if (!greet) throw new Error("greet was not captured")

    expect(await greet(fakeClient, { name: "bob" })).toBe("hello bob")
  })

  it("still registers createRestTool configs", async () => {
    const server = plainServer()
    const rest: RestClient = {
      baseUrl: "https://api.example",
      request: <T>() => Promise.resolve({ id: "o-1" } as T),
    }
    const register = createToolRegistrar(server, rest)
    register(
      createRestTool({
        name: "get_order",
        description: "Fetch an order.",
        method: "GET",
        path: "/orders/{orderId}",
        inputSchema: { orderId: z.string().describe("Order id.") },
      }),
    )

    const { result } = await callTool(server, "get_order", { orderId: "o-1" })

    expect(result.structuredContent).toEqual({ id: "o-1" })
  })
})
