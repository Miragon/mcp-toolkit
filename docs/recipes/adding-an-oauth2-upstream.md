# Recipe: adding an OAuth2 upstream

## Goal

Federate an external MCP that requires per-user OAuth2 (e.g. Notion,
Atlassian, GitHub-style apps) into your Miranum-style MCP server. End
users authenticate once via the browser; their session is stored
per-user in the proxy's `SessionStore` and reused on subsequent calls.

## Pre-requisites

- The upstream MCP supports OAuth2 client registration (most modern MCPs do).
- Your server runs at a stable public base URL — local dev needs a tunnel
  (Cloudflare, ngrok, …) because the IdP must be able to reach the
  callback.

## Step 1 — extend the proxy config

Append an oauth2 entry to `MCP_PROXIES`:

```jsonc
[
  // …existing entries
  {
    "name": "notion",
    "label": "Notion",
    "upstreamUrl": "https://notion-mcp.example.com/mcp",
    "auth": { "mode": "oauth2", "scopes": ["read_content", "read_user"] },
  },
]
```

`scopes` is optional — present them only if the upstream needs explicit
scope requests; mcp-use's dynamic registration handles the rest.

## Step 2 — make sure `callbackBaseUrl` is set

In your `createFrameworkApp` call:

```ts
await createFrameworkApp({
  ...,
  baseUrl: process.env.MCP_URL,
  callbackBaseUrl: process.env.MCP_URL,   // required when any oauth2 entry exists
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
})
```

`registerUpstreamProxies` throws at boot if oauth2 is configured but
`callbackBaseUrl` is missing.

## Step 3 — verify the auth tool surfaces

After boot, `tools/list` shows `notion_authenticate` (no other notion
tools yet — the upstream's tools are deferred until each user authenticates).

```sh
curl -sX POST $MCP_URL/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

## Step 4 — user runs the auth flow

The LLM (or any client) calls:

```jsonc
{ "name": "notion_authenticate", "arguments": {} }
```

Result content includes a URL like
`https://notion.example.com/oauth/authorize?…&redirect_uri=https://your-mcp.example.com/oauth/callback/notion`.
The user opens it, grants access, and is redirected back. The proxy
finishes the flow, stores the per-user session in
`InMemorySessionStore` (default), and federates the upstream tools for
that user.

## Step 5 — subsequent tool calls just work

The user's authenticated `tools/list` now contains
`notion_search`, `notion_retrieve-page`, etc. Widgets and steps that
target these via `useNotionRetrievePage` / `callTool("notion_retrieve-page", …)`
work without further setup.

## Caveats

- **In-memory sessions:** `InMemorySessionStore` loses sessions on
  restart. Acceptable for early-stage products (users re-click); swap in
  a SQLite/Redis store before production. See
  [`proxy/SessionStore.ts`](../../packages/core/src/proxy/SessionStore.ts).
- **Codegen at build time can't run oauth2:** snapshot tools manually.
  Run the flow once in dev, copy the access token from the
  `InMemorySessionStore` (or DevTools network tab), drop it into
  `MCP_PROXY_NOTION_TOKEN`, and use `auth.mode: "bearer"` only in
  `codegen.config.ts`. The runtime config still uses oauth2.
- **Multi-tenant**: the proxy always keys sessions by `userId` taken
  from the inbound MCP request's `auth.user.userId` — no cross-user
  leakage by design.

## See also

- [Upstream proxies concept](../concepts/upstream-proxies.md)
- [Registering upstream proxies](../guides/registering-upstream-proxies.md)
- [Middleware and auth](../guides/middleware-and-auth.md)
