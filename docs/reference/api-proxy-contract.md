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

`upstreamModules: true` opts a proxy into host-side module discovery:
at boot the host calls `get-module-manifest` on that upstream and
registers the declared declarative steps + widgets as a synthetic
`AppPlugin` — no consumer-side plugin file required. Omit (or set
`false`) for plain federation.

Validates against `ProxyConfigSchema`; duplicate names or malformed URLs
fail at boot.

## Module manifest

When a proxy entry sets `upstreamModules: true`, the host calls the
upstream's `get-module-manifest` tool at boot and registers the returned
widgets + declarative steps as a synthetic `AppPlugin`. The manifest
contract lives in this package so admin tooling and module authors
share one validator.

### Schemas

| Symbol                     | Shape                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModuleManifestSchema`     | `{ schemaVersion?, moduleId, runtime, steps[], widgets[] }`. `schemaVersion` is optional and defaults to `1`; a host skips any manifest whose `schemaVersion` exceeds the version it was built against (fail-soft). `superRefine` rejects duplicate step/widget IDs and any ID that doesn't start with `<moduleId>:`. |
| `RuntimeRequirementSchema` | `{ react: string }`. Semver range the module's widget bundles need (e.g. `"^19.0.0"`). Host fail-soft skips modules whose range doesn't satisfy `TOOLKIT_REACT_MAJOR`.                                                                                                                                                |
| `DeclarativeStepSchema`    | `{ id, dataType, requires, produces, tool, inputMapping, outputMapping }`. `tool` is unprefixed — host prepends the originating proxy name. `inputMapping` reads dot-paths into the pipeline context (e.g. `keys.<ns>:itemId`); `outputMapping` writes dot-paths from the tool response into produced keys.           |
| `RemoteWidgetSchema`       | `{ id, requires, bundle, size?, propsSchema? }`. `bundle` is an MCP resource URI (typically `ui://<moduleId>/widgets/<name>.js`). `size` defaults to `"full"` when omitted; `propsSchema` mirrors `WidgetDefinition.propsSchema` from `@miragon/mcp-toolkit-core` and surfaces verbatim in `get-framework-manifest`.  |
| `WidgetSizeSchema`         | `z.enum(["quarter", "third", "half", "full", "header"])`. Mirrors `WidgetSize` from core so the manifest contract stays standalone.                                                                                                                                                                                   |

### Patterns

| Symbol                  | Value                                            | Purpose                                                                                                                                                       |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODULE_ID_PATTERN`     | `/^[a-z][a-z0-9-]*$/`                            | Module IDs are URL-safe + MCP-tool-name-safe; same character class as proxy names so the two spaces interoperate.                                             |
| `NAMESPACED_ID_PATTERN` | `/^[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/` | Every step ID, widget ID, dataType, and key in `produces`/`requires` must be `<namespace>:<local>`. Local part allows camelCase, kebab-case, and dotted keys. |

### Constants

| Symbol                           | Value                   | Purpose                                                                                                                                                                                     |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET_MODULE_MANIFEST_TOOL`       | `"get-module-manifest"` | Canonical tool name an upstream exposes to advertise its manifest. Use this constant on both sides.                                                                                         |
| `MODULE_MANIFEST_SCHEMA_VERSION` | `1`                     | Current version of the module-manifest contract. Stamped as the default `schemaVersion`; a host skips manifests whose `schemaVersion` exceeds the version it was built against (fail-soft). |

### Types

| Type                 | Origin                                      |
| -------------------- | ------------------------------------------- |
| `ModuleManifest`     | `z.infer<typeof ModuleManifestSchema>`.     |
| `RuntimeRequirement` | `z.infer<typeof RuntimeRequirementSchema>`. |
| `DeclarativeStep`    | `z.infer<typeof DeclarativeStepSchema>`.    |
| `RemoteWidget`       | `z.infer<typeof RemoteWidgetSchema>`.       |
| `WidgetSizeHint`     | `z.infer<typeof WidgetSizeSchema>`.         |

See [`packages/proxy-contract/src/module-manifest.ts`](../../packages/proxy-contract/src/module-manifest.ts)
and [the upstream-hosted modules plan](../plans/upstream-hosted-modules.md)
for the full design.

## See also

- [Upstream proxies concept](../concepts/upstream-proxies.md)
- [Registering upstream proxies](../guides/registering-upstream-proxies.md)
- [Env vars reference](env-vars.md)
