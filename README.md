# mcp-toolkit

A collection of TypeScript libraries that support building MCP servers. Today it holds
tool-codegen, for typed calls to an MCP server's tools from Node.js, browsers and MCP Apps
widgets: a build-time CLI that reads an MCP server's
`tools/list` and writes typed TypeScript, with a framework-free runtime for the generated client
and a React runtime for the generated hooks. An unknown tool name or a wrong argument fails to
compile, and the generator treats everything the server sends as untrusted.

**Documentation: <https://miragon.github.io/mcp-toolkit/>**

| Package                                                                    | What it is                                                                                                                          | Install as                                                                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`@miragon/mcp-toolkit-tool-codegen`](./packages/tool-codegen)             | The `mcp-tool-codegen` CLI and generator (Node.js): `tools/list` to `tools.ts` and, with `react: true`, `hooks.tsx`                 | dev dependency                                                                                                     |
| [`@miragon/mcp-toolkit-tool-codegen-core`](./packages/tool-codegen-core)   | Runtime of `tools.ts`: the `ToolCaller` contract, typed calls, result parsing, `ToolCallError`. Node.js, browsers, MCP Apps widgets | dependency, no dependencies of its own                                                                             |
| [`@miragon/mcp-toolkit-tool-codegen-react`](./packages/tool-codegen-react) | Runtime of `hooks.tsx`: `ToolCallerProvider`, `useToolQuery` and `useToolMutation` on TanStack Query                                | dependency, peers `react` 18 or 19, `@tanstack/react-query` `^5.48` and the core package of the same minor version |

[`examples/tasks`](./examples/tasks) runs the whole chain on one small MCP server: codegen, the
typed client in Node.js, the hooks in a Vite React app, and a test as the drift gate.

## Example

Install the generator and the runtime, and point a config at your server:

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen@3
pnpm add @miragon/mcp-toolkit-tool-codegen-core@3 @modelcontextprotocol/client
```

```ts
// codegen.config.ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  name: "tasks", // names TasksToolMap, createTasksClient and the hooks
  url: "http://localhost:4000/mcp", // the server's streamable HTTP endpoint
  out: "./src/generated", // resolved against this file's directory
}

export default config
```

Node.js loads a `.ts` config from 22.18 on; for older versions or a CommonJS package, see
[Generate typed tools](https://miragon.github.io/mcp-toolkit/guides/generate#load-the-config-on-older-nodejs-or-in-commonjs).

`generate` reads the server's `tools/list` and writes `src/generated/tools.ts`:

```sh
pnpm exec mcp-tool-codegen generate
```

The generated client takes a `ToolCaller`, here made from the MCP SDK client:

```ts
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createTasksClient } from "./generated/tools.js"

const client = new Client({ name: "tasks-script", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))

const tasks = createTasksClient(toolCallerFromClient(client))
const { tasks: open } = await tasks.listTasks({ done: false }) // typed input and output
```

## Documentation

- [Getting started](https://miragon.github.io/mcp-toolkit/getting-started): generate for the
  example server, make a first typed call and let the compiler catch a wrong argument.
- Guides: [Generate typed tools](https://miragon.github.io/mcp-toolkit/guides/generate),
  [Keep generated code in sync](https://miragon.github.io/mcp-toolkit/guides/check-in-ci),
  [Call tools from Node and the browser](https://miragon.github.io/mcp-toolkit/guides/call-tools)
  and [Use the React hooks](https://miragon.github.io/mcp-toolkit/guides/react-hooks).
- Reference: [Configuration](https://miragon.github.io/mcp-toolkit/reference/configuration),
  [CLI](https://miragon.github.io/mcp-toolkit/reference/cli),
  [Generated code](https://miragon.github.io/mcp-toolkit/reference/generated-code),
  [Core API](https://miragon.github.io/mcp-toolkit/reference/core),
  [React API](https://miragon.github.io/mcp-toolkit/reference/react) and
  [Guarantees and limits](https://miragon.github.io/mcp-toolkit/guarantees).

## Migrating from 2.x

3.0 keeps only the code generator and its two runtime packages. `@miragon/mcp-toolkit-core` and
`@miragon/mcp-toolkit-ui` are no longer developed here; their 2.x versions stay on npm. In the
generator, `proxyName` is now `name` and `upstreamUrl` is now `url`, `out` resolves against the
config file's directory instead of the working directory, the tool map and `overrides` use the
server's own tool names, the runtime moved to `@miragon/mcp-toolkit-tool-codegen-core`, and
the hooks are opt-in on `@miragon/mcp-toolkit-tool-codegen-react`.
[Migrating from 2.x](https://miragon.github.io/mcp-toolkit/migrating-from-2x) walks through every
step, including the CLI flags and the renamed exports. The 2.x docs, including core and ui, are in
the repository at the tag [`v2.9.0`](https://github.com/Miragon/mcp-toolkit/tree/v2.9.0/docs).

## Contributing

We don't accept pull requests from outside the team; please
[open an issue](https://github.com/Miragon/mcp-toolkit/issues/new) for a bug or an idea.
[`CONTRIBUTING.md`](./CONTRIBUTING.md) has the setup, the checks a change passes and the release
flow.

## License

MIT, see [`LICENSE`](./LICENSE).
