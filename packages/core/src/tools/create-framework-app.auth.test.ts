import net from "node:net"
import type { MCPServer } from "mcp-use"
import { oauthCustomProvider, type OAuthProvider } from "mcp-use/oauth"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { AppPlugin } from "../types/index.js"
import { createFrameworkApp, type CreateFrameworkAppOptionsBase } from "./create-framework-app.js"
import { textResult } from "./tool-results.js"

/**
 * Auth contract through a REAL mcp-use server: `createFrameworkApp` with a
 * fake OAuth provider, listening on loopback, driven over HTTP with bearer
 * tokens for several users.
 *
 * Every other auth test in this package hands a hand-built `ctx` to a
 * middleware or tool callback. Those doubles drifted from mcp-use 2 without
 * anyone noticing: middleware receives the SDK `AuthInfo` (provider-mapped
 * identity under `ctx.auth.extra.user`), tool callbacks receive the flattened
 * `ctx.auth.user`, and the built-in providers map the user as
 * `{ id, roles, organizationId }` — no `userId`, no `organization_id`. Only a
 * request through mcp-use itself produces those shapes, so only this suite
 * can tell whether the role filter, the org gate and the dashboard scoping
 * actually see the caller.
 */

/** The identity every built-in mcp-use provider maps: `id`, never `userId`. */
interface FakeUser {
  id?: string
  roles: string[]
  organizationId?: string
}

const USERS: Record<string, FakeUser> = {
  "token-alice": { id: "alice", roles: ["viewer"], organizationId: "org-1" },
  "token-bob": { id: "bob", roles: ["auditor"], organizationId: "org-1" },
  "token-mallory": { id: "mallory", roles: ["auditor"], organizationId: "org-2" },
  // A provider that verifies the token but maps no stable subject: the
  // server must not invent an owner (or fall back to global scope) for it.
  "token-nameless": { roles: [], organizationId: "org-1" },
}

function fakeOAuthProvider(): OAuthProvider<FakeUser> {
  return oauthCustomProvider<FakeUser>({
    oauthMetadata: {
      issuer: "https://auth.example.test",
      authorization_endpoint: "https://auth.example.test/authorize",
      token_endpoint: "https://auth.example.test/token",
      response_types_supported: ["code"],
    },
    createTokenVerifier: (resource) => ({
      verifyAccessToken: (token) => {
        if (!(token in USERS)) return Promise.reject(new Error("unknown token"))
        return Promise.resolve({
          token,
          clientId: "contract-test",
          scopes: [],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          resource,
        })
      },
    }),
    mapAuthInfo: (authInfo) => ({
      user: USERS[authInfo.token]!,
      payload: {},
      permissions: [],
    }),
  })
}

/**
 * A module with one tool in each of two modules (`alpha_*`, `beta_*`) for the
 * role filter, plus a pipeline step that reports which user its `callTool`
 * closure was bound to — the per-request identity render-view threads through.
 */
function probePlugin(): AppPlugin {
  return {
    definition: {
      name: "probe",
      steps: [
        {
          id: "probe:whoami",
          dataType: "probe:whoami",
          requires: [],
          produces: ["probe:userId"],
          execute: async (
            _context,
            appConfig: { callTool: (name: string, args: unknown) => Promise<unknown> },
          ) => {
            const userId = await appConfig.callTool("whoami", {})
            return {
              data: { userId },
              keys: { "probe:userId": userId },
              _app: "probe",
              _step: "whoami",
            }
          },
        },
      ],
      widgets: [],
    },
    appConfig: {
      callTool: (_name: string, _args: unknown, ctx?: { userId?: string }) =>
        Promise.resolve(ctx?.userId ?? null),
    },
    registerTools(server) {
      // Plugins are typed against an opaque server (the core barrel stays
      // mcp-use-free); the house pattern narrows it at the registration site.
      const mcp = server as MCPServer
      mcp.tool({ name: "alpha_ping", description: "Alpha module ping." }, () =>
        Promise.resolve(textResult("alpha")),
      )
      mcp.tool({ name: "beta_ping", description: "Beta module ping." }, () =>
        Promise.resolve(textResult("beta")),
      )
    },
  }
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

interface RpcResponse {
  status: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

interface Booted {
  rpc: (token: string | undefined, method: string, params?: unknown) => Promise<RpcResponse>
  close: () => Promise<void>
}

async function boot(overrides: Partial<CreateFrameworkAppOptionsBase>): Promise<Booted> {
  const server = await createFrameworkApp({
    name: "auth-contract",
    version: "0.0.0",
    host: "127.0.0.1",
    plugins: [probePlugin()],
    app: { bundle: { jsPath: "/nonexistent/mcp-app.js" } },
    ...overrides,
    oauth: fakeOAuthProvider(),
  })
  const port = await getFreePort()
  await server.listen(port)
  let id = 0
  return {
    async rpc(token, method, params) {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      })
      const body = await response.text()
      // Streamable HTTP answers as SSE; the JSON-RPC payload is the `data:` line.
      const line = body.split("\n").find((l) => l.startsWith("data: "))
      let payload: Omit<RpcResponse, "status"> = {}
      try {
        payload = JSON.parse(line ? line.slice(6) : body) as Omit<RpcResponse, "status">
      } catch {
        // A non-JSON body (the 401 challenge) carries only the status.
      }
      return { status: response.status, ...payload }
    },
    close: () => server.close(),
  }
}

