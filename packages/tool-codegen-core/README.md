# @miragon/mcp-toolkit-tool-codegen-core

The framework-free runtime of the `tools.ts` that
[`@miragon/mcp-toolkit-tool-codegen`](https://www.npmjs.com/package/@miragon/mcp-toolkit-tool-codegen)
generates: the `ToolCaller` contract, the typed call the generated client is built on, the decoding
of tool results and `ToolCallError`. No React, no Node.js APIs, no dependencies: it runs in
Node.js, browsers and MCP Apps widgets.

## Install

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-core
```

## Usage

The generated client takes a `ToolCaller`; `toolCallerFromClient` makes one from the MCP SDK
client:

```ts
import { isToolCallError, toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createTasksClient } from "./generated/tools.js"

const client = new Client({ name: "tasks-script", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))
const tasks = createTasksClient(toolCallerFromClient(client))

try {
  const { tasks: open } = await tasks.listTasks({ done: false }) // typed input and output
  console.log(open.map((task) => task.title))
} catch (error) {
  if (!isToolCallError(error)) throw error // transport, protocol or abort
  console.log(error.message) // the tool answered isError: true, in its own words
}
```

## Requirements

- ESM only. The declarations name the global `AbortSignal`, so compile with the DOM library or
  `@types/node`.
- The same minor version as the generator that wrote `tools.ts`.
- `Client` from `@modelcontextprotocol/client`, the v2 SDK, fits `toolCallerFromClient` as it is.
  The v1 SDK's `Client` needs a
  [one-line adapter](https://miragon.github.io/mcp-toolkit/guides/call-tools#with-the-v1-sdk-client).

## Documentation

- [Call tools from Node and the browser](https://miragon.github.io/mcp-toolkit/guides/call-tools):
  other callers (MCP Apps widgets, test fakes), errors, cancelling and hand-written tool maps.
- [Core API](https://miragon.github.io/mcp-toolkit/reference/core): every export, including the
  [parse rules](https://miragon.github.io/mcp-toolkit/reference/core#parsetoolresult) that turn
  text such as `"2.10"` into a number.
