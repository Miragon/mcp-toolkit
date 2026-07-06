# Miranum MCP toolkit

Framework for building MCP servers that expose **tools + widgets + pipeline
steps** to an LLM client. Consumers compose it with their own modules and
deployment concerns.

## Packages

| Package                               | Purpose                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@miragon/mcp-toolkit-core`           | Plugin contract, step/widget registries, pipeline executor, framework-tool registrars, upstream-proxy runtime, middleware helpers, `createFrameworkApp` factory.               |
| `@miragon/mcp-toolkit-ui`             | React widget shell (`McpToolkitApp` / `McpAppView`) with host auto-sizing + default upstream-widget loader, shadcn primitives, composed components, typed `useToolQuery` hook. |
| `@miragon/mcp-toolkit-proxy-contract` | Zod schema + parser for `MCP_PROXIES`-style proxy configuration. Shared between admin tooling and the server.                                                                  |
| `@miragon/mcp-toolkit-tool-codegen`   | Build-time codegen (`mcp-tool-codegen` CLI) that turns an upstream MCP's `tools/list` into typed TS + typed React Query hooks.                                                 |

## Start here

- [Getting started](getting-started.md) — run the examples, then start your
  own project.
- [Building a full module](guides/building-a-full-module.md) — your own
  tools + widget, the common case.
- [Architecture](concepts/architecture.md) — what a Miranum-style MCP server
  actually does at request time.

Wrapping an existing upstream MCP instead? See
[Building a UI-only module](guides/building-a-ui-only-module.md).

## Map

- **Concepts** — how the framework thinks. Read once.
  - [architecture](concepts/architecture.md) · [app-plugins](concepts/app-plugins.md) · [pipelines-and-steps](concepts/pipelines-and-steps.md) · [widgets](concepts/widgets.md) · [view-builder](concepts/view-builder.md) · [upstream-proxies](concepts/upstream-proxies.md) · [middleware](concepts/middleware.md)
- **Guides** — do a thing end-to-end.
  - [building-a-full-module](guides/building-a-full-module.md) · [building-a-ui-only-module](guides/building-a-ui-only-module.md) · [building-dashboards](guides/building-dashboards.md) · [using-tool-codegen](guides/using-tool-codegen.md) · [typed-call-tool-in-steps](guides/typed-call-tool-in-steps.md) · [registering-upstream-proxies](guides/registering-upstream-proxies.md) · [middleware-and-auth](guides/middleware-and-auth.md) · [layout-and-rendering](guides/layout-and-rendering.md) · [testing-with-examples](guides/testing-with-examples.md)
- **Reference** — every public export.
  - [api-core](reference/api-core.md) · [api-ui](reference/api-ui.md) · [api-proxy-contract](reference/api-proxy-contract.md) · [api-tool-codegen](reference/api-tool-codegen.md) · [env-vars](reference/env-vars.md)
- **Recipes** — small focused how-tos.
  - [adding-an-oauth2-upstream](recipes/adding-an-oauth2-upstream.md) · [role-based-module-access](recipes/role-based-module-access.md) · [multi-proxy-setup](recipes/multi-proxy-setup.md) · [debugging-pipeline-steps](recipes/debugging-pipeline-steps.md)

Every guide and recipe points back at runnable code in [`examples/`](../examples/).