async function toolNames(app: Booted, token: string): Promise<string[]> {
  const response = await app.rpc(token, "tools/list")
  expect(response.error).toBeUndefined()
  return ((response.result?.tools ?? []) as { name: string }[]).map((t) => t.name)
}

interface ToolCallOutcome {
  /** Set when the call was rejected before the handler (JSON-RPC error). */
  rpcError?: string
  isError: boolean
  text: string
  structuredContent?: Record<string, unknown>
}

async function callTool(
  app: Booted,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolCallOutcome> {
  const response = await app.rpc(token, "tools/call", { name, arguments: args })
  if (response.error) return { rpcError: response.error.message, isError: true, text: "" }
  const result = response.result as {
    isError?: boolean
    content?: { type: string; text?: string }[]
    structuredContent?: Record<string, unknown>
  }
  return {
    isError: result.isError === true,
    text: (result.content ?? []).map((c) => c.text ?? "").join("\n"),
    structuredContent: result.structuredContent,
  }
}

describe("auth contract — real MCPServer + fake OAuth provider", () => {
  describe("the bearer gate itself", () => {
    let app: Booted
    beforeAll(async () => {
      app = await boot({})
    })
    afterAll(() => app.close())

    it("rejects a request without a token (sanity: OAuth is really on)", async () => {
      const response = await app.rpc(undefined, "tools/list")
      expect(response.status).toBe(401)
    })
  })

  describe("role filter", () => {
    let app: Booted
    beforeAll(async () => {
      app = await boot({ middleware: { roleFilter: { viewer: ["alpha"] } } })
    })
    afterAll(() => app.close())

    it("hides the modules a restricted role cannot access from tools/list", async () => {
      const names = await toolNames(app, "token-alice")
      expect(names).toContain("alpha_ping")
      expect(names).not.toContain("beta_ping")
      // Framework tools carry no module prefix and always pass.
      expect(names).toContain("render-view")
    })

    it("leaves tools/list untouched for a caller with no restricted role", async () => {
      const names = await toolNames(app, "token-bob")
      expect(names).toEqual(expect.arrayContaining(["alpha_ping", "beta_ping"]))
    })

    it("blocks tools/call to a module the restricted role cannot access", async () => {
      const denied = await callTool(app, "token-alice", "beta_ping")
      expect(denied.isError).toBe(true)
      expect(`${denied.rpcError ?? ""}${denied.text}`).toMatch(/no access to module "beta"/)

      const allowed = await callTool(app, "token-alice", "alpha_ping")
      expect(allowed.isError).toBe(false)
      expect(allowed.text).toBe("alpha")
    })

    it("lets an unrestricted caller call every module", async () => {
      const result = await callTool(app, "token-bob", "beta_ping")
      expect(result.isError).toBe(false)
      expect(result.text).toBe("beta")
    })
  })

  describe("org gate", () => {
    let app: Booted
    beforeAll(async () => {
      app = await boot({ middleware: { orgGate: "org-1" } })
    })
    afterAll(() => app.close())

    it("admits a member of the configured organization (organizationId, camelCase)", async () => {
      const names = await toolNames(app, "token-alice")
      expect(names).toContain("alpha_ping")
      const result = await callTool(app, "token-alice", "alpha_ping")
      expect(result.isError).toBe(false)
    })

    it("rejects a member of another organization", async () => {
      const list = await app.rpc("token-mallory", "tools/list")
      expect(list.result?.tools).toBeUndefined()
      expect(JSON.stringify(list.error ?? list.result)).toMatch(/not a member of this organization/)

      const call = await callTool(app, "token-mallory", "alpha_ping")
      expect(call.isError).toBe(true)
      expect(`${call.rpcError ?? ""}${call.text}`).toMatch(/not a member of this organization/)
    })
  })

  describe("per-user identity in tool handlers", () => {
    let app: Booted
    beforeAll(async () => {
      app = await boot({ app: { bundle: { jsPath: "/nonexistent/mcp-app.js" }, builder: true } })
    })
    afterAll(() => app.close())

    const layout = { rows: [{ row: [{ widget: "probe:card" }] }] }

    it.each(["render-view", "refresh-view"])(
      "threads the caller id into %s's pipeline steps",
      async (tool) => {
        const result = await callTool(app, "token-alice", tool, {
          steps: [{ id: "who", step: "probe:whoami" }],
          layout,
        })
        expect(result.isError).toBe(false)
        const context = result.structuredContent?.context as { keys: Record<string, unknown> }
        expect(context.keys["probe:userId"]).toBe("alice")
      },
    )

    it("threads the caller id into the builder catalogue's pipeline run", async () => {
      const result = await callTool(app, "token-bob", "get-builder-catalogue", {
        steps: [{ id: "who", step: "probe:whoami" }],
      })
      expect(result.isError).toBe(false)
      const context = result.structuredContent?.context as { keys: Record<string, unknown> }
      expect(context.keys["probe:userId"]).toBe("bob")
    })
  })
})
