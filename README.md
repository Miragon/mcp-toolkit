# @miragon/mcp-toolkit

Shared framework runtime and UI primitives for MCP servers built on top of [mcp-use](https://github.com/mcp-use/mcp-use).

This monorepo ships four packages that are consumed by multiple MCP server projects (currently `miranum-ai` and `automation-mcp`):

| Package                                                            | Description                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@miragon/mcp-toolkit-proxy-contract`](./packages/proxy-contract) | Shared upstream-proxy contract: Zod schemas, env-var helpers, and the canonical JSON shape written by admin portals and consumed by `core`. No React, no DOM.                                                                                                         |
| [`@miragon/mcp-toolkit-core`](./packages/core)                     | Framework runtime: `AppPlugin` contract, `StepRegistry` / `WidgetRegistry`, pipeline executor, tool registrars, `renderView` + `getFrameworkManifest` helpers. No React, no DOM.                                                                                      |
| [`@miragon/mcp-toolkit-tool-codegen`](./packages/tool-codegen)     | Build-time codegen + runtime glue for type-safe MCP tool calls: `TypedCallTool`, `buildProxyAppConfigs`, and a CLI (`mcp-tool-codegen`) that generates TypeScript types and React Query hooks from an upstream MCP's `tools/list`.                                    |
| [`@miragon/mcp-toolkit-ui`](./packages/ui)                         | React UI: shadcn primitives, composite components, TanStack Query hooks, MCP App shell (`McpToolkitApp` / `McpAppView` + `WidgetRenderer`, with built-in host auto-sizing and a default upstream-widget loader) for bundling widgets into an `mcp-app.html` resource. |

## Usage

The packages are published to [GitHub Packages](https://github.com/orgs/Miragon/packages?repo_name=mcp-toolkit) (the `@miragon` scope is restricted, so consumers need to authenticate).

In the consuming project, add an `.npmrc` that points the `@miragon` scope at GitHub Packages and supplies a token:

```
@miragon:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then export a [Personal Access Token](https://github.com/settings/tokens) with the `read:packages` scope as `GITHUB_TOKEN` (in CI, the default `secrets.GITHUB_TOKEN` works as long as the workflow has `permissions: { packages: read }`).

Install only what you need:

```sh
# Server-only consumer
pnpm add @miragon/mcp-toolkit-core @miragon/mcp-toolkit-proxy-contract

# Server + frontend shell
pnpm add @miragon/mcp-toolkit-core @miragon/mcp-toolkit-proxy-contract @miragon/mcp-toolkit-ui

# Plus type-safe tool-call codegen (CLI)
pnpm add -D @miragon/mcp-toolkit-tool-codegen
```

`@miragon/mcp-toolkit-core` peer-deps `proxy-contract`, so it must be installed alongside `core`.

## Build

```bash
pnpm install
pnpm -r run build
pnpm -r run typecheck
```
