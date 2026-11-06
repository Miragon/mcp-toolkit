# @miragon/mcp-toolkit-tool-codegen-core

The framework-free runtime of typed MCP tool calls: the `ToolCaller` contract, the typed call the
generated client is built on, and the decoding of tool results. No React, no Node APIs, no
dependencies: it runs in browsers, MCP Apps widgets and Node.

[`@miragon/mcp-toolkit-tool-codegen`](https://github.com/Miragon/mcp-toolkit/tree/main/packages/tool-codegen)
generates a typed client from an MCP server's `tools/list`;
[`@miragon/mcp-toolkit-tool-codegen-react`](https://github.com/Miragon/mcp-toolkit/tree/main/packages/tool-codegen-react)
adds TanStack Query hooks on top.

## Install

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-core
pnpm add -D @miragon/mcp-toolkit-tool-codegen
```

ESM only. The declarations name the global `AbortSignal`, so compile with the DOM library or
`@types/node`.

## The ToolCaller contract

Everything runs on one function that calls a tool by name:

```ts
type ToolCaller = (
  name: string,
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<ToolCallResult> // { content?, structuredContent?, isError? }
```

- It resolves with the tool's raw result; an MCP `CallToolResult` fits as it is.
- A tool that reports a failure resolves with `isError: true`. Only a transport or protocol failure
  rejects.
- It hands `options.signal` to the transport, so an aborted signal cancels the request.

An MCP client, a widget host bridge or a test fake can be a `ToolCaller`.

## Typed calls

The generated `tools.ts` holds the tool map and a client factory. For a config with
`name: "tasks"`:

```ts
import { createTasksClient } from "./generated/tools.js"

const tasks = createTasksClient(callTool)
const { tasks: open } = await tasks.listTasks({ done: false }) // typed input and output
await tasks.call("add-task", { title: "Write the README" }) // the same, by tool name
```

`createTypedCallTool` is what the client is built on, and it takes a hand-written map just as well:

```ts
import { createTypedCallTool } from "@miragon/mcp-toolkit-tool-codegen-core"

interface Task {
  id: string
  title: string
  done: boolean
}

interface TasksToolMap {
  "list-tasks": { input: { done?: boolean }; output: { tasks: Task[] } }
  "add-task": { input: { title: string }; output: Task }
}

const call = createTypedCallTool<TasksToolMap>(callTool)
await call("list-tasks", {}) // Promise<{ tasks: Task[] }>
await call("list_tasks", {}) // compile error: no tool of the map
await call("add-task", {}) // compile error: title is missing
```

`TMap extends ToolMapOf<TMap>` takes a map whose entries are `{ input; output }` and rejects a map
with an index signature (`Record<string, ToolShape>`, or an interface extending it as 2.x
generated): its key type would be `string`, and a misspelled tool name would compile. The output
type is what the map claims, not a runtime validation. Pass the tool name as a literal: with a union
of names (`which: "a" | "b"`) the args are typed as the union of both inputs, TypeScript's
correlated-union limit; the generated client's methods always pass a literal.

## With the MCP SDK client

With the MCP SDK v2 client, `@modelcontextprotocol/client`:

```ts
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"

const client = new Client({ name: "tasks-script", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))

const tasks = createTasksClient(toolCallerFromClient(client))
```

`toolCallerFromClient` maps each call onto `client.callTool({ name, arguments }, { signal })`. It
takes any object of that shape (`McpClientLike`), so this package does not depend on the SDK.

The v1 SDK's `Client` (`@modelcontextprotocol/sdk`) takes a result schema before the options, so
it does not fit `McpClientLike` (TypeScript rejects it). Its result type also includes a legacy
`{ toolResult }` shape that a current server never sends. Adapt it in one line:

```ts
import type { ToolCaller, ToolCallResult } from "@miragon/mcp-toolkit-tool-codegen-core"

const callTool: ToolCaller = (name, args, options) =>
  client.callTool({ name, arguments: args }, undefined, options) as Promise<ToolCallResult>
```

## In an MCP Apps widget

A widget calls its server through the host. Wrap what the host offers into a `ToolCaller`, for
example `App` from `@modelcontextprotocol/ext-apps`:

```ts
import { App } from "@modelcontextprotocol/ext-apps"
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"

const app = new App({ name: "tasks-widget", version: "1.0.0" })
await app.connect()

const callTool: ToolCaller = (name, args, options) =>
  app.callServerTool({ name, arguments: args }, options)
const tasks = createTasksClient(callTool)
```

## Errors

A typed call rejects with

- a `ToolCallError` when the tool ran and answered `isError: true`. `toolName` names the tool,
  `result` is the raw result and `message` its text content (text blocks joined by newlines, then
  trimmed), or `Tool "<name>" reported an error` when it has none;
- the caller's own error, unchanged, for anything else: transport, protocol, abort.

```ts
import { isToolCallError } from "@miragon/mcp-toolkit-tool-codegen-core"

try {
  await tasks.addTask({ title: "" })
} catch (error) {
  if (!isToolCallError(error)) throw error
  showMessage(error.message) // the tool's own words
}
```

`isToolCallError` also recognises a `ToolCallError` from another copy of this package in the same
bundle, which `instanceof` does not.

## Parse rules

`parseToolResult(toolName, result, options?)` decodes every typed call's result:

1. `isError: true` throws a `ToolCallError`.
2. `structuredContent`, when not `undefined`, is the output as it is (also `null`, `0`, `false`,
   `""`).
3. Otherwise the first text block (`{ type: "text", text }`, other blocks skipped): its JSON
   value, or the string itself when it is not JSON.
4. No text block: `undefined`.

Rule 3 changes the type of text that happens to be JSON: `"2.10"` becomes the number `2.1`,
`"true"` the boolean `true`, and an id of 20 digits loses its last ones. The typed calls always
apply it, so give a tool that answers plain text an `outputSchema` and `structuredContent`, or
decode it yourself: `parseToolResult(name, await callTool(name, args), { text: "raw" })` keeps the
text as it is (rules 1, 2 and 4 hold as before).
