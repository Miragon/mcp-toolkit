# @miragon/mcp-toolkit

Shared framework runtime and UI primitives for MCP servers built on top of [mcp-use](https://github.com/mcp-use/mcp-use).

This monorepo ships four packages that are consumed by multiple MCP server projects (currently `miranum-ai` and `automation-mcp`):

| Package                                                            | Description                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@miragon/mcp-toolkit-proxy-contract`](./packages/proxy-contract) | Shared upstream-proxy contract: Zod schemas, env-var helpers, and the canonical JSON shape written by admin portals and consumed by `core`. No React, no DOM.                                                                                                         |
| [`@miragon/mcp-toolkit-core`](./packages/core)                     | Framework runtime: `AppPlugin` contract, `StepRegistry` / `WidgetRegistry`, pipeline executor, tool registrars, `renderView` + `getFrameworkManifest` + `buildProxyAppConfigs` helpers. No React, no DOM.                                                             |
| [`@miragon/mcp-toolkit-tool-codegen`](./packages/tool-codegen)     | Build-time codegen + runtime glue for type-safe MCP tool calls: `TypedCallTool` and a CLI (`mcp-tool-codegen`) that generates TypeScript types and React Query hooks from an upstream MCP's `tools/list`.                                                             |
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

## Building UIs fast

UIs are hand-built from the `@miragon/mcp-toolkit-ui` primitives — design quality is the point, so there is no auto-generated UI. They are prompted _on top of_ this base, so the base is the ground truth. A coding agent should reach for the repo's skills first, then the building blocks below:

- **Agent skills** — `.claude/skills/` encodes the house patterns with runnable snippets: [`build-mcp-server`](./.claude/skills/build-mcp-server/SKILL.md) (host + a module with its own tools + a widget, worked through the [`tasks` example](./examples/modules/tasks)), [`add-mcp-tool`](./.claude/skills/add-mcp-tool/SKILL.md) (one `createToolRegistrar` entry), [`build-mcp-widget`](./.claude/skills/build-mcp-widget/SKILL.md) (a widget against the UI base), [`compose-a-view`](./.claude/skills/compose-a-view/SKILL.md) (a multi-widget dashboard with `buildComposedView`, or a multi-step pipeline with `render-view`, worked through the [`orders` example](./examples/modules/orders)), and [`white-label-client`](./.claude/skills/white-label-client/SKILL.md) (theming tokens). Invoke the matching one before hand-rolling.
- **Component reference** — [`docs/reference/components.md`](./docs/reference/components.md) (and its machine-readable twin [`packages/ui/ui-catalog.json`](./packages/ui/ui-catalog.json)) is the LLM-readable catalog of every prompt-relevant component and hook: import path, props, and "when to use". The repo-specific [`build-mcp-widget` skill](./.claude/skills/build-mcp-widget/SKILL.md) walks the full authoring loop against it.
- **Widget isolation** — `WidgetFixtureHost` (a "Storybook for MCP widgets") renders a widget with fixture data and a mocked host, no backend required. See the [`widget-playground`](./examples/widget-playground) example and the [developing-widgets-in-isolation guide](./docs/guides/developing-widgets-in-isolation.md).
- **Host portability** — write a widget against `useHostBridge()` and it runs unchanged in the mcp-use host, ChatGPT (Apps SDK), or a standalone web app against an existing server. See the [`host-portability`](./examples/host-portability) example and the [host-portability concept](./docs/concepts/host-portability.md).
- **White-label theming** — every primitive reads CSS-variable design tokens, so one `createTheme(...)` + `<ThemeProvider>` re-skins a whole client UI (brand colour, radius, light/dark). Widgets prompted on top use tokens (`text-primary`, `bg-card`, `rounded-lg`), never hard-coded colours, so they inherit the brand for free. See the [white-labeling guide](./docs/guides/white-labeling.md) and the playground's brand switcher.
- **Layered adoption** — use only the parts you need: primitives + a standalone UI, data-widgets in a host, or the full federation/pipeline/dashboard runtime. See the [layered-adoption concept](./docs/concepts/layered-adoption.md).

## Build

```bash
pnpm install
pnpm -r run build
pnpm -r run typecheck
```
