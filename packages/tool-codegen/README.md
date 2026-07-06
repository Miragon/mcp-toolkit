# @miragon/mcp-toolkit-tool-codegen

Build-time codegen + runtime glue for type-safe MCP tool calls: TypedCallTool
helper and a CLI that generates TypeScript types + React Query hooks from an
upstream MCP's tools/list.

## Install

Published to GitHub Packages. Point the `@miragon` scope at it in your
`.npmrc` and export a token with `read:packages` scope as `GITHUB_TOKEN`
(details: [root README](https://github.com/Miragon/mcp-toolkit/blob/main/README.md#using-the-packages-in-your-own-project)):

```
@miragon:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen @miragon/mcp-toolkit-core @modelcontextprotocol/sdk@1.29.0
```

## Import paths

| Subpath                             | Key exports                                                                  | Constraint                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@miragon/mcp-toolkit-tool-codegen` | `generateTools`, `renderCodegen`, `writeCodegenOutput`, `fetchUpstreamTools` | Build-time only — never import from runtime code.                                                   |
| `…-tool-codegen/runtime`            | `ToolShape`, `TypedCallTool` (types only)                                    | The only subpath widget bundles / step modules may import; pulls in no `handlebars` / codegen deps. |
| `…-tool-codegen/templates/*`        | Handlebars templates used by the codegen                                     | Internal to the CLI.                                                                                |

## CLI

The `mcp-tool-codegen` bin generates `tools.ts` + `hooks.tsx` from an
upstream's `tools/list`:

```sh
mcp-tool-codegen generate            # reads ./codegen.config.ts (CodegenConfig)
mcp-tool-codegen generate --check    # CI: exit 1 on drift vs committed output
mcp-tool-codegen inspect --upstream https://upstream.example/mcp
```

Generated code imports only `@miragon/mcp-toolkit-tool-codegen/runtime`.
`buildProxyAppConfigs` lives in `@miragon/mcp-toolkit-core`, not here.

## Links

- [API reference](https://github.com/Miragon/mcp-toolkit/blob/main/docs/reference/api-tool-codegen.md)
- [Getting started](https://github.com/Miragon/mcp-toolkit/blob/main/docs/getting-started.md)
- [Starter template](https://github.com/Miragon/mcp-toolkit-starter) — "Use this template" for a new server project
