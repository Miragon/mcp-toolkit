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

The contract is versioned: `MODULE_MANIFEST_SCHEMA_VERSION` is currently `2`,
and a v2 host accepts both v1 and v2 manifests (the gate only skips manifests
declaring a _newer_ version than the host understands, fail-soft). Declare the
minimum version you actually use: stay on `schemaVersion: 1` (or omit it)
unless the manifest uses a v2 feature — `hostWidget` widget entries or the
extended `runtime` keys — in which case `schemaVersion: 2` is mandatory and
enforced by the schema.

### Schemas

| Symbol                     | Shape                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModuleManifestSchema`     | `{ schemaVersion?, moduleId, runtime, steps[], widgets[] }`. `schemaVersion` is optional and defaults to `1`; a host skips any manifest whose `schemaVersion` exceeds the version it was built against (fail-soft). `superRefine` rejects duplicate step/widget IDs, any ID that doesn't start with `<moduleId>:`, and v2-only features (`hostWidget` entries, runtime extras) declared under `schemaVersion: 1`. |
| `RuntimeRequirementSchema` | `{ react, mcpUseReact?, toolkitUi?, reactQuery? }`. Semver ranges the module's widget bundles need. `react` (e.g. `"^19.0.0"`) is always required; the optional extras declare shared runtimes the bundles import as externals and require `schemaVersion: 2`. See [Runtime requirements](#runtime-requirements).                                                                                                 |
| `DeclarativeStepSchema`    | `{ id, dataType, requires, produces, tool, inputMapping, outputMapping }`. `tool` is unprefixed — host prepends the originating proxy name. `inputMapping` reads dot-paths into the pipeline context (e.g. `keys.<ns>:itemId`); `outputMapping` writes dot-paths from the tool response into produced keys.                                                                                                       |
| `ManifestWidgetSchema`     | `z.union([RemoteWidgetSchema, HostWidgetRefSchema])` — either widget flavour a manifest may carry. Narrow with `isHostWidgetRef`.                                                                                                                                                                                                                                                                                 |
| `RemoteWidgetSchema`       | `{ id, requires, bundle, size?, propsSchema? }`. `bundle` is an MCP resource URI (typically `ui://<moduleId>/widgets/<name>.js`). `size` defaults to `"full"` when omitted; `propsSchema` mirrors `WidgetDefinition.propsSchema` from `@miragon/mcp-toolkit-core` and surfaces verbatim in `get-framework-manifest`.                                                                                              |
| `HostWidgetRefSchema`      | `{ id, requires, hostWidget, props?, size?, propsSchema? }`. No bundle — aliases an existing **host-bundled** widget; `props` are presets merged under each layout cell's `props` (the cell wins). Requires `schemaVersion: 2`. See [Host-widget references](#host-widget-references-schemaversion-2).                                                                                                            |
| `WidgetSizeSchema`         | `z.enum(["quarter", "third", "half", "full", "header"])`. Mirrors `WidgetSize` from core so the manifest contract stays standalone.                                                                                                                                                                                                                                                                               |

`bundle` and `hostWidget` are mutually exclusive — a widget entry carrying
both (or neither) fails both union arms and is rejected.

### Host-widget references (schemaVersion 2)

A `hostWidget` entry contributes a widget **without shipping a bundle**: it
aliases a widget the host already bundles. Layout cells referencing the
module-namespaced alias `id` render the host component named by `hostWidget`,
with the entry's `props` applied as presets:

```jsonc
{
  "schemaVersion": 2,
  "moduleId": "customers",
  "runtime": { "react": "^19.0.0" },
  "steps": [],
  "widgets": [
    {
      "id": "customers:revenue-kpis", // module-namespaced, like any widget id
      "requires": [],
      "hostWidget": "shell:kpi-grid", // a widget the HOST bundles — foreign namespace expected
      "props": { "title": "Revenue", "columns": 4 }, // preset props
      "size": "half",
    },
  ],
}
```

- **Props precedence (the cell wins):** the manifest's `props` are merged
  _under_ each layout cell's own `props`, key by key — a cell rendering
  `customers:revenue-kpis` with `props: { "columns": 2 }` gets
  `{ title: "Revenue", columns: 2 }`.
