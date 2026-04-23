# Environment variables

The toolkit reads **no** env vars directly from its runtime code (core,
ui, proxy-contract). Every value is passed in by the consumer via options
objects — so in principle a consumer is free to name its env vars
whatever it wants.

This page documents the **names the toolkit recommends**, so that
consumer projects end up with a consistent surface.

## Consumer-supplied values

These are the options `createFrameworkApp` accepts and the env-var names
Miranum / stockholm-v1 use for them. Your consumer is free to pick
different names; the toolkit only sees the resolved string.

| Option                  | Suggested env var                         | Notes                                                                                          |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `name`                  | —                                         | Hard-coded.                                                                                    |
| `version`               | —                                         | Hard-coded.                                                                                    |
| `baseUrl`               | `MCP_URL`                                 | Public base URL; also used as `callbackBaseUrl` when oauth2 upstreams are present.             |
| `oauth`                 | `WORKOS_SUBDOMAIN`, `WORKOS_CLIENT_ID`, … | Whatever your OAuth provider factory needs.                                                    |
| `proxies`               | `MCP_PROXIES`                             | JSON array per `ProxyConfigSchema`. Parse with `parseProxyConfigEnv(process.env.MCP_PROXIES)`. |
| `callbackBaseUrl`       | `MCP_URL`                                 | Typically same as `baseUrl`.                                                                   |
| `middleware.orgGate`    | `WORKOS_ORG_ID`                           | Optional.                                                                                      |
| `middleware.roleFilter` | `MCP_ROLE_MODULES`                        | JSON object `{ role: [modules] }`.                                                             |
| `app.htmlPath`          | —                                         | Path derived from the consumer's build output (`path.join(__dirname, "dist/mcp-app.html")`).   |

## Proxy secret env vars

Referenced by name from the `MCP_PROXIES` JSON document. The server reads
them at boot via `secretResolver` (default: `process.env[name]`).

| Env var (canonical)      | Produced by                         | When                                                |
| ------------------------ | ----------------------------------- | --------------------------------------------------- |
| `MCP_PROXY_<NAME>_TOKEN` | `proxySecretEnvVar(name, "bearer")` | `auth.mode === "bearer"` — upstream's bearer token. |
| `MCP_PROXY_<NAME>_VALUE` | `proxySecretEnvVar(name, "header")` | `auth.mode === "header"` — upstream's header value. |

`<NAME>` is the proxy's name upper-cased, dashes → underscores (e.g.
`lexoffice` → `MCP_PROXY_LEXOFFICE_TOKEN`). The `MCP_PROXY` prefix is
the `DEFAULT_PROXY_SECRET_PREFIX`; override by passing a custom prefix to
`proxySecretEnvVar` / `proxySecretEnvVars`.

For `oauth2` proxies, only the optional `clientIdEnvVar` and
`clientSecretEnvVar` are read — and only if your provider needs them
(mcp-use's built-in dynamic registration rarely does).

## Build-time (tool-codegen)

The CLI itself reads `process.env` only indirectly through the
`codegen.config.ts` that the consumer authors:

```ts
export default {
  proxyName: "lexoffice",
  upstreamUrl: process.env.LEXOFFICE_UPSTREAM_URL!,
  auth: { mode: "bearer", token: process.env.MCP_PROXY_LEXOFFICE_TOKEN! },
  out: "./src/generated",
}
```

Conventions:

- `<PROXY>_UPSTREAM_URL` — target MCP URL for the codegen handshake.
- `MCP_PROXY_<PROXY>_TOKEN` — reuse the runtime secret env for a bearer
  token so dev + build use the same credential.

For `oauth2` upstreams, run the flow once in dev, paste the access token
into `MCP_PROXY_<PROXY>_TOKEN`, and regenerate.

## Example minimal `.env`

```sh
# Public URL (used for resource URIs and oauth callback redirects)
MCP_URL=http://localhost:3010

# Auth provider (WorkOS in this example)
WORKOS_SUBDOMAIN=example
WORKOS_ORG_ID=org_123

# Upstream federation
MCP_PROXIES='[{"name":"items","label":"Items","upstreamUrl":"http://localhost:4000/mcp","auth":{"mode":"none"}}]'

# Role-based module gating
MCP_ROLE_MODULES='{"accountant":["lexoffice"]}'
```

Running `pnpm dev:host` inside `examples/` uses a stripped-down version
of this file — see [`examples/env.example`](../../examples/env.example).

## See also

- [Proxy contract reference](api-proxy-contract.md) — full schema for `MCP_PROXIES`.
- [Registering upstream proxies](../guides/registering-upstream-proxies.md)
- [Middleware and auth](../guides/middleware-and-auth.md)
