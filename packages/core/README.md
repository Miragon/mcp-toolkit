# @miragon/mcp-toolkit-core

Framework runtime for MCP servers: plugin contract, step/widget registries,
pipeline executor, render-view helpers.

## Install

Published to GitHub Packages. Point the `@miragon` scope at it in your
`.npmrc` and export a token with `read:packages` scope as `GITHUB_TOKEN`
(details: [root README](https://github.com/Miragon/mcp-toolkit/blob/main/README.md#using-the-packages-in-your-own-project)):

```
@miragon:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
pnpm add @miragon/mcp-toolkit-core @miragon/mcp-toolkit-proxy-contract @modelcontextprotocol/sdk@1.29.0 mcp-use@1.32.1 zod@4.4.3
```

Peer versions are pinned exactly — install the versions above.

## Import paths

| Subpath                     | Key exports                                                                                                                      | Constraint                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@miragon/mcp-toolkit-core` | `executePipeline`, `renderView`, `buildSingleWidgetView`, `buildComposedView`, `StepRegistry`, `WidgetRegistry`, `uiMeta`, types | Browser-safe: no `mcp-use/server`, no `node:*`. The barrel widget bundles import from.          |
| `…-core/tools`              | `createFrameworkApp`, `createToolRegistrar`, `createWidgetToolRegistrar`, `registerFrameworkTools`, dashboard-store impls        | Server-only — imports `mcp-use/server`. Keep out of browser bundles.                            |
| `…-core/proxy`              | `UpstreamProxyPlugin`, `ServerSideOAuthProvider`, `InMemorySessionStore`, `buildProxyAppConfigs`                                 | Server-only — imports `mcp-use/server` and `node:crypto`.                                       |
| `…-core/rest`               | `createRestClient`, `createRestTool`, `RestError`                                                                                | REST tool helpers; register the resulting `ToolConfig` via `createToolRegistrar` from `/tools`. |

`createFrameworkApp` / `createToolRegistrar` live **only** in
`@miragon/mcp-toolkit-core/tools` — never in the root barrel.

## Links

- [API reference](https://github.com/Miragon/mcp-toolkit/blob/main/docs/reference/api-core.md)
- [Getting started](https://github.com/Miragon/mcp-toolkit/blob/main/docs/getting-started.md)
- [Starter template](https://github.com/Miragon/mcp-toolkit-starter) — "Use this template" for a new server project
