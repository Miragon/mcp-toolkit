# Miranum MCP toolkit

Framework for building MCP servers that expose **tools + widgets + pipeline
steps** to an LLM client. Consumers compose it with their own modules and
deployment concerns. Every toolkit server is self-contained; aggregating
several MCP servers into one surface is an external MCP gateway's job
(e.g. [agentgateway](https://agentgateway.dev)) — see
[architecture](concepts/architecture.md).

## Packages

| Package                             | Purpose                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@miragon/mcp-toolkit-core`         | Plugin contract, step/widget registries, pipeline executor, framework-tool registrars, middleware helpers, `createFrameworkApp` factory.      |
| `@miragon/mcp-toolkit-ui`           | React widget shell (`McpToolkitApp` / `McpAppView`) with host auto-sizing, shadcn primitives, composed components, typed `useToolQuery` hook. |
| `@miragon/mcp-toolkit-tool-codegen` | Build-time codegen (`mcp-tool-codegen` CLI) that turns an MCP server's `tools/list` into typed TS + typed React Query hooks.                  |

## Start here

- [Playground](playground/index.md) — the docs, but clickable: a hosted
  toolkit server with a guided tour through tools → widgets → composed views →
  pipelines → builder. Zero install.
- [Getting started](getting-started.md) — run the examples, then start your
  own project.
- [Architecture](concepts/architecture.md) — what a Miranum-style MCP server
  actually does at request time.

## Map

- **Concepts** — how the framework thinks. Read once.
  - [architecture](concepts/architecture.md) · [app-plugins](concepts/app-plugins.md) · [pipelines-and-steps](concepts/pipelines-and-steps.md) · [widgets](concepts/widgets.md) · [view-builder](concepts/view-builder.md) · [middleware](concepts/middleware.md) · [host-portability](concepts/host-portability.md) · [layered-adoption](concepts/layered-adoption.md)
- **Guides** — do a thing end-to-end.
  - [migrating-to-mcp-use-2](guides/migrating-to-mcp-use-2.md) · [building-dashboards](guides/building-dashboards.md) · [using-tool-codegen](guides/using-tool-codegen.md) · [typed-call-tool-in-steps](guides/typed-call-tool-in-steps.md) · [middleware-and-auth](guides/middleware-and-auth.md) · [layout-and-rendering](guides/layout-and-rendering.md) · [developing-widgets-in-isolation](guides/developing-widgets-in-isolation.md) · [white-labeling](guides/white-labeling.md) · [testing-with-examples](guides/testing-with-examples.md)
- **Reference** — every public export.
  - [api-core](reference/api-core.md) · [api-ui](reference/api-ui.md) · [api-tool-codegen](reference/api-tool-codegen.md) · [components](reference/components.md) · [env-vars](reference/env-vars.md)
- **Recipes** — small focused how-tos.
  - [debugging-pipeline-steps](recipes/debugging-pipeline-steps.md)

Every guide and recipe points back at runnable code in [`examples/`](../examples/).
