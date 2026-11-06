# Call tools from Node and the browser

Call your MCP server's tools with typed arguments and typed results: through the generated client
over an MCP client in Node and the browser, or through the host in an MCP Apps widget.

**Requirements:** a generated `tools.ts` ([Generate typed tools](./generate.md)); for the MCP SDK
client in Node, Node.js 22 or newer, the oldest line Node.js still supports.

::: tip
In a React app, the generated hooks make these calls for you:
[Use the React hooks](./react-hooks.md).
:::

The code on this page calls the server of
[`examples/tasks`](https://github.com/Miragon/mcp-toolkit/tree/main/examples/tasks). Its config has
`name: "tasks"`, so the client is `createTasksClient`, and its tools are `list-tasks`, `get-task`,
`add-task` and `complete-task`. To follow along, start the server with `pnpm serve` in
`examples/tasks` (on `http://localhost:4000/mcp`, Node.js 22.22.2 or newer) and save the scripts
there. A line `...` in an output stands for lines left out.

## 1. Install the core and an MCP client

The generated `tools.ts` imports the core package, and the MCP SDK v2 client connects to your server
(`examples/tasks` has both):

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-core@4 @modelcontextprotocol/client
```

Keep the core on the same minor version as the generator that wrote `tools.ts`. The core has no
dependencies and is ESM only; its declarations name the global `AbortSignal`, so compile with the
DOM library or `@types/node`. Both packages now show under `dependencies` in your `package.json`.

## 2. Turn the MCP client into a ToolCaller

Every call runs through a `ToolCaller`: one function that calls a tool by name and resolves with the
tool's raw result. `toolCallerFromClient` makes one from a connected MCP client. This script
connects and calls `list-tasks` without types:

```ts
// call.ts
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"

const client = new Client({ name: "tasks-script", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))
const callTool = toolCallerFromClient(client)

console.log(await callTool("list-tasks", {}))
await client.close()
```

`tsx` runs it (a dev dependency of `examples/tasks`; in your project, any TypeScript runner does):

```sh
pnpm exec tsx call.ts
```

```txt
{
  content: [ { type: 'text', text: '{"tasks":[]}' } ],
  structuredContent: { tasks: [] }
}
```

This is the MCP `CallToolResult` as the server sent it: the example server answers with
`structuredContent` and the same data as JSON text. A tool that fails resolves with `isError: true`;
only a transport or protocol failure rejects. `toolCallerFromClient` hands the name, the arguments
and the call's options (abort signal, timeouts, progress callback) to
`client.callTool({ name, arguments }, options)`. It takes any object with that method
(`McpClientLike`), so the core does not depend on the SDK.

## 3. Call tools through the typed client

`createTasksClient` from the generated `tools.ts` wraps the caller: one method per tool, typed by
the server's schemas, each result decoded. Replace the untyped call in `call.ts`:

```ts
// call.ts
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createTasksClient } from "./src/generated/tools.js"

const client = new Client({ name: "tasks-script", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))
const tasks = createTasksClient(toolCallerFromClient(client))

