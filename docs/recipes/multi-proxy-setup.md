# Recipe: multi-proxy setup

## Goal

Federate several external MCPs into a single Miranum-style server, mix
auth modes, and bind UI-only modules to specific proxies.

## Scenario

Three upstreams:

- **`items`** — internal mock, no auth.
- **`lexoffice`** — third-party SaaS, static bearer token.
- **`notion`** — per-user OAuth2.

Plus two UI-only modules — `lexoffice-ui`, `notion-ui` — and one full
module `internal`.

## Step 1 — `MCP_PROXIES`

```jsonc
[
  {
    "name": "items",
    "label": "Items Mock",
    "upstreamUrl": "http://items.svc.local/mcp",
    "auth": { "mode": "none" },
  },

  {
    "name": "lexoffice",
    "label": "Lexoffice",
    "upstreamUrl": "https://lex-mcp.example.com/mcp",
    "auth": { "mode": "bearer", "tokenEnvVar": "MCP_PROXY_LEXOFFICE_TOKEN" },
  },

  {
    "name": "notion",
    "label": "Notion",
    "upstreamUrl": "https://notion-mcp.example.com/mcp",
    "auth": { "mode": "oauth2", "scopes": ["read_content"] },
  },
]
```

`parseProxyConfigEnv` validates this at boot — duplicate names or
malformed URLs throw before the server starts.

## Step 2 — env

```sh
MCP_URL=https://miranum.example.com
MCP_PROXIES='…above…'
MCP_PROXY_LEXOFFICE_TOKEN=lex_live_…
WORKOS_SUBDOMAIN=acme
WORKOS_ORG_ID=org_…
```

`MCP_URL` doubles as `callbackBaseUrl` (Notion redirects to
`<MCP_URL>/oauth/callback/notion`).

## Step 3 — plugins

```ts
// server/src/plugins.ts
import { createPlugin as internal } from "../modules/internal/mcp/src/plugin.js"
import { createPlugin as lexofficeUi } from "../modules/lexoffice-ui/mcp/src/plugin.js"
import { createPlugin as notionUi } from "../modules/notion-ui/mcp/src/plugin.js"

export function createPlugins() {
  return [internal(), lexofficeUi(), notionUi()]
}
```

Each UI-only plugin declares its proxy:

```ts
// modules/lexoffice-ui/mcp/src/plugin.ts
export function createPlugin(): AppPlugin {
  return { definition, proxyBinding: "lexoffice" }
}
```

`buildProxyAppConfigs` matches `proxyBinding` against the federated
proxies and injects a typed `callTool` closure into each plugin's
`appConfig`.

## Step 4 — boot

```ts
await createFrameworkApp({
  name: "miranum",
  baseUrl: process.env.MCP_URL,
  oauth: oauthWorkOSProvider({ subdomain: process.env.WORKOS_SUBDOMAIN! }),
  plugins: createPlugins(),
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
  middleware: { orgGate: process.env.WORKOS_ORG_ID },
  app: {
    resourceUri: "ui://miranum/mcp-app.html",
    htmlPath: path.join(DIST_DIR, "mcp-app.html"),
  },
})
```

## Step 5 — `tools/list` after boot

For an unauthenticated session:

- Framework: `get-framework-manifest`, `render-view`, `refresh-view`
- Internal: `internal_*`
- Items (none auth): `items_echo`, `items_list-items`, `items_get-item`
- Lexoffice (bearer): `lexoffice_*`
- Notion (oauth2): only `notion_authenticate` until each user completes the flow

## Caveats

- **Per-proxy boot is sequential for sync registration, parallel for init.**
  `Promise.all(plugins.map(p => p.init(server)))` means a slow
  upstream doesn't block the others; but the sync `registerTools` step
  runs in array order. Crashes there abort boot.
- **Don't reuse a proxy name across consumers** — the name appears in
  every tool prefix and the oauth callback path; renaming requires
  re-registering OAuth apps with the upstream IdP.
- **Active modules subset:** if your env sets
  `MCP_ACTIVE_MODULES="internal,lexoffice-ui"`, the plugins module
  filters before passing to `createFrameworkApp`. The proxies list
  itself isn't filtered — you can still proxy upstreams without an
  associated UI module (the LLM may call them directly).

## See also

- [Upstream proxies concept](../concepts/upstream-proxies.md)
- [Registering upstream proxies](../guides/registering-upstream-proxies.md)
- [Adding an OAuth2 upstream](adding-an-oauth2-upstream.md)
