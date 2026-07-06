# @miragon/mcp-toolkit-proxy-contract

Shared contract for MCP upstream-proxy configuration: Zod schemas, env-var
helpers, and the canonical JSON shape written by admin portals and consumed
by MCP servers.

## Install

Published to GitHub Packages. Point the `@miragon` scope at it in your
`.npmrc` and export a token with `read:packages` scope as `GITHUB_TOKEN`
(details: [root README](https://github.com/Miragon/mcp-toolkit/blob/main/README.md#using-the-packages-in-your-own-project)):

```
@miragon:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
pnpm add @miragon/mcp-toolkit-proxy-contract zod@4.4.3
```

## Import paths

| Subpath                               | Key exports                                                                                                                           | Constraint                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `@miragon/mcp-toolkit-proxy-contract` | `ProxyConfigSchema`, `parseProxyConfigEnv`, `serializeProxyConfig`, `proxySecretEnvVar`, `ModuleManifestSchema`, `PROXY_NAME_PATTERN` | Depends only on `zod` — safe in admin portals and on the server. |

Both sides of the proxy config compile against the same types and the same
Zod validator, so drift is a compile-time error instead of a runtime
surprise. The module-manifest schemas (`ModuleManifestSchema`,
`GET_MODULE_MANIFEST_TOOL`) define the boot-time handshake for
upstream-hosted modules.

## Links

- [API reference](https://github.com/Miragon/mcp-toolkit/blob/main/docs/reference/api-proxy-contract.md)
- [Getting started](https://github.com/Miragon/mcp-toolkit/blob/main/docs/getting-started.md)
- [Starter template](https://github.com/Miragon/mcp-toolkit-starter) — "Use this template" for a new server project