- **Target rules:** `hostWidget` names a widget of the _host_, so it is
  deliberately not namespace-checked against the module. The target must be a
  host-bundled (local) widget — a target that is unregistered, upstream-hosted,
  or itself an alias makes the host skip the whole module at boot (fail-soft,
  logged warning; the module's steps and other widgets are dropped with it).

### Runtime requirements

`RuntimeRequirementSchema` describes the shared libraries the module's widget
bundles import as externals. The host checks every declared entry at discovery
time and skips the module (fail-soft) when it cannot satisfy one:

| Key            | Library                                       | Notes                                                            |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| `react`        | `react` / `react-dom`                         | Always required. Semver range, e.g. `"^19.0.0"`.                 |
| `mcpUseReact?` | `mcp-use/react`                               | Versioned by the `mcp-use` package. Requires `schemaVersion: 2`. |
| `toolkitUi?`   | `@miragon/mcp-toolkit-ui` (all three barrels) | All subpaths share one version. Requires `schemaVersion: 2`.     |
| `reactQuery?`  | `@tanstack/react-query`                       | Requires `schemaVersion: 2`.                                     |

Range semantics (`runtimeRangeSatisfied` in `@miragon/mcp-toolkit-core`):
plain, caret, and tilde forms only. Majors >= 1 compare majors; 0.x ranges
additionally compare minors, because the minor is the breaking axis for 0.x
packages (the toolkit itself included). An extra the module requires but the
host does not declare (via `createFrameworkApp`'s `hostRuntime` option) is a
mismatch — declaring nothing means exposing nothing.

### Patterns

| Symbol                  | Value                                            | Purpose                                                                                                                                                       |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODULE_ID_PATTERN`     | `/^[a-z][a-z0-9-]*$/`                            | Module IDs are URL-safe + MCP-tool-name-safe; same character class as proxy names so the two spaces interoperate.                                             |
| `NAMESPACED_ID_PATTERN` | `/^[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/` | Every step ID, widget ID, dataType, and key in `produces`/`requires` must be `<namespace>:<local>`. Local part allows camelCase, kebab-case, and dotted keys. |

### Constants

| Symbol                           | Value                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET_MODULE_MANIFEST_TOOL`       | `"get-module-manifest"` | Canonical tool name an upstream exposes to advertise its manifest. Use this constant on both sides.                                                                                                                                                                                                                                                                                                             |
| `MODULE_MANIFEST_SCHEMA_VERSION` | `2`                     | Current version of the module-manifest contract. The version gate is strictly-greater with no lower bound, so a v2 host accepts **both** v1 and v2 manifests; only manifests from the future are skipped (fail-soft). Manifests using v2-only features must declare `schemaVersion: 2` — the schema rejects under-declaration, which is what lets v1 (0.8.x) hosts skip them cleanly at their own version gate. |

### Types

| Type                 | Origin                                                                    |
| -------------------- | ------------------------------------------------------------------------- |
| `ModuleManifest`     | `z.infer<typeof ModuleManifestSchema>`.                                   |
| `RuntimeRequirement` | `z.infer<typeof RuntimeRequirementSchema>`.                               |
| `DeclarativeStep`    | `z.infer<typeof DeclarativeStepSchema>`.                                  |
| `ManifestWidget`     | `z.infer<typeof ManifestWidgetSchema>` — `RemoteWidget \| HostWidgetRef`. |
| `RemoteWidget`       | `z.infer<typeof RemoteWidgetSchema>`.                                     |
| `HostWidgetRef`      | `z.infer<typeof HostWidgetRefSchema>`.                                    |
| `WidgetSizeHint`     | `z.infer<typeof WidgetSizeSchema>`.                                       |

### Guards

| Symbol            | Signature                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `isHostWidgetRef` | `(widget: ManifestWidget) → widget is HostWidgetRef`. True when the entry carries a `hostWidget`. |

See [`packages/proxy-contract/src/module-manifest.ts`](../../packages/proxy-contract/src/module-manifest.ts)
and [the upstream-hosted modules plan](../plans/upstream-hosted-modules.md)
for the full design.

## See also

- [Upstream proxies concept](../concepts/upstream-proxies.md)
- [Registering upstream proxies](../guides/registering-upstream-proxies.md)
- [Env vars reference](env-vars.md)
