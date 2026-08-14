# @miragon/mcp-toolkit-core

Framework runtime for MCP servers: plugin contract, step/widget registries,
pipeline executor, render-view helpers.

## Install

Published to the public npm registry under the `@miragon` scope — no `.npmrc`
or token needed.

```sh
pnpm add @miragon/mcp-toolkit-core mcp-use@2.2.3 zod@4.4.3
```

Peer versions are pinned exactly — install the versions above.

## Import paths

| Subpath                     | Key exports                                                                                                                                              | Constraint                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@miragon/mcp-toolkit-core` | `executePipeline`, `renderView`, `buildSingleWidgetView`, `buildComposedView`, `StepRegistry`, `WidgetRegistry`, `appsSdkMeta`, `viewResourceUri`, types | Browser-safe: no `mcp-use` server runtime, no `node:*`. The barrel widget bundles import from.  |
| `…-core/tools`              | `installToolkit`, `createFrameworkApp`, `createToolRegistrar`, `createWidgetToolRegistrar`, `registerFrameworkTools`, dashboard-store impls              | Server-only — imports the `mcp-use` server runtime. Keep out of browser bundles.                |
| `…-core/rest`               | `createRestClient`, `createRestTool`, `RestError`                                                                                                        | REST tool helpers; register the resulting `ToolConfig` via `createToolRegistrar` from `/tools`. |

`installToolkit` / `createFrameworkApp` / `createToolRegistrar` live **only** in
`@miragon/mcp-toolkit-core/tools` — never in the root barrel.

## Links

- [API reference](https://github.com/Miragon/mcp-toolkit/blob/main/docs/reference/api-core.md)
- [Getting started](https://github.com/Miragon/mcp-toolkit/blob/main/docs/getting-started.md)
- [Starter template](https://github.com/Miragon/mcp-toolkit-starter) — "Use this template" for a new server project
