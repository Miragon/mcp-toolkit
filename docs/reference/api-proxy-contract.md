# `@miragon/mcp-toolkit-proxy-contract` — API reference

Zod schemas + parsers + env-var helpers for the `<PREFIX>_MCP_PROXIES`
JSON document. Single source of truth shared by admin tooling (portal,
CLI) and the server.

## Schemas

| Symbol                       | Shape                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ProxyConfigSchema`          | `z.array(ProxyConfigEntrySchema)` with a `superRefine` that flags duplicate `name`s.                     |
| `ProxyConfigEntrySchema`     | `{ name, label, upstreamUrl, auth }`. `name` matches `PROXY_NAME_PATTERN`, `upstreamUrl` is a valid URL. |
| `proxyAuthSchema` (internal) | Discriminated union on `mode`: `none` \| `bearer` \| `header` \| `oauth2`.                               |
| `PROXY_NAME_PATTERN`         | `/^[a-z][a-z0-9-]*$/`. Proxy names are both tool-name prefixes and URL segments.                         |

## Auth modes

| `mode`   | Extra fields                                                  |
| -------- | ------------------------------------------------------------- |
| `none`   | —                                                             |
| `bearer` | `tokenEnvVar: UPPER_SNAKE_CASE`                               |
| `header` | `headerName: string`, `valueEnvVar: UPPER_SNAKE_CASE`         |
| `oauth2` | `clientIdEnvVar?`, `clientSecretEnvVar?`, `scopes?: string[]` |

`tokenEnvVar` / `valueEnvVar` reference env-var _names_. The server (or a
`secretResolver`) reads the actual secret from `process.env` at boot.

## Types

| Type               | Origin                                                       |
| ------------------ | ------------------------------------------------------------ |
| `ProxyConfig`      | `z.infer<typeof ProxyConfigSchema>` — array of entries.      |
| `ProxyConfigEntry` | `z.infer<typeof ProxyConfigEntrySchema>`.                    |
| `ProxyAuthConfig`  | `z.infer<typeof proxyAuthSchema>` — the discriminated union. |

## Functions

| Symbol                        | Signature                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseProxyConfigEnv`         | `(raw: string \| undefined) → ProxyConfig`. Returns `[]` for empty/unset input. Throws `ZodError` on invalid JSON or bad shape.                      |
| `serializeProxyConfig`        | `(config: ProxyConfig) → string`. Validates + emits compact single-line JSON.                                                                        |
| `proxySecretEnvVar`           | `(proxyName, mode, prefix = "MCP_PROXY") → string \| undefined`. bearer → `<PREFIX>_<NAME>_TOKEN`; header → `<PREFIX>_<NAME>_VALUE`; else undefined. |
| `proxySecretEnvVars`          | `(entry) → string[]`. Env-var names a given entry needs materialized (reads from the entry itself). `none` / `oauth2` return `[]`.                   |
| `DEFAULT_PROXY_SECRET_PREFIX` | `"MCP_PROXY"`. Consumers that brand their own env namespace (e.g. `MIRANUM_PROXY_*`) pass an explicit prefix instead.                                |

## Example config

```jsonc
[
  {
    "name": "items",
    "label": "Items",
    "upstreamUrl": "http://localhost:4000/mcp",
    "auth": { "mode": "none" },
  },
  {
    "name": "lexoffice",
    "label": "Lexoffice",
    "upstreamUrl": "https://lex.example.com/mcp",
    "auth": { "mode": "bearer", "tokenEnvVar": "MCP_PROXY_LEXOFFICE_TOKEN" },
  },
  {
    "name": "notion",
    "label": "Notion",
    "upstreamUrl": "https://notion.example.com/mcp",
    "auth": { "mode": "oauth2", "scopes": ["read"] },
  },
]
```

Validates against `ProxyConfigSchema`; duplicate names or malformed URLs
fail at boot.

## See also

- [Upstream proxies concept](../concepts/upstream-proxies.md)
- [Registering upstream proxies](../guides/registering-upstream-proxies.md)
- [Env vars reference](env-vars.md)
