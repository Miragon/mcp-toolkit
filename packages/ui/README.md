# @miragon/mcp-toolkit-ui

React UI for MCP servers: shadcn primitives, composite components, TanStack
Query hooks, and the MCP App shell (McpAppView + WidgetRenderer).

## Install

Published to the public npm registry under the `@miragon` scope — no `.npmrc`
or token needed.

```sh
pnpm add @miragon/mcp-toolkit-ui @miragon/mcp-toolkit-core mcp-use@1.34.1 react@19.2.7 react-dom@19.2.7 tailwindcss@4.3.1
```

Peer versions are pinned exactly — install the versions above.

## Import paths

| Subpath                   | Key exports                                                                                                                                                                           | Constraint                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@miragon/mcp-toolkit-ui` | Primitives (`Card`, `Table`, `Button`, …), composed components (`KpiGrid`, `WidgetHeader`, `FilterBar`), `useToolQuery`, `createTheme` / `ThemeProvider`, `cn`, `parseViewToolResult` | Free of `mcp-use/react` value imports (langchain transitive) — safe for apps that never mount the shell. |
| `…-ui/app`                | `McpToolkitApp`, `McpAppView`, `WidgetRenderer`, `useHostBridge`, `adaptDataWidget`, `WidgetFixtureHost`                                                                              | The MCP app shell + host bridge — imports `mcp-use/react`. Never re-exported from the root barrel.       |
| `…-ui/hooks`              | `useViewToolQuery`, `useViewData`, `useToolQuery`, `useToolMutation`                                                                                                                  | View-tool hooks.                                                                                         |
| `…-ui/globals.css`        | Tailwind v4 theme + design tokens                                                                                                                                                     | Import once in the app entry.                                                                            |

## Component catalog

`ui-catalog.json` (shipped in the tarball) is the machine-readable catalog of
every prompt-relevant component and hook — import path, props, when to use.
Human twin: [docs/reference/components.md](https://github.com/Miragon/mcp-toolkit/blob/main/docs/reference/components.md).

## Links

- [API reference](https://github.com/Miragon/mcp-toolkit/blob/main/docs/reference/api-ui.md)
- [Getting started](https://github.com/Miragon/mcp-toolkit/blob/main/docs/getting-started.md)
- [Starter template](https://github.com/Miragon/mcp-toolkit-starter) — "Use this template" for a new server project
