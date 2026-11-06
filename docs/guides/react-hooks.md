# Use the React hooks

Read and write your server's tools from React components with the generated query and mutation
hooks, cached, deduplicated and refetched by TanStack Query.

**Requirements:** a codegen config and a generated `tools.ts`
([Generate typed tools](./generate.md)), React 18 or 19, TanStack Query 5 from 5.48 on.

The code on this page comes from the Vite app in
[`examples/tasks/src/react`](https://github.com/Miragon/mcp-toolkit/tree/main/examples/tasks/src/react).
It runs on the server of `examples/tasks`, whose config has `name: "tasks"` and whose tools are
`list-tasks`, `get-task`, `add-task` and `complete-task`. The hooks call tools through a
`ToolCaller`, the function described in [Call tools from Node and the browser](./call-tools.md).

## 1. Install the React package

The generated `hooks.tsx` imports the React package, which runs on TanStack Query and the core
package:

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-react@3 @miragon/mcp-toolkit-tool-codegen-core@3 @tanstack/react-query
```

The React package's peers are `react` `^18 || ^19`, `@tanstack/react-query` `^5.48` (the first
release whose `enabled` takes a function) and the core of the same minor version. Keep the generator
on that minor version too. The three packages now show under `dependencies` in your `package.json`.

## 2. Generate the hooks

Set `react: true` in your codegen config:

```ts
// codegen.config.ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  name: "tasks",
  url: "http://localhost:4000/mcp",
  out: "./src/generated",
  react: true,
}

