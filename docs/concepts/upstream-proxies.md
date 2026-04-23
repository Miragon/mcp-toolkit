# Upstream proxies

An **upstream proxy** federates an external MCP server's tools under this
server's namespace. Tools appear in `tools/list` as `<proxy>_<tool>`; the
client sees them directly.

## Why

- The LLM can call upstream tools without extra tool-discovery steps.
- Pipeline steps can too — `buildProxyAppConfigs` injects a typed `callTool`
  closure for any plugin with a matching `proxyBinding`.
- One auth setup (bearer / header / oauth2) wraps many tools.

## Declaring a proxy

`MCP_PROXIES` is a JSON array parsed by `parseProxyConfigEnv`. Each entry:

```jsonc
{
  "name": "lexoffice",
  "label": "Lexoffice",
  "upstreamUrl": "https://lexoffice-mcp.example.com/mcp",
  "auth": { "mode": "bearer", "tokenEnvVar": "MCP_PROXY_LEXOFFICE_TOKEN" },
}
```

Auth modes (full schema: `packages/proxy-contract/src/index.ts`):

| Mode     | Fields                                              | Secret env                            |
| -------- | --------------------------------------------------- | ------------------------------------- |
| `none`   | —                                                   | —                                     |
| `bearer` | `tokenEnvVar`                                       | `MCP_PROXY_<NAME>_TOKEN` (convention) |
| `header` | `headerName`, `valueEnvVar`                         | `MCP_PROXY_<NAME>_VALUE`              |
| `oauth2` | `clientIdEnvVar?`, `clientSecretEnvVar?`, `scopes?` | (per-user, not a global secret)       |

The env-var names are **declared in the config**, not inferred — admin tooling
and the server agree via the config document, not a naming convention the
operator has to know. The `DEFAULT_PROXY_SECRET_PREFIX = "MCP_PROXY"` helper
(`proxySecretEnvVar`) is for tooling that wants to _generate_ a canonical
name; the config itself is source of truth.

## Lifecycle

`registerUpstreamProxies(server, { entries, callbackBaseUrl, secretResolver })`
runs a two-phase boot per entry:

1. **`registerTools(server)`** — synchronous. For oauth2, mounts the
   `/oauth/callback/<name>` route, registers the `<name>_authenticate` tool,
   and installs a tools/list filter that hides federated tools for users who
   haven't authenticated yet. For static modes, no-op.
2. **`init(server)`** — awaited in parallel. For static modes, connects to
   the upstream, lists tools, and registers `<name>_<tool>` forwarders on
   the host server. For oauth2, no-op (registration happens after each
   user's authenticate flow succeeds).

## oauth2 per-user flow

1. User calls `<name>_authenticate`.
2. Proxy creates a `ServerSideOAuthProvider`, runs `auth(provider, { serverUrl })`.
3. If the provider returns an authorization URL, proxy stores pending state
   keyed by the OAuth `state` param and returns the URL to the user.
4. User opens the URL in a browser, logs in, upstream IdP redirects to
   `<callbackBaseUrl>/oauth/callback/<name>?code=…&state=…`.
5. Mounted callback exchanges the code, stores `{ client, session }` in the
   `SessionStore` keyed by `(userId, name)`, registers the upstream's tools
   as forwarded tools on the host server, and pushes
   `notifications/tools/list_changed`.

Sessions are **in-memory by default** (`InMemorySessionStore`) — a server
restart requires every user to re-authenticate. Swap in a persistent store
by passing `sessionStore` to the `UpstreamProxyPlugin` constructor.

## Server-internal dispatch

`UpstreamProxyPlugin.callUpstream(toolName, args, userId?)`:

- Strips the `<proxy>_` prefix if present.
- For static modes — uses the shared session; `userId` ignored.
- For oauth2 — uses `sessionStore.getSession(userId, proxyName)`. Throws if
  the user has no session yet.

This is what `buildProxyAppConfigs` wraps to power typed `callTool` in steps
— see [typed-call-tool-in-steps](../guides/typed-call-tool-in-steps.md).

## Reference

- Proxy runtime → `packages/core/src/proxy/UpstreamProxyPlugin.ts`
- Session store → `packages/core/src/proxy/SessionStore.ts`
- OAuth provider → `packages/core/src/proxy/ServerSideOAuthProvider.ts`
- Config contract → `packages/proxy-contract/src/index.ts`
