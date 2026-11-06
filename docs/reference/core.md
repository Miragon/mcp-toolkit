# Core API

Every export of `@miragon/mcp-toolkit-tool-codegen-core`, the runtime of the generated `tools.ts`:
what it takes, what it returns and how it fails.

<dl class="facts">
  <dt>Package</dt>
  <dd><code>@miragon/mcp-toolkit-tool-codegen-core</code></dd>
  <dt>Install</dt>
  <dd><code>pnpm add @miragon/mcp-toolkit-tool-codegen-core@3</code></dd>
  <dt>Imported by</dt>
  <dd>the generated <code>tools.ts</code> and <code>@miragon/mcp-toolkit-tool-codegen-react</code></dd>
  <dt>Runs in</dt>
  <dd>Node, browsers and MCP Apps widgets: no React, no Node APIs, no dependencies</dd>
  <dt>Module</dt>
  <dd>ESM only. The declarations name the global <code>AbortSignal</code>: compile with the DOM library or <code>@types/node</code>.</dd>
</dl>

## Exports

| Export                                              | Kind     | What it is                                               |
| --------------------------------------------------- | -------- | -------------------------------------------------------- |
| [`createTypedCallTool`](#createtypedcalltool)       | function | types a `ToolCaller` by a tool map                       |
| [`toolCallerFromClient`](#toolcallerfromclient)     | function | a `ToolCaller` over an MCP SDK client                    |
| [`parseToolResult`](#parsetoolresult)               | function | decodes a tool result into the tool's output             |
| [`isToolCallError`](#istoolcallerror)               | function | `true` for a `ToolCallError`, also one from another copy |
| [`ToolCallError`](#toolcallerror)                   | class    | the tool ran and answered `isError: true`                |
| [`ToolCaller`](#toolcaller)                         | type     | calls a tool by name and resolves with its raw result    |
| [`ToolCallResult`](#toolcallresult)                 | type     | the part of an MCP `CallToolResult` the runtime reads    |
| [`ToolCallOptions`](#toolcalloptions)               | type     | the options of one call: signal, timeouts, progress      |
| [`ToolCallProgress`](#toolcallprogress)             | type     | one progress notification of a running call              |
| [`McpClientLike`](#mcpclientlike)                   | type     | the client shape `toolCallerFromClient` takes            |
| [`TypedCallTool`](#typedcalltool)                   | type     | a tool call typed by a tool map                          |
| [`ToolShape`](#toolshape)                           | type     | one entry of a tool map: `{ input; output }`             |
| [`ToolMapOf`](#toolmapof)                           | type     | the constraint every tool map meets                      |
| [`ToolName`](#toolname)                             | type     | the tool names of a map                                  |
| [`ToolInput`](#toolinput)                           | type     | the input of one tool of a map                           |
| [`ToolOutput`](#tooloutput)                         | type     | the output of one tool of a map                          |
| [`ParseToolResultOptions`](#parsetoolresultoptions) | type     | the options of `parseToolResult`: `text`                 |

## Functions

Each function lists its parameters, then what it returns, how it fails and what it leaves to you.

### `createTypedCallTool`

```ts
function createTypedCallTool<TMap extends ToolMapOf<TMap>>(
  callTool: ToolCaller,
): TypedCallTool<TMap>
```

| Parameter  | Type                        | Meaning                                                                            |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `TMap`     | type parameter              | the tool map, such as the generated `<Name>ToolMap`; see [`ToolMapOf`](#toolmapof) |
| `callTool` | [`ToolCaller`](#toolcaller) | the function every call goes through                                               |

- Returns a [`TypedCallTool<TMap>`](#typedcalltool). Each call passes its name, args and options to
  `callTool` as given and decodes the result with [`parseToolResult`](#parsetoolresult). The
  generated `create<Name>Client` is built on it: the client's `call` is this function.
- Rejects with a [`ToolCallError`](#toolcallerror) when the result has `isError: true`, and with
  whatever `callTool` threw or rejected with, unchanged, for anything else (transport, protocol,
  abort). A `callTool` that throws synchronously rejects the call too.
- Leaves the output unchecked at run time: its type is what the map claims.

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

### `toolCallerFromClient`

```ts
function toolCallerFromClient(client: McpClientLike): ToolCaller
```

| Parameter | Type                              | Meaning                                                                      |
| --------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `client`  | [`McpClientLike`](#mcpclientlike) | a connected MCP client, such as `Client` from `@modelcontextprotocol/client` |

- Returns a [`ToolCaller`](#toolcaller) that maps each call onto
  `client.callTool({ name, arguments: args }, options)`, the
  [`ToolCallOptions`](#toolcalloptions) handed on as given. They carry the SDK's own names, so the
  SDK implements the signal, the timeouts and the progress callback.
- Rejects with whatever `client.callTool` rejects with.
- Leaves connecting and closing the client to you. The package does not depend on the MCP SDK: any
  object of the shape fits.

```ts
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createTasksClient } from "./generated/tools.js"

const client = new Client({ name: "tasks-script", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))
const tasks = createTasksClient(toolCallerFromClient(client))
```

The v1 SDK's `Client` (`@modelcontextprotocol/sdk`) takes a result schema before the options and
does not fit `McpClientLike`; [Call tools from Node and the browser](../guides/call-tools.md) shows
the one-line adapter.

### `parseToolResult`

```ts
function parseToolResult<T = unknown>(
  toolName: string,
  result: ToolCallResult,
  options?: ParseToolResultOptions,
): T
```

| Parameter  | Type                                                | Meaning                                               |
| ---------- | --------------------------------------------------- | ----------------------------------------------------- |
| `T`        | type parameter                                      | the output the caller claims; not checked at run time |
| `toolName` | `string`                                            | the tool's name, for the `ToolCallError`              |
| `result`   | [`ToolCallResult`](#toolcallresult)                 | the raw result                                        |
| `options`  | [`ParseToolResultOptions`](#parsetoolresultoptions) | how to read a text block; default `{ text: "json" }`  |

- Returns the output by the first rule that applies:

  | #   | The result has                          | The output                                                                                                                   |
  | --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
  | 1   | `isError: true`                         | none: throws a `ToolCallError`                                                                                               |
  | 2   | `structuredContent` not `undefined`     | `structuredContent` as it is, also `null`, `0`, `false` or `""`                                                              |
  | 3   | a text block (`{ type: "text", text }`) | the first one, other blocks skipped: its JSON value, or the string when it is not JSON; with `text: "raw"` always the string |
  | 4   | no text block                           | `undefined`                                                                                                                  |

- Throws a [`ToolCallError`](#toolcallerror) by rule 1, and nothing else.
- Leaves plain text that happens to be JSON changed by rule 3. Every typed call applies it with the
  default `"json"`, and the generator has no option to change that; see
  [Guarantees and limits](../guarantees.md).

```ts
const text = (value: string) => ({ content: [{ type: "text", text: value }] })

parseToolResult("get-version", text("2.10")) // 2.1, a number
parseToolResult("get-version", text("2.10"), { text: "raw" }) // "2.10"
parseToolResult("get-version", text("Hello")) // "Hello": not JSON, so the string
parseToolResult("get-version", { content: [] }) // undefined
```

To keep a plain-text answer as it is, decode it yourself:
`parseToolResult<string>(name, await callTool(name, args), { text: "raw" })`.

### `isToolCallError`

```ts
function isToolCallError(error: unknown): error is ToolCallError
```

| Parameter | Type      | Meaning                   |
| --------- | --------- | ------------------------- |
| `error`   | `unknown` | what a call rejected with |

- Returns `true` for a [`ToolCallError`](#toolcallerror), also one thrown by another copy of this
  package in the same bundle or realm, where `instanceof` fails. It reads a brand under
  `Symbol.for("@miragon/mcp-toolkit-tool-codegen-core/ToolCallError")`.
- Never throws.
- Leaves every other error to you: it returns `false` for transport, protocol and abort errors.

## Classes

### `ToolCallError`

```ts
class ToolCallError extends Error {
  constructor(toolName: string, result: ToolCallResult)
  readonly name: "ToolCallError"
  readonly toolName: string
  readonly result: ToolCallResult
}
```

| Property   | Value                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | `"ToolCallError"`                                                                                                                 |
| `toolName` | the tool that answered                                                                                                            |
| `result`   | the raw result, `isError: true` included                                                                                          |
| `message`  | the texts of the result's text blocks, joined by line breaks and trimmed; without any text, `Tool "<toolName>" reported an error` |

[`parseToolResult`](#parsetoolresult) throws it, so every typed call and every hook rejects with it
when the tool ran and answered `isError: true`. A transport or protocol failure is never a
`ToolCallError`. Recognise one with [`isToolCallError`](#istoolcallerror) rather than `instanceof`:

```ts
import { isToolCallError } from "@miragon/mcp-toolkit-tool-codegen-core"

try {
  await tasks.getTask({ id: "task-404" })
} catch (error) {
  if (!isToolCallError(error)) throw error
  console.log(error.toolName) // "get-task"
  console.log(error.message) // 'No task with id "task-404".'
}
```

## Types

Each type shows its definition, then what it promises and where it is used.

### `ToolCaller`

```ts
type ToolCaller = (
  name: string,
  args: Record<string, unknown>,
  options?: ToolCallOptions,
) => Promise<ToolCallResult>
```

Calls the tool `name` with `args` and resolves with its raw result. A tool that reports a failure
resolves with `isError: true`; only a transport or protocol failure rejects. It hands `options` to
the transport, so an aborted signal cancels the request and a timeout fails it. A caller other than
`toolCallerFromClient` honours the options it supports.
[`toolCallerFromClient`](#toolcallerfromclient) makes one from an MCP client; a widget host bridge
or a test fake can be one too. [`createTypedCallTool`](#createtypedcalltool), the generated
`create<Name>Client` and the React package's `ToolCallerProvider` take it.

### `ToolCallResult`

```ts
interface ToolCallResult {
  content?: readonly unknown[]
  structuredContent?: unknown
  isError?: boolean
}
```

Structural, so the MCP SDK's `CallToolResult` and a widget host's tool result fit as they are.
[`parseToolResult`](#parsetoolresult) reads only these three fields.

### `ToolCallOptions`

```ts
interface ToolCallOptions {
  signal?: AbortSignal
  timeout?: number
  onprogress?: (progress: ToolCallProgress) => void
  resetTimeoutOnProgress?: boolean
  maxTotalTimeout?: number
}
```

The per-request options of the MCP SDK client (`RequestOptions` in `@modelcontextprotocol/client`),
by name and meaning. The runtime hands them to the caller untouched and reads none of them;
[`toolCallerFromClient`](#toolcallerfromclient) passes them to the SDK, which implements them.

| Option                   | Meaning                                                                                                        | SDK default |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------- |
| `signal`                 | Cancels the call.                                                                                              | none        |
| `timeout`                | Milliseconds to wait for the result; then the call rejects with `Request timed out`.                           | `60000`     |
| `onprogress`             | Receives each progress notification the server sends for this call. Setting it asks the server for them.       | none        |
| `resetTimeoutOnProgress` | Starts `timeout` again with every progress notification. Needs `onprogress`: without it the server sends none. | `false`     |
| `maxTotalTimeout`        | Milliseconds the call may take in all, progress or not; then it rejects with `Maximum total timeout exceeded`. | no limit    |

A tool that runs longer than a minute needs a `timeout`, or progress notifications with
`resetTimeoutOnProgress`; see
[Give a long call more time](../guides/call-tools.md#give-a-long-call-more-time).

### `ToolCallProgress`

```ts
interface ToolCallProgress {
  progress: number
  total?: number
  message?: string
}
```

One `notifications/progress` of a running call, as `onprogress` receives it: the progress so far,
which grows with every notification, the total when the server knows it, and a message when it
sends one.

### `McpClientLike`

```ts
interface McpClientLike {
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: ToolCallOptions,
  ): Promise<ToolCallResult>
}
```

The part of an MCP client [`toolCallerFromClient`](#toolcallerfromclient) uses. `Client` from
`@modelcontextprotocol/client`, the v2 SDK, fits as it is.

### `TypedCallTool`

```ts
type TypedCallTool<TMap extends ToolMapOf<TMap>> = <TName extends ToolName<TMap>>(
  name: TName,
  args: ToolInput<TMap, TName>,
  options?: ToolCallOptions,
) => Promise<ToolOutput<TMap, TName>>
```

The name picks the input the call takes and the output it resolves with. The generated
`<Name>CallTool` is `TypedCallTool<<Name>ToolMap>`. Pass a literal name: with a union of names
(`which: "a" | "b"`) the args are typed as the union of both inputs, so args that fit only one tool
compile for either (TypeScript's correlated-union limit). The generated client's methods always pass
a literal.

### `ToolShape`

```ts
interface ToolShape {
  input: unknown
  output: unknown
}
```

One entry of a tool map. Every entry of a map that meets [`ToolMapOf`](#toolmapof) is a `ToolShape`.

### `ToolMapOf`

```ts
type ToolMapOf<TMap> = string extends keyof TMap
  ? never
  : number extends keyof TMap
    ? never
    : { [K in keyof TMap]: ToolShape }
```

The constraint `TMap extends ToolMapOf<TMap>`: every entry a [`ToolShape`](#toolshape), and no index
signature. A map with a `string` or `number` index signature fails it, such as
`Record<string, ToolShape>` or an interface extending it, as 2.x generated: its key type would be
`string`, so a misspelled tool name would compile.

### `ToolName`

```ts
type ToolName<TMap> = keyof TMap & string
```

The tool names of a map. The generated `<Name>ToolName` is `keyof <Name>ToolMap`.

### `ToolInput`

```ts
type ToolInput<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>> = TMap[TName]["input"]
```

The input of the tool `TName`.

### `ToolOutput`

```ts
type ToolOutput<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>> = TMap[TName]["output"]
```

The output of the tool `TName`.

### `ParseToolResultOptions`

```ts
interface ParseToolResultOptions {
  text?: "json" | "raw"
}
```

| `text`             | A text block becomes                              |
| ------------------ | ------------------------------------------------- |
| `"json"` (default) | its JSON value, or the string when it is not JSON |
| `"raw"`            | always the string                                 |

Applies only to rule 3 of [`parseToolResult`](#parsetoolresult); rules 1, 2 and 4 hold either way.
Under `"json"`, `"2.10"` becomes the number `2.1`, `"true"` the boolean `true`, and digits beyond a
double's precision are lost.

## Next steps

- [React API](./react.md): the provider and the hooks built on this package.
- [Call tools from Node and the browser](../guides/call-tools.md): a `ToolCaller` for an MCP client,
  a widget host or a test.
- [Generated code](./generated-code.md): what `create<Name>Client` and the tool map look like.