export default config
```

Generate again with `pnpm exec mcp-tool-codegen generate`. It now reports
`generated 4 tools: tools.ts, hooks.tsx in` and your `out` folder. `hooks.tsx` holds one hook per
tool, named after the config's `name` and the tool, and the query key function `tasksQueryKey`:

```sh
grep "^export function" src/generated/hooks.tsx
```

```txt
export function tasksQueryKey<TName extends TasksToolName>(
export function useTasksAddTaskMutation<TOnMutateResult = unknown>(
export function useTasksCompleteTaskMutation<TOnMutateResult = unknown>(
export function useTasksGetTaskQuery<TSelected = TasksGetTaskOutput>(
export function useTasksListTasksQuery<TSelected = TasksListTasksOutput>(
```

`list-tasks` and `get-task` are annotated `readOnlyHint: true` and get query hooks. Every other tool
gets a mutation hook, since a query runs its tool again on every mount, focus and invalidation. The
config's `overrides` can pick the hook for a tool ([Configuration](../reference/configuration.md)).

## 3. Show a list with a query hook

The app brings its own `QueryClientProvider`; the hooks only need a caller on top of it:

```tsx
// src/react/main.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"

const root = document.getElementById("root")
if (root === null) throw new Error("index.html has no #root element")

// The app brings its own QueryClient; the generated hooks only need the caller on top of it.
const queryClient = new QueryClient()

// Same origin: the Vite dev server proxies /mcp to the MCP server (vite.config.ts).
const mcpUrl = new URL("/mcp", location.origin).href

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App mcpUrl={mcpUrl} />
    </QueryClientProvider>
  </StrictMode>,
)
```

`ToolCallerProvider` supplies the caller. In the example, `useMcpConnection` (`src/react/mcp.ts`)
connects an MCP SDK client while the app is mounted. Until the handshake is done there is no caller
yet, and the provider gets `null`:

```tsx
// src/react/App.tsx (abridged)
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { useTasksListTasksQuery } from "../generated/hooks.js"
import { useMcpConnection } from "./mcp.js"

export function App({ mcpUrl }: { mcpUrl: string }) {
  const connection = useMcpConnection(mcpUrl)
  if (connection.state === "failed") {
    return <p role="alert">Cannot reach the MCP server: {connection.error.message}</p>
  }
  return (
    // Until the handshake is done the caller is null, and the hooks wait for it.
    <ToolCallerProvider callTool={connection.state === "connected" ? connection.callTool : null}>
      <TaskList />
    </ToolCallerProvider>
  )
}

function TaskList() {
  const list = useTasksListTasksQuery()

  if (list.isPending) return <p>Loading tasks…</p>
  if (list.isError) return <p role="alert">Could not load the tasks: {list.error.message}</p>
  if (list.data.tasks.length === 0) return <p>No tasks yet.</p>
  return (
    <ul>
      {list.data.tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  )
}
```

Start the server and the app in `examples/tasks`, each in its own terminal:

```sh
pnpm serve   # the MCP server on http://localhost:4000/mcp
pnpm dev     # the React app on http://localhost:5173
```

Open `http://localhost:5173`: the list says `Loading tasks…` while the client connects, then
`No tasks yet.`

While the caller is `null`, a query waits with `status: "pending"` and `fetchStatus: "idle"`, and it
starts once the caller arrives. Swapping one caller for another refetches nothing: the cache belongs
to the `QueryClient`. A query hook takes the tool's arguments (left out here, since `list-tasks` has
no required property) and then every `useQuery` option except `queryKey` and `queryFn`, and returns
TanStack's `UseQueryResult`. With `select`, the hook infers the type of `data`:
`useTasksListTasksQuery({ done: false }, { select: (data) => data.tasks.length })` gives a number.
`enabled` applies on top of waiting for the caller. TanStack's abort signal goes to the caller, so a
query that unmounts mid-call cancels the request. `callOptions` give the call a timeout or a
progress callback, `useTasksListTasksQuery({}, { callOptions: { timeout: 120_000 } })`; see
[Give a long call more time](./call-tools.md#give-a-long-call-more-time). A call that runs past its
timeout fails the query without a retry, see [Handle errors](#handle-errors).

## 4. Add a task with a mutation hook

A mutation hook runs its tool on `mutate(args)`. After a success it invalidates every query of its
namespace, here `tasks`, so the list refetches by itself. The form goes into the
`ToolCallerProvider` next to `<TaskList />`:

```tsx
// src/react/App.tsx
import { useToolCaller } from "@miragon/mcp-toolkit-tool-codegen-react"
import { useState, type FormEvent } from "react"
import { useTasksAddTaskMutation } from "../generated/hooks.js"

function AddTaskForm() {
  const [title, setTitle] = useState("")
  const connected = useToolCaller() !== null
  // On success the hook invalidates every "tasks" query, so the list refetches by itself.
  const addTask = useTasksAddTaskMutation({ onSuccess: () => setTitle("") })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    addTask.mutate({ title: title.trim() })
  }

  return (
    <form onSubmit={submit}>
      <label>
        New task
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <button type="submit" disabled={!connected || addTask.isPending || title.trim() === ""}>
        Add task
      </button>
      {addTask.isError && <p role="alert">Could not add the task: {addTask.error.message}</p>}
    </form>
  )
}
```

Type a title and press **Add task**: the task shows up in the list, and the field is empty again.

The hook takes every `useMutation` option except `mutationFn`, plus `invalidates` and
`callOptions` (the call options of every `mutate`, a `signal` included), and returns TanStack's
`UseMutationResult`. For a tool whose input has no required property, `mutate()` sends `{}`.
`useToolCaller()` returns `null` while the provider has no caller; the form disables its button
with it, because a mutation without a caller rejects with a `NoToolCallerError`.

## Invalidate only what changed

`invalidates` names the queries a successful mutation invalidates. TanStack refetches the
invalidated queries on screen and marks the others stale.

| `invalidates`                    | Invalidated                                   | The mutation settles              |
| -------------------------------- | --------------------------------------------- | --------------------------------- |
| not set                          | `[namespace]`: every query of the same server | without waiting for the refetches |
| `false`                          | nothing                                       | at once                           |
| `[["tasks", "list-tasks"], ...]` | every query under one of the key prefixes     | once those queries refetched      |

```tsx
const completeTask = useTasksCompleteTaskMutation({
  invalidates: [["tasks", "list-tasks"]],
  onSuccess: (task) => showMessage(`${task.title} is done`),
})
```

Each prefix is a namespace, then optionally one of the map's tool names (a misspelled tool fails to
compile) and more. Another server's tool cannot be named that way; invalidate it in `onSuccess` with
the `QueryClient`. The invalidation starts first, then your own `onSuccess` runs. With an explicit
`invalidates`, `isPending` stays `true` until those queries on screen have refetched, so when
`mutateAsync` resolves they already show the new state. The default invalidation is not awaited: one
query of the server that fails at the transport would otherwise hold the mutation pending through
all its retries.

## Read and write the cache

A query is cached under `[namespace, tool, args]`. The generated `tasksQueryKey(tool, args)` builds
that key, typed by the tool map and tagged with the tool's output, so `getQueryData` and
`setQueryData` know the data's type:

```tsx
const queryClient = useQueryClient()

queryClient.setQueryData(tasksQueryKey("get-task", { id: task.id }), task) // task: TasksGetTaskOutput
await queryClient.invalidateQueries({ queryKey: ["tasks", "list-tasks"] }) // every list-tasks call
```

TanStack hashes keys by value, so arguments built anew on every render are fine. A key prefix you
write yourself, as for `invalidateQueries`, is a plain TanStack key and not checked.

An optimistic update writes the expected result into the cache before the tool answers and restores
the old data when it fails. The generated mutation hooks infer what `onMutate` returns, the context
`onError` and `onSettled` receive:

```tsx
const addTask = useTasksAddTaskMutation({
  onMutate: (args) => {
    const key = tasksQueryKey("list-tasks", {})
    const previous = queryClient.getQueryData(key) // TasksListTasksOutput | undefined
    queryClient.setQueryData(
      key,
      (old) => old && { tasks: [...old.tasks, { id: "new", ...args, done: false }] },
    )
    return { previous }
  },
  onError: (_error, _args, context) =>
    queryClient.setQueryData(tasksQueryKey("list-tasks", {}), context?.previous),
})
```

## Suspend or prefetch with toolQueryOptions

`toolQueryOptions(namespace, tool, args, { callTool, queryClient })` returns the options a query
hook runs with: the key, the call with TanStack's abort signal and the retry rule. A `callOptions`
entry in the last argument gives the call a timeout or a progress callback, as in a query hook.
Use it where TanStack takes options instead of a hook: `useSuspenseQuery`, `useQueries`,
`prefetchQuery` and `ensureQueryData`.

```tsx
import {
  toolQueryOptions,
  useToolCaller,
  type ToolQueryContext,
} from "@miragon/mcp-toolkit-tool-codegen-react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import type { TasksToolMap } from "../generated/tools.js"

function Task({ id }: { id: string }) {
  const context = { callTool: useToolCaller("tasks"), queryClient: useQueryClient() }
  const { data } = useSuspenseQuery(
    toolQueryOptions<TasksToolMap, "get-task">("tasks", "get-task", { id }, context),
  )
  return <p>{data.title}</p>
}

// before a route renders, for example in a router loader:
const prefetchTask = (context: ToolQueryContext, id: string) =>
  context.queryClient.prefetchQuery(
    toolQueryOptions<TasksToolMap, "get-task">("tasks", "get-task", { id }, context),
  )
```

Name the tool map and the tool as type parameters, as the generated hooks do; the namespace is the
config's `name`. Unlike a query hook, these options do not wait for a caller: with `callTool: null`
the query fails with a `NoToolCallerError`, so run it once the provider has a caller.

## Connect several servers

Give each server's provider the namespace its hooks use, the config's `name`. A hook takes the
caller of the nearest provider naming its namespace, else that of the nearest provider without one.
So the providers nest in any order, and one component can use the hooks of both servers:

```tsx
<ToolCallerProvider namespace="tasks" callTool={tasksCaller}>
  <ToolCallerProvider namespace="billing" callTool={billingCaller}>
    <Dashboard />
  </ToolCallerProvider>
</ToolCallerProvider>
```

A provider without a namespace serves every namespace no provider names; with only that, a hook of
one server inside another server's provider would call the wrong server. Distinct namespaces also
keep the servers' queries apart in the one `QueryClient`, and a mutation's default invalidation
stays within its own server.

## In an MCP Apps widget

A widget calls its own server through the host. Wrap what the host offers into a `ToolCaller` and
hand it to the provider, `null` until the widget is connected. With `useApp` from
`@modelcontextprotocol/ext-apps/react`:

```tsx
import { useApp } from "@modelcontextprotocol/ext-apps/react"
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useMemo } from "react"

const queryClient = new QueryClient()

export function Widget() {
  const { app } = useApp({ appInfo: { name: "tasks-widget", version: "1.0.0" }, capabilities: {} })
  const callTool = useMemo<ToolCaller | null>(
    () => app && ((name, args, options) => app.callServerTool({ name, arguments: args }, options)),
    [app],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToolCallerProvider callTool={callTool}>
        <TaskList />
      </ToolCallerProvider>
    </QueryClientProvider>
  )
}
```

The queries in `TaskList` wait until the host connection stands and then run.

## Handle errors

A query's or a mutation's `error` is one of:

- a `ToolCallError` from the core package: the tool ran and answered `isError: true`. `message` is
  the tool's own text, `toolName` names the tool and `result` holds the raw result.
- a `NoToolCallerError`: a mutation ran, or a query was refetched by hand, while the provider had no
  caller. `toolName` names the tool; `isNoToolCallerError(error)` also recognises one from another
  copy of the React package.
- whatever the caller threw: a transport, protocol or abort error, unchanged.

```tsx
import { isToolCallError } from "@miragon/mcp-toolkit-tool-codegen-core"

const addTask = useTasksAddTaskMutation({
  onError: (error) => {
    if (isToolCallError(error)) showMessage(error.message) // the tool's own words
  },
})
```

A query without its own `retry` option never retries:

- a `ToolCallError`: asking the tool again gets the same answer.
- a `NoToolCallerError`: once a caller arrives, the query starts by itself.
- the MCP SDK's request timeout, `SdkError: Request timed out` or
  `SdkError: Maximum total timeout exceeded` (code `REQUEST_TIMEOUT`; the v1 SDK's `McpError` with
  code `-32001` and one of those two messages too): each retry would wait the whole timeout again,
  so a query with `callOptions: { timeout: 300_000 }` and TanStack's 3 retries would stay pending
  for about 20 minutes. An error the server sends with the code `-32001`, such as
  `Session not found`, is not a timeout and is retried.

Any other failure, such as a dropped connection, is retried as the `QueryClient` says for the
query's key (`setQueryDefaults`, then `defaultOptions.queries.retry`). When it says nothing, the
query keeps TanStack's own default: 3 retries in the browser, none on the server, such as a
prefetch for a server render.
A `retry` option on the query decides alone, for a `ToolCallError` and a timeout too. Mutations keep
TanStack's default: no retry.

## Troubleshooting

::: details `useToolCaller, useToolQuery and useToolMutation need a <ToolCallerProvider namespace="tasks"> (or one without a namespace) above them`
A hook rendered outside every `ToolCallerProvider` that serves its namespace. Render the provider
inside your `QueryClientProvider`, above every component that uses the hooks; with several servers,
give it the namespace the message names.
:::

::: details `No QueryClient set, use QueryClientProvider to set one`
TanStack Query throws this when a hook renders outside a `QueryClientProvider`. `ToolCallerProvider`
creates no `QueryClient`: render your own `QueryClientProvider` around it.
:::

::: details A query stays pending and never fetches
`status` stays `"pending"` and `fetchStatus` `"idle"` while the provider's `callTool` is `null` or
`undefined`, or while the query's `enabled` is `false`. Check that the connection finished and that
its caller reaches the provider.
:::

::: details `Cannot call tool "add-task": the ToolCallerProvider has no callTool yet`
A mutation ran before the provider had a caller, and rejected with a `NoToolCallerError`. Disable
the control until `useToolCaller()` returns a caller, as the form in
[step 4](#4-add-a-task-with-a-mutation-hook) does.
:::

## Next steps

- [React API](../reference/react.md): every export of the React package, its options and types.
- [Generated code](../reference/generated-code.md): how tool names become hook names and what
  `hooks.tsx` holds.
- [Keep generated code in sync](./check-in-ci.md): fail CI when the hooks no longer match the
  server's tools.
