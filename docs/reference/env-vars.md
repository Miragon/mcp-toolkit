# Environment variables

The toolkit reads **no** env vars directly from its runtime code (core,
ui). Every value is passed in by the consumer via options objects — so in
principle a consumer is free to name its env vars whatever it wants.

This page documents the **names the toolkit recommends**, so that
consumer projects end up with a consistent surface.

## Consumer-supplied values

These are the options `createFrameworkApp` accepts and the env-var names
the reference consumers use for them. Your consumer is free to pick
different names; the toolkit only sees the resolved string.

| Option                  | Suggested env var                         | Notes                                                                                                                                                   |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | —                                         | Hard-coded.                                                                                                                                             |
| `version`               | —                                         | Hard-coded.                                                                                                                                             |
| —                       | `MCP_URL`                                 | Public origin override; read by mcp-use itself (request-resolved otherwise).                                                                            |
| `oauth`                 | `WORKOS_SUBDOMAIN`, `WORKOS_CLIENT_ID`, … | Whatever your OAuth provider factory needs. Since mcp-use 2.2.0 the built-in factories also fall back to `MCP_USE_OAUTH_*` when called without options. |
| `middleware.orgGate`    | `WORKOS_ORG_ID`                           | Optional. Reads the WorkOS-style `organization_id` claim — see [Middleware and auth](../guides/middleware-and-auth.md).                                 |
| `middleware.roleFilter` | `MCP_ROLE_MODULES`                        | JSON object `{ role: [modules] }`.                                                                                                                      |
| `app.bundle`            | —                                         | Paths derived from the consumer's build output (`dist/mcp-app.js`, `dist/mcp-app.css`).                                                                 |

## Build-time (tool-codegen)

The CLI itself reads `process.env` only indirectly through the
`codegen.config.ts` that the consumer authors:

```ts
export default {
  proxyName: "articles",
  upstreamUrl: process.env.ARTICLES_CODEGEN_SOURCE_URL!,
  auth: { mode: "none" },
  out: "./generated",
}
```

Conventions:

- `<NAME>_CODEGEN_SOURCE_URL` — the MCP URL the codegen handshake
  snapshots (`tools/list`).
- For a token-protected source, pass
  `auth: { mode: "bearer", token: process.env.<NAME>_CODEGEN_TOKEN! }` —
  run any OAuth flow once in dev, paste the access token, regenerate.

## Example minimal `.env`

```sh
# Public URL (used for resource URIs and oauth callback redirects)
MCP_URL=http://localhost:3010

# Auth provider (WorkOS in this example)
WORKOS_SUBDOMAIN=example
WORKOS_ORG_ID=org_123

# Role-based module gating
MCP_ROLE_MODULES='{"accountant":["lexoffice"]}'
```

Running `pnpm dev:host` inside `examples/` uses a stripped-down version
of this file — see [`examples/env.example`](../../examples/env.example).

## See also

- [Using tool-codegen](../guides/using-tool-codegen.md)
- [Middleware and auth](../guides/middleware-and-auth.md)