const added = await tasks.addTask({ title: "Write the release notes" })
console.log(added)
console.log(await tasks.call("complete-task", { id: added.id })) // the same, by tool name
const { tasks: all } = await tasks.listTasks() // no required property: the args may be left out
console.log(all)
await client.close()
```

Run it again:

```sh
pnpm exec tsx call.ts
```

```txt
{ id: 'task-1', title: 'Write the release notes', done: false }
{ id: 'task-1', title: 'Write the release notes', done: true }
[ { id: 'task-1', title: 'Write the release notes', done: true } ]
```

`added` is a `TasksAddTaskOutput`, `all` an array of tasks. The tool map behind the client has no
index signature, so a tool the server does not list, a misspelled name or wrong arguments fail to
compile:

```ts
await tasks.call("delete-task", { id: "task-1" }) // compile error: no such tool
await tasks.addTask({ name: "Write the README" }) // compile error: add-task takes a title
```

The output types are what the server's schemas claim, not a check at run time. Pass the tool name to
`call` as a literal: with a union of names, TypeScript types the arguments as the union of both
inputs.

## 4. Handle the tool's own errors

A tool that answers `isError: true` makes the typed call reject with a `ToolCallError`. Its
`message` is the tool's text (the text blocks joined by newlines and trimmed, or
`Tool "<name>" reported an error` when there are none), `toolName` names the tool and `result` holds
the raw result. Anything else, a transport, protocol or abort error, rejects with the caller's own
error, unchanged.

Add `isToolCallError` to the core import of `call.ts`, and this block before `client.close()`:

```ts
try {
  await tasks.getTask({ id: "task-404" })
} catch (error) {
  if (!isToolCallError(error)) throw error
  console.log(`${error.toolName} failed: ${error.message}`)
}
```

The script now also prints the tool's error:

```sh
pnpm exec tsx call.ts
```

```txt
...
get-task failed: No task with id "task-404".
```

`isToolCallError` also recognises a `ToolCallError` from another copy of the core in the same
bundle, which `instanceof` does not. What a type cannot express ends up here too:
`tasks.addTask({ title: "" })` compiles, the example server's input validation rejects the empty
title, and the call rejects with a `ToolCallError` whose message reads
`Input validation error: Invalid arguments for tool add-task: title: Too small: expected string to have >=1 characters`.

## Cancel a call

Each method of the client takes options after its arguments (`call` takes them third), and the
caller hands them to the transport. `signal` cancels the call:

```ts
const { tasks: open } = await tasks.listTasks(
  { done: false },
  { signal: AbortSignal.timeout(5_000) },
)
```

A cancelled call rejects with the client's own error, never with a `ToolCallError`. The v2 SDK
client rejects with an `SdkError`:
`SdkError: TimeoutError: The operation was aborted due to timeout` when the timeout fires,
`SdkError: AbortError: This operation was aborted` for a signal you abort yourself.

## Give a long call more time

The MCP SDK fails a call after 60 seconds without a result, with `SdkError: Request timed out`. Give
a slow tool more with `timeout`, in milliseconds:

```ts
const { tasks: all } = await tasks.listTasks({}, { timeout: 300_000 })
```

A tool that reports progress can keep its call alive instead: `onprogress` asks the server for
progress notifications and receives each one, `resetTimeoutOnProgress` starts the timeout again
with each, and `maxTotalTimeout` caps how long progress can keep the call alive:

```ts
const { tasks: all } = await tasks.listTasks(
  {},
  {
    timeout: 30_000,
    resetTimeoutOnProgress: true,
    maxTotalTimeout: 600_000,
    onprogress: ({ progress, total, message }) => console.log(progress, total, message),
  },
)
```

The example server's tools answer at once and send no progress, so there `onprogress` never runs and
only `timeout` counts; a tool that reports progress (in mcp-use, `ctx.reportProgress`) has each step
logged. Once a call has run past `maxTotalTimeout`, its next progress notification rejects it with
`SdkError: Maximum total timeout exceeded`. The SDK checks the cap only then: without
`resetTimeoutOnProgress`, `timeout` alone limits the call. The options carry the SDK's own names
and meanings
([`ToolCallOptions`](../reference/core.md#toolcalloptions)); a caller other than
`toolCallerFromClient`, such as a widget host bridge, honours what it supports.

## In the browser

The same code runs in a browser. `examples/tasks` uses one connection function for Node and for its
React app:

```ts
// src/mcp-connection.ts
import { toolCallerFromClient, type ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"

export interface McpConnection {
  callTool: ToolCaller
  close(): Promise<void>
}

/** Connects to the MCP server at `url` (initialize handshake included). */
export async function connectMcp(url: URL, clientName: string): Promise<McpConnection> {
  const client = new Client({ name: clientName, version: "0.0.0" })
  await client.connect(new StreamableHTTPClientTransport(url))
  return { callTool: toolCallerFromClient(client), close: () => client.close() }
}
```

The React app connects to `/mcp` on its own origin: the Vite dev server proxies `/mcp` to the MCP
server (`vite.config.ts`), so the browser makes no cross-origin request. Close the client when you
no longer need it; the app does it on unmount (`src/react/mcp.ts`).

## In an MCP Apps widget

A widget calls its own server through the host, not through an MCP client of its own. Wrap what the
host offers into a `ToolCaller`, for example `App` from `@modelcontextprotocol/ext-apps`:

```ts
import { App } from "@modelcontextprotocol/ext-apps"
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { createTasksClient } from "./generated/tools.js"

const app = new App({ name: "tasks-widget", version: "1.0.0" })
await app.connect()

const callTool: ToolCaller = (name, args, options) =>
  app.callServerTool({ name, arguments: args }, options)
const tasks = createTasksClient(callTool)
```

A widget can call a tool only when the server makes it visible to apps; in mcp-use, a tool without
`visibility` is.

## With the v1 SDK client

The `Client` of the v1 SDK (`@modelcontextprotocol/sdk`) takes a result schema before the options,
so it does not fit `McpClientLike`, and TypeScript rejects it in `toolCallerFromClient`. Its result
type also includes a legacy `{ toolResult }` shape that a current server never sends. Adapt it in
one line:

```ts
import type { ToolCaller, ToolCallResult } from "@miragon/mcp-toolkit-tool-codegen-core"

const callTool: ToolCaller = (name, args, options) =>
  client.callTool({ name, arguments: args }, undefined, options) as Promise<ToolCallResult>
```

## With a fake in tests

A `ToolCaller` is a plain function, so a test of code that uses the client needs no server:

```ts
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { createTasksClient } from "./src/generated/tools.js"

const fake: ToolCaller = async (name, args) =>
  name === "add-task"
    ? { structuredContent: { id: "task-1", title: args.title, done: false } }
    : { isError: true, content: [{ type: "text", text: `Unexpected call of ${name}` }] }

const tasks = createTasksClient(fake)
```

## Without generated code

`createTasksClient` is built on `createTypedCallTool`, which takes a hand-written tool map just as
well. Each entry is `{ input; output }`. A map with an index signature fails the type constraint,
since a misspelled tool name would compile against it:

```ts
import { createTypedCallTool, type ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"

interface TasksMap {
  "list-tasks": { input: { done?: boolean }; output: { tasks: { id: string; title: string }[] } }
  "add-task": { input: { title: string }; output: { id: string; title: string } }
}

export async function openTasks(callTool: ToolCaller) {
  const call = createTypedCallTool<TasksMap>(callTool)
  const { tasks } = await call("list-tasks", { done: false })
  return tasks
}
```

## Decode a result yourself

The typed calls decode every result with `parseToolResult`. `isError: true` throws a
`ToolCallError`; `structuredContent`, when not `undefined`, is the output as it is; otherwise the
first text block gives its JSON value, or the text itself when it is not JSON; without a text block
the output is `undefined`. Text that happens to be JSON changes type on the way: `"2.10"` becomes
the number `2.1`, `"true"` the boolean `true`, and an id of 20 digits loses its last ones.

Give a tool that answers plain text an `outputSchema` and `structuredContent`, or call it through
the raw caller and decode the result with `{ text: "raw" }`:

```ts
// parse.ts
import { parseToolResult } from "@miragon/mcp-toolkit-tool-codegen-core"

const result = { content: [{ type: "text", text: "2.10" }] } // what a plain-text tool answers
console.log(parseToolResult("get-version", result))
console.log(parseToolResult("get-version", result, { text: "raw" }))
```

`tsx` prints both readings:

```sh
pnpm exec tsx parse.ts
```

```txt
2.1
2.10
```

With your caller, that is `parseToolResult(name, await callTool(name, args), { text: "raw" })`. The
other rules hold as before: `isError: true` still throws, and `structuredContent` still comes first.

## Next steps

- [Use the React hooks](./react-hooks.md): the same calls as cached TanStack queries and mutations.
- [Core API](../reference/core.md): every export of the core package and its types.
- [Generated code](../reference/generated-code.md): what `tools.ts` holds and how tool names become
  method names.
