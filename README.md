# @miragon/mcp-toolkit

Shared framework runtime and UI primitives for MCP servers built on top of [mcp-use](https://github.com/mcp-use/mcp-use).

This monorepo ships two packages that are consumed by multiple MCP server projects (currently `miranum-ai` and `automation-mcp`):

| Package | Description |
|---------|-------------|
| [`@miragon/mcp-toolkit-core`](./packages/core) | Framework runtime: `AppPlugin` contract, `StepRegistry` / `WidgetRegistry`, pipeline executor, tool registrars, `renderView` + `getFrameworkManifest` helpers. No React, no DOM. |
| [`@miragon/mcp-toolkit-ui`](./packages/ui) | React UI: shadcn primitives, composite components, TanStack Query hooks, MCP App shell (`McpAppView` + `WidgetRenderer`) for bundling widgets into an `mcp-app.html` resource. |

## Usage

During early development, consume the packages via a relative `pnpm` workspace glob in the consumer's `pnpm-workspace.yaml`:

```yaml
packages:
  - "server"
  - "../mcp-toolkit/packages/*"
```

Once the toolkit API is stable, switch to git dependencies:

```json
{
  "dependencies": {
    "@miragon/mcp-toolkit-core": "github:miragon/mcp-toolkit#core-v0.1.0&path:/packages/core",
    "@miragon/mcp-toolkit-ui": "github:miragon/mcp-toolkit#ui-v0.1.0&path:/packages/ui"
  }
}
```

Each package carries a `prepare` script that compiles `src/` to `dist/` on install, so git dependencies work without committing build output.

## Build

```bash
pnpm install
pnpm -r run build
pnpm -r run typecheck
```
