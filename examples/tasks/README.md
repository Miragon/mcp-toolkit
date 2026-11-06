# Example: tasks

One small MCP server and the whole [tool-codegen](https://miragon.github.io/mcp-toolkit/) chain on
it:

1. `src/server.ts` is an [mcp-use](https://github.com/mcp-use/mcp-use) server with four task tools.
   Each declares an input and an output schema and answers with `structuredContent`; the read-only
   tools carry `readOnlyHint: true`.
2. `mcp-tool-codegen generate` reads its `tools/list` and writes `src/generated/tools.ts` (types, a
   tool map, a typed client) and `src/generated/hooks.tsx` (React hooks).
3. `src/node-client.ts` uses the typed client in Node, without React, over an MCP SDK client.
4. `src/react/` is a Vite app on the generated hooks: a query hook for the list, mutation hooks for
   adding and completing a task.
5. `test/` holds the drift gate (the committed files must equal a fresh generation) and runs the
   Node client and the React app against the real server.

## Files

| Path                           | What it is                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `src/store.ts`                 | The in-memory task list behind the server                                                                 |
| `src/server.ts`                | `createTasksServer()`; listens on `PORT` (default 4000) when run directly                                 |
| `codegen.config.ts`            | The codegen config: `name: "tasks"`, the server URL, `out`, `react: true`                                 |
| `src/generated/tools.ts`       | Generated, React-free: `TasksToolMap`, the input and output types, `createTasksClient`                    |
| `src/generated/hooks.tsx`      | Generated: `useTasksListTasksQuery`, `useTasksAddTaskMutation`, …, and the query key `tasksQueryKey`      |
| `src/mcp-connection.ts`        | `connectMcp(url, clientName)`: an MCP SDK client as a `ToolCaller`, the same code in Node and the browser |
| `src/node-client.ts`           | The typed client in Node, including a tool error                                                          |
| `src/react/mcp.ts`             | `useMcpConnection(url)`: the browser's connection, closed on unmount                                      |
| `src/react/App.tsx`            | `ToolCallerProvider` and the generated hooks: list, add form, complete                                    |
| `src/react/main.tsx`           | The entry: `QueryClientProvider` around the app                                                           |
| `index.html`, `vite.config.ts` | The Vite app; the dev server proxies `/mcp` to the MCP server                                             |
| `test/codegen.test.ts`         | The drift gate                                                                                            |
| `test/node-client.test.ts`     | The typed client end to end, plus compile-time checks of tool names and arguments                         |
| `test/react.test.tsx`          | The generated hooks and the app in happy-dom against the server                                           |
| `test/support/`                | The test servers: in process for the Node tests, a child process for the DOM tests                        |

## Run it

From a fresh clone, at the repository root:

```sh
pnpm install
pnpm build
```

Then in `examples/tasks`, start the server in one terminal:

```sh
pnpm serve   # the MCP server on http://localhost:4000/mcp
```

and use it from a second one:

```sh
pnpm generate         # rewrite src/generated from the running server
pnpm generate:check   # exit 1 when src/generated differs from a fresh generation
pnpm node-client      # add, complete, list and read tasks from Node
pnpm dev              # the React app on http://localhost:5173
```

On another port, give each command its address: `PORT=4001 pnpm serve`, `PORT=4001 pnpm dev` (the
dev server proxies `/mcp` to `127.0.0.1:$PORT`),
`TASKS_MCP_URL=http://localhost:4001/mcp pnpm node-client` and
`TASKS_MCP_URL=http://localhost:4001/mcp pnpm generate:check`. The drift check ignores the files'
`// Source:` line, which names the server's origin, so it passes on any port. `pnpm generate` on
another port changes only that line; to commit a regeneration, run it on port 4000 without
`TASKS_MCP_URL`. The script is `serve`, not `server`: `pnpm server` is pnpm's own store-server
command.

`pnpm test`, `pnpm typecheck` and `pnpm build` need no running server: the tests boot their own.
The example needs Node.js 22.22.2 or newer (mcp-use's minimum, declared in `engines`): on an older
Node.js, `pnpm serve` and `pnpm node-client` exit at once without a word, since
`import.meta.main` is undefined there. The CLI loads `codegen.config.ts` with Node's built-in type
stripping.

mcp-use sends anonymized usage telemetry when the server handles a request (not under the tests);
set `MCP_USE_ANONYMIZED_TELEMETRY=false` to turn it off, for example
`MCP_USE_ANONYMIZED_TELEMETRY=false pnpm serve`.

## The drift gate

The generated files are committed, so a change to the server's tools shows up as a diff in review.
`test/codegen.test.ts` boots `createTasksServer()` in the test process, generates from its
`tools/list` with the settings of `codegen.config.ts`, and compares the result with
`src/generated` as `generate --check` does: byte for byte, but the `// Source:` line. It needs no
running server, so it runs in CI with the other tests. When it fails, run `pnpm serve` and
`pnpm generate`, and commit the result.

## What the types catch

The tool map has no index signature, so a tool the server does not list, a misspelled name or wrong
arguments do not compile (`test/node-client.test.ts` pins this with `@ts-expect-error`):

```ts
await tasks.getTask({ id: "task-1" }) // Promise<TasksGetTaskOutput>
await tasks.call("delete-task", { id: "task-1" }) // compile error: no such tool
await tasks.addTask({ name: "Write the README" }) // compile error: add-task takes a title
```

What a TypeScript type cannot express arrives at run time: `add-task` with an empty title passes
the compiler, the server's input validation rejects it, and the call rejects with a
`ToolCallError`, like a tool that answers `isError` (`get-task` for an unknown id).

## Query or mutation

`list-tasks` and `get-task` are annotated `readOnlyHint: true` and get query hooks. `add-task` and
`complete-task` get mutation hooks; after a successful mutation every query of the `tasks`
namespace refetches, which is how the list in the app updates. A tool without `readOnlyHint: true`
always gets a mutation hook: a query re-runs its tool on every refetch. `overrides` in the config
can force either kind per tool. `tasksQueryKey(tool, args)` is the key a query caches under, typed
by the tool map, for the `QueryClient`'s `getQueryData` and `setQueryData`.

## Adapt it to your server

1. Copy `codegen.config.ts` and set `name` (it names the types, the client and the hooks), `url`
   (your server's streamable HTTP endpoint, without credentials) and `auth` if the server needs a
   token. Leave out `react: true` for `tools.ts` alone.
2. Give your tools an `outputSchema` and return `structuredContent`; without one the output type
   is `unknown`. Mark read-only tools with `readOnlyHint: true`.
3. Run `mcp-tool-codegen generate` and commit the output.
   [Keep a drift check](https://miragon.github.io/mcp-toolkit/guides/check-in-ci): either
   `mcp-tool-codegen generate --check` against a running server, or a test like
   `test/codegen.test.ts` that boots your server in process.
4. Install the runtime the generated code imports: `@miragon/mcp-toolkit-tool-codegen-core`, and
   for the hooks `@miragon/mcp-toolkit-tool-codegen-react` with `@tanstack/react-query` and `react`.
   The generator itself (`@miragon/mcp-toolkit-tool-codegen`) is a dev dependency.
5. Create a `ToolCaller` from whatever reaches your server (`connectMcp` here) and hand it to
   `create<Name>Client` or to `ToolCallerProvider`.

## In an MCP Apps widget

A widget calls its own server through the host, not through an MCP client of its own. The generated
code does not change: wrap what the host offers into a `ToolCaller`. With `useApp` from
`@modelcontextprotocol/ext-apps/react` in place of `useMcpConnection`:

```tsx
import { useApp } from "@modelcontextprotocol/ext-apps/react"
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useMemo } from "react"
import { useTasksListTasksQuery } from "./generated/hooks.js"

const queryClient = new QueryClient()

export function TasksWidget() {
  const { app } = useApp({ appInfo: { name: "tasks-widget", version: "1.0.0" }, capabilities: {} })
  // null until the host connection stands: the hooks wait for it, as they wait for connectMcp here.
  const callTool = useMemo<ToolCaller | null>(
    () => app && ((name, args, options) => app.callServerTool({ name, arguments: args }, options)),
    [app],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <ToolCallerProvider callTool={callTool}>
        <OpenTasks />
      </ToolCallerProvider>
    </QueryClientProvider>
  )
}

function OpenTasks() {
  const { data } = useTasksListTasksQuery({ done: false })
  return (
    <ul>
      {data?.tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  )
}
```

Without React, the same caller goes into the generated client:
`createTasksClient((name, args, options) => app.callServerTool({ name, arguments: args }, options))`.

A widget can call a tool only when the tool is visible to apps; mcp-use's default (no `visibility`)
is.
