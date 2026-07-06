# @miragon/mcp-toolkit

Shared framework runtime and UI primitives for MCP servers built on top of [mcp-use](https://github.com/mcp-use/mcp-use).

This monorepo ships four packages that are consumed by multiple MCP server projects (currently `miranum-ai` and `automation-mcp`):

| Package                                                            | Description                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@miragon/mcp-toolkit-proxy-contract`](./packages/proxy-contract) | Shared upstream-proxy contract: Zod schemas, env-var helpers, and the canonical JSON shape written by admin portals and consumed by `core`. No React, no DOM.                                                                                                         |
| [`@miragon/mcp-toolkit-core`](./packages/core)                     | Framework runtime: `AppPlugin` contract, `StepRegistry` / `WidgetRegistry`, pipeline executor, tool registrars, `renderView` + `getFrameworkManifest` + `buildProxyAppConfigs` helpers. No React, no DOM.                                                             |
| [`@miragon/mcp-toolkit-tool-codegen`](./packages/tool-codegen)     | Build-time codegen + runtime glue for type-safe MCP tool calls: `TypedCallTool` and a CLI (`mcp-tool-codegen`) that generates TypeScript types and React Query hooks from an upstream MCP's `tools/list`.                                                             |
| [`@miragon/mcp-toolkit-ui`](./packages/ui)                         | React UI: shadcn primitives, composite components, TanStack Query hooks, MCP App shell (`McpToolkitApp` / `McpAppView` + `WidgetRenderer`, with built-in host auto-sizing and a default upstream-widget loader) for bundling widgets into an `mcp-app.html` resource. |

## Quickstart (in this repo)

No npm auth needed — `pnpm install` links the workspace packages. The fastest
way to see the toolkit working is the [examples workspace](./examples):

```sh
corepack enable                          # the repo pins pnpm via `packageManager`
pnpm install                             # `prepare` scripts build the package dists
cp examples/env.example examples/.env    # first time only
pnpm --filter @miragon/mcp-toolkit-examples start
```

`start` builds the widget bundles, boots two demo upstreams (`:4000`, `:4001`),
and starts the host on `:3010`. Then:

- open the built-in mcp-use inspector at <http://localhost:3010/inspector> and
  call `show_tasks_board`, or
- smoke-test from the shell:

  ```sh
  curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
  ```

For visible pixels without any server or `.env`, run the widget playground —
isolated widget development against fixture data:

```sh
pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
```

Where to next:

- [`docs/getting-started.md`](./docs/getting-started.md) — the canonical
  getting-started: run the examples, then build your own host + module.
- [`examples/README.md`](./examples/README.md) — what each example proves,
  every script, ports, and smoke tests.
- [`Miragon/mcp-toolkit-starter`](https://github.com/Miragon/mcp-toolkit-starter) —
  "Use this template" for your own project; auto-synced mirror of
  [`templates/minimal-server`](./templates/minimal-server).
- [`docs/`](./docs/README.md) — concepts, guides, API reference, recipes.

## Using the packages in your own project

The packages are published to [GitHub Packages](https://github.com/orgs/Miragon/packages?repo_name=mcp-toolkit) (the `@miragon` scope is restricted, so consumers need to authenticate). Inside this monorepo none of this section applies.

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

`@miragon/mcp-toolkit-core` peer-deps `proxy-contract`, so it must be installed alongside `core`. The peer dependencies are pinned exactly — install `mcp-use@1.34.1`, `@modelcontextprotocol/sdk@1.29.0`, and `zod@4.4.3` alongside (see each package's `peerDependencies` for the authoritative list).

The quickest start is the template repo [`Miragon/mcp-toolkit-starter`](https://github.com/Miragon/mcp-toolkit-starter) ("Use this template", or `gh repo create my-mcp-server --template Miragon/mcp-toolkit-starter`) — a self-contained host + module + widget-bundle project with the `.npmrc`, pinned versions, CI, and the `mcp-app.html` Vite setup already wired. It is an auto-synced mirror of [`templates/minimal-server`](./templates/minimal-server) in this repo.

## Building UIs fast

UIs are hand-built from the `@miragon/mcp-toolkit-ui` primitives — design quality is the point, so there is no auto-generated UI. They are prompted _on top of_ this base, so the base is the ground truth. A coding agent should reach for the repo's skills first, then the building blocks below:

- **Agent skills** — `.claude/skills/` encodes the house patterns with runnable snippets: [`build-mcp-server`](./.claude/skills/build-mcp-server/SKILL.md) (host + a module with its own tools + a widget, worked through the [`tasks` example](./examples/modules/tasks)), [`add-mcp-tool`](./.claude/skills/add-mcp-tool/SKILL.md) (one `createToolRegistrar` entry), [`build-mcp-widget`](./.claude/skills/build-mcp-widget/SKILL.md) (a widget against the UI base), [`compose-a-view`](./.claude/skills/compose-a-view/SKILL.md) (a multi-widget dashboard with `buildComposedView`, or a multi-step pipeline with `render-view`, worked through the [`orders` example](./examples/modules/orders)), and [`white-label-client`](./.claude/skills/white-label-client/SKILL.md) (theming tokens). Invoke the matching one before hand-rolling. Building on the toolkit from a consumer repo? Copy the skill directories into that repo's `.claude/skills/` so your coding agent gets the same ground truth.
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
pnpm test
```

Docs site: `pnpm docs:dev` (local preview) / `pnpm docs:build`. Contributor
workflow, module boundaries, and release process live in
[`CONTRIBUTING.md`](./CONTRIBUTING.md).
