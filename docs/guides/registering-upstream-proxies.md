# Registering upstream proxies

An "upstream proxy" federates an external MCP's tools under this server's
namespace. The toolkit's `registerUpstreamProxies` helper mounts them with
the right two-phase boot; `createFrameworkApp` calls it automatically.

## The config document

A JSON array, typically stored in `MCP_PROXIES`:

```jsonc
[
  {
    "name": "articles",
    "label": "Articles",
    "upstreamUrl": "http://localhost:4000/mcp",
    "auth": { "mode": "none" },
  },
  {
    "name": "customers",
    "label": "Customers",
    "upstreamUrl": "http://localhost:4001/mcp",
    "auth": { "mode": "none" },
    "upstreamModules": true,
  },
  {
    "name": "lexoffice",
    "label": "Lexoffice",
    "upstreamUrl": "https://lexoffice-mcp.example.com/mcp",
    "auth": { "mode": "bearer", "tokenEnvVar": "MCP_PROXY_LEXOFFICE_TOKEN" },
  },
  {
    "name": "notion",
    "label": "Notion",
    "upstreamUrl": "https://notion-mcp.example.com/mcp",
    "auth": { "mode": "oauth2", "scopes": ["read"] },
  },
]
```

`upstreamModules: true` enables upstream-hosted module discovery for
that proxy — the host calls `get-module-manifest` at boot and compiles
the returned declarative steps + widgets into a synthetic plugin. See
[Upstream-hosted modules](../concepts/upstream-proxies.md#upstream-hosted-modules)
for details.

Parse it:

```ts
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"

const proxies = parseProxyConfigEnv(process.env.MCP_PROXIES)
```

Validation is strict (duplicate names, invalid URL, missing `envVar`, etc.);
bad input throws at boot.

## Secret resolution

`bearer` and `header` modes reference env var _names_ in the config — the
actual secrets are read from `process.env` by default. Swap in a managed
secret store:

```ts
await createFrameworkApp({
  ...,
  secretResolver: async (name) => vault.get(name),
})
```

Async resolvers are fine; the helper awaits each read during the sync boot
phase. oauth2 mode doesn't need a resolver — tokens come from the per-user
dance at runtime.

## What `createFrameworkApp` does for you

```ts
await createFrameworkApp({
  ...,
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
  secretResolver: /* optional */,
})
```

Internally calls `registerUpstreamProxies(server, { entries, callbackBaseUrl, secretResolver })`
which:

1. Constructs one `UpstreamProxyPlugin` per entry.
2. Calls `plugin.registerTools(server)` for each — sync, mounts oauth2 callback routes + auth tool.
3. `await Promise.all(plugins.map(p => p.init(server)))` — parallel init:
   static modes connect + federate tools now, oauth2 modes defer.

## Requiring `callbackBaseUrl`

Only required when at least one entry uses `auth.mode === "oauth2"`. The
helper throws otherwise:

```
registerUpstreamProxies: callbackBaseUrl is required when any entry uses oauth2.
```

Typically set to the server's own public URL (so redirects land on
`<callbackBaseUrl>/oauth/callback/<proxy>`).

## Manual wiring (no `createFrameworkApp`)

```ts
import { MCPServer } from "mcp-use/server"
import { registerUpstreamProxies } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"

const server = new MCPServer({ name: "my-mcp" })
const proxies = await registerUpstreamProxies(server, {
  entries: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
})
// `proxies` is the UpstreamProxyPlugin[] — feed into buildProxyAppConfigs
```

## Verifying

After boot:

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

Every static-auth upstream's tools appear prefixed
(`articles_get-article`, `articles_list-articles`, `customers_get-customer`, …).
oauth2 upstreams only show `<name>_authenticate` until a user completes it.

## See also

- [Upstream proxies concept](../concepts/upstream-proxies.md)
- [OAuth2 upstream recipe](../recipes/adding-an-oauth2-upstream.md)
- [Multi-proxy setup recipe](../recipes/multi-proxy-setup.md)
- Env var reference → [env-vars](../reference/env-vars.md)
