# @miragon/mcp-toolkit-tool-codegen

Build-time codegen for typed MCP tool calls. The `mcp-tool-codegen` CLI reads an MCP server's
`tools/list` and writes TypeScript: an input and an output type per tool, a tool map keyed by the
server's own tool names, a typed client and, with `react: true`, React hooks. An unknown tool name
or a wrong argument fails to compile. The generated `tools.ts` imports
[`@miragon/mcp-toolkit-tool-codegen-core`](https://www.npmjs.com/package/@miragon/mcp-toolkit-tool-codegen-core),
the hooks [`@miragon/mcp-toolkit-tool-codegen-react`](https://www.npmjs.com/package/@miragon/mcp-toolkit-tool-codegen-react).
Everything the server sends is treated as untrusted input.

## Install

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen
pnpm add @miragon/mcp-toolkit-tool-codegen-core
```

## Usage

Point `codegen.config.ts`, the file the CLI reads by default, at your server:

```ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  name: "tasks", // names TasksToolMap, createTasksClient and the hooks
  url: "http://localhost:4000/mcp", // the server's streamable HTTP endpoint
  out: "./src/generated", // resolved against this file's directory
}

export default config
```

```sh
pnpm exec mcp-tool-codegen generate          # writes src/generated/tools.ts
pnpm exec mcp-tool-codegen generate --check  # exits 1 when the committed files drift (for CI)
```

Commit the generated files. `createTasksClient` from `tools.ts` then takes a `ToolCaller`, for
example `toolCallerFromClient(client)` from the core package over a connected MCP SDK client.

## Requirements

- Node.js 20 or newer for the CLI. A `.ts` config needs Node.js 22.18 or newer; on older versions
  use a `.mjs` config, and in a `"type": "commonjs"` package name it `codegen.config.mts` and pass
  `--config codegen.config.mts`.
- An MCP server that answers over streamable HTTP.
- The generator, the core and the React package on the same minor version: the generator writes
  code against the runtime of its own release and declares both as optional peers.

## Documentation

- [Generate typed tools](https://miragon.github.io/mcp-toolkit/guides/generate): React hooks,
  overrides and auth for your own server.
- [Keep generated code in sync](https://miragon.github.io/mcp-toolkit/guides/check-in-ci): the
  drift check in CI.
- Reference: [Configuration](https://miragon.github.io/mcp-toolkit/reference/configuration),
  [CLI](https://miragon.github.io/mcp-toolkit/reference/cli) (with the programmatic API),
  [Generated code](https://miragon.github.io/mcp-toolkit/reference/generated-code) and
  [Guarantees and limits](https://miragon.github.io/mcp-toolkit/guarantees).

## Migrating from 2.x

3.0 renames the config keys (`proxyName` is now `name`, `upstreamUrl` is now `url`), resolves `out`
against the config file's directory instead of the working directory, keys the tool map and
`overrides` by the server's own tool names, moves the runtime from
`@miragon/mcp-toolkit-tool-codegen/runtime` to `@miragon/mcp-toolkit-tool-codegen-core` and makes
the hooks opt-in on `@miragon/mcp-toolkit-tool-codegen-react`.
[Migrating from 2.x](https://miragon.github.io/mcp-toolkit/migrating-from-2x) lists every step,
including the CLI flags, the renamed exports and the `QueryClient` defaults 2.x set.
