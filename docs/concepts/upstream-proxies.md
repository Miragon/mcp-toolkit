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

## Upstream-hosted modules

A proxy can opt into _module discovery_ by setting
`upstreamModules: true` in its config entry. At boot the host calls
`get-module-manifest` on the upstream — if present, the returned
`ModuleManifest` (see `packages/proxy-contract/src/module-manifest.ts`)
declares declarative pipeline steps and widgets (bundle URIs or
`hostWidget` aliases onto host-bundled widgets). The host compiles those
into a synthetic `AppPlugin` and registers it alongside user-supplied
plugins; no consumer-side plugin file needed.

Discovery is fail-soft throughout — a bad upstream skips that module
(with a logged warning) and never bricks the boot. The gates, in order:

1. **Schema version** — manifests declaring a `schemaVersion` newer than
   the host understands are skipped (probed before the full parse, so
   future required fields don't surface as a confusing parse error). The
   contract is at v2; a v2 host accepts both v1 and v2 manifests.
2. **Validation** — Zod parse + namespace/duplicate checks; v2-only
   features (`hostWidget`, runtime extras) require `schemaVersion: 2`.
3. **Runtime requirements** — every range in the manifest's `runtime`
   block is checked against what the host actually exposes: the React
   major always, plus any declared extras (`mcpUseReact` / `toolkitUi` /
   `reactQuery`) against `createFrameworkApp`'s `hostRuntime` option. An
   extra the host doesn't declare is a mismatch.
4. **Host-alias targets** — after first-party plugins load, any module
   whose `hostWidget` reference doesn't resolve to a registered
   host-bundled widget is dropped.

Declarative steps are thin wrappers: each one names an upstream tool +
`inputMapping` + `outputMapping` and is executed by
`buildStepFromDeclaration` via the same `callTool` that `proxyBinding`
injects for hand-written steps. Widget bundles advertised in the
manifest are fetched lazily at render time by the browser-side
`widgetLoader` through the framework tool `read-widget-bundle`,
evaluated via a Blob URL + dynamic `import()`, and mounted next to
host-bundled widgets. See
[widgets — upstream-hosted widgets](widgets.md#upstream-hosted-widgets).

Runnable example:
[`examples/customers-upstream/`](../../examples/customers-upstream/).

## Reference

- Proxy runtime → `packages/core/src/proxy/UpstreamProxyPlugin.ts`
- Session store → `packages/core/src/proxy/SessionStore.ts`
- OAuth provider → `packages/core/src/proxy/ServerSideOAuthProvider.ts`
- Config contract → `packages/proxy-contract/src/index.ts`
