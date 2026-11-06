# @miragon/mcp-toolkit-tool-codegen-react

React hooks for typed MCP tool calls, on TanStack Query v5. A tool call becomes a query
(`useToolQuery`) or a mutation (`useToolMutation`): cached, deduplicated, cancellable, with its input
and output types taken from a tool map. The generated hooks call these two hooks.

[`@miragon/mcp-toolkit-tool-codegen`](https://github.com/Miragon/mcp-toolkit/tree/main/packages/tool-codegen)
generates the tool map and, with `react: true`, the hooks from an MCP server's `tools/list`.
[`@miragon/mcp-toolkit-tool-codegen-core`](https://github.com/Miragon/mcp-toolkit/tree/main/packages/tool-codegen-core)
holds the framework-free part: the `ToolCaller` contract, typed calls and result parsing.

## Install

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-react @miragon/mcp-toolkit-tool-codegen-core @tanstack/react-query
pnpm add -D @miragon/mcp-toolkit-tool-codegen
```

Peer dependencies: `react` `^18 || ^19`, `@tanstack/react-query` `^5.48` (the first release whose
`enabled` takes a function) and `@miragon/mcp-toolkit-tool-codegen-core` of the same minor version
as this package. ESM only.

## Setup

The app brings its own `QueryClientProvider`. `ToolCallerProvider` only supplies the function the
hooks call tools with, a `ToolCaller` from the core package (the MCP SDK v2 client through
`toolCallerFromClient`, a widget host bridge, a test fake):

```tsx
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot } from "react-dom/client"

const queryClient = new QueryClient()
const callTool = toolCallerFromClient(client) // a connected @modelcontextprotocol/client Client

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ToolCallerProvider callTool={callTool}>
      <App />
    </ToolCallerProvider>
  </QueryClientProvider>,
)
```

`callTool` may be `null` or `undefined` while the connection is not ready yet. Queries then wait
(`status: "pending"`, `fetchStatus: "idle"`) and start once a caller arrives; a mutation rejects
with a `NoToolCallerError`. Swapping one caller for another does not refetch anything: the cache
belongs to the `QueryClient`.

## The generated hooks

With `react: true` in the codegen config, `hooks.tsx` holds one hook per tool, named after the
config's `name` and the tool. For the tasks example (`name: "tasks"`):

```tsx
import { useTasksAddTaskMutation, useTasksListTasksQuery } from "./generated/hooks.js"

function TaskList() {
  const list = useTasksListTasksQuery({ done: false })
  const addTask = useTasksAddTaskMutation()

  if (list.isPending) return <p>Loading tasks</p>
  if (list.isError) return <p>{list.error.message}</p>
  return (
    <>
      <ul>
        {list.data.tasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
      <button
        disabled={addTask.isPending}
        onClick={() => addTask.mutate({ title: "Write the README" })}
      >
        Add a task
      </button>
    </>
  )
}
```

A tool the server marks read-only (`annotations.readOnlyHint: true`) gets a query hook; every other
tool gets a mutation hook, since a query runs again on every mount, focus and invalidation. The
codegen config's `overrides` can pick the hook for a tool. With a query hook, `hooks.tsx` also
holds `tasksQueryKey(tool, args)`, the typed query key (see below).

## The hooks themselves

The generated hooks are thin wrappers; the same calls work by hand against any tool map:

```tsx
import { useToolMutation, useToolQuery } from "@miragon/mcp-toolkit-tool-codegen-react"
import type { TasksToolMap } from "./generated/tools.js"

const list = useToolQuery<TasksToolMap, "list-tasks">("tasks", "list-tasks", { done: false })
const addTask = useToolMutation<TasksToolMap, "add-task">("tasks", "add-task")
```

- Both type parameters are explicit: nothing in the arguments names the map. An unknown tool name,
  a name other than the one in the type parameters and wrong args fail to compile, and so does a map
  with an index signature, whose keys would admit any name. A query with a `select` of another type
  names it as the third: `useToolQuery<TasksToolMap, "list-tasks", number>`.
- The first argument is the namespace, the first element of every query key and the key to the
  caller (see Several servers). The generated hooks pass the config's `name`.
- `useToolQuery(namespace, tool, args, options?)` takes every `useQuery` option except `queryKey` and
  `queryFn`, and returns TanStack's `UseQueryResult`. `enabled` still applies on top of waiting for
  a caller, as a boolean or a function. TanStack's `AbortSignal` goes to the caller, so a query
  that unmounts or is cancelled mid-call aborts the request. `initialData` does not narrow `data` to
  defined, as it does for `useQuery`.
- `useToolMutation(namespace, tool, options?)` takes every `useMutation` option except `mutationFn`,
  plus `invalidates`, and returns TanStack's `UseMutationResult`: `mutate(args)` runs the tool. For
  a tool whose input has no required property, `mutate()` sends `{}`. A third type parameter types
  what `onMutate` returns, the context `onError` and `onSettled` receive; the generated mutation hooks
  infer it:

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

## Query keys

A query is cached under `toolQueryKey(namespace, tool, args)`, which is `[namespace, tool, args]`.
The key is typed by the tool map and tagged with the tool's output, so an unknown tool or wrong args
do not compile, and the `QueryClient`'s `getQueryData` and `setQueryData` know the data's type. The
generated `tasksQueryKey(tool, args)` passes the namespace for you:

```ts
import { toolQueryKey } from "@miragon/mcp-toolkit-tool-codegen-react"
import { tasksQueryKey } from "./generated/hooks.js"

queryClient.setQueryData(tasksQueryKey("get-task", { id: "task-1" }), task) // task: TasksGetTaskOutput
queryClient.getQueryData(
  toolQueryKey<TasksToolMap, "get-task">("tasks", "get-task", { id: "task-1" }),
)
await queryClient.invalidateQueries({ queryKey: ["tasks", "list-tasks"] }) // every list-tasks call
```

TanStack Query hashes keys by value, so args built anew on every render are fine. A key prefix you
write yourself, as for `invalidateQueries`, is a plain TanStack key and not checked.

## Invalidation

Once a mutation succeeds, it invalidates the queries its `invalidates` option names. TanStack
refetches the invalidated queries on screen and marks the others stale.

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

Each prefix is a namespace, then optionally one of the map's tool names (checked: a misspelled tool
fails to compile) and more. Another server's tool cannot be named that way; invalidate it in
`onSuccess` with the `QueryClient`.

The invalidation starts first, then your own `onSuccess` runs (with all of TanStack's arguments).
With an explicit `invalidates`, the mutation settles once both are done: `isPending` stays `true`
until those queries on screen have refetched, so when `mutateAsync` resolves they already show the
new state. The default invalidation is not awaited: it covers every query of the server, and one of
them failing at the transport would otherwise hold the mutation pending through all its retries.

## Errors

A query's or a mutation's `error` is one of

- a `ToolCallError` (from the core package): the tool ran and answered `isError: true`. `message`
  is the tool's own text, `toolName` names the tool and `result` holds the raw result;
- a `NoToolCallerError`: a mutation ran, or a query was refetched by hand, while the
  `ToolCallerProvider` had no caller. `toolName` names the tool; `isNoToolCallerError(error)`
  recognises one also from another copy of this package;
- whatever the caller threw: a transport, protocol or abort error, unchanged.

```tsx
import { isToolCallError } from "@miragon/mcp-toolkit-tool-codegen-core"

const addTask = useTasksAddTaskMutation({
  onError: (error) => {
    if (isToolCallError(error)) showMessage(error.message) // the tool's own words
  },
})
```

Retries of a query without its own `retry` option:

- a `ToolCallError` is never retried: asking the tool again gets the same answer;
- a `NoToolCallerError` is never retried: once a caller arrives, the query starts by itself;
- any other failure is retried as the `QueryClient` says for the query's key (`setQueryDefaults`,
  then `defaultOptions.queries.retry`), 3 times when it says nothing, as TanStack does.

A `retry` option on the query decides alone, for a `ToolCallError` too. Mutations keep TanStack's
default: no retry.

`useToolCaller()`, and every hook built on it, throws when no `ToolCallerProvider` serves its
namespace. That is a wiring mistake, not a loading state.

## Suspense, prefetching and useQueries

`toolQueryOptions(namespace, tool, args, { callTool, queryClient })` returns the options
`useToolQuery` runs with (the key, the call with TanStack's abort signal, the retry rule), for what
takes options instead of a hook:

```tsx
import {
  toolQueryOptions,
  useToolCaller,
  type ToolQueryContext,
} from "@miragon/mcp-toolkit-tool-codegen-react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"

function Task({ id }: { id: string }) {
  const context = { callTool: useToolCaller("tasks"), queryClient: useQueryClient() }
  const { data } = useSuspenseQuery(
    toolQueryOptions<TasksToolMap, "get-task">("tasks", "get-task", { id }, context),
  )
  return <p>{data.title}</p>
}

// in a router loader:
const loadTask = (context: ToolQueryContext, id: string) =>
  context.queryClient.ensureQueryData(
    toolQueryOptions<TasksToolMap, "get-task">("tasks", "get-task", { id }, context),
  )
```

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

## Several servers

Give each server's provider the namespace its hooks use (the codegen config's `name`). A hook takes
the caller of the nearest provider naming its namespace, else that of the nearest provider without
one, so the providers can nest in any order and one component can use the hooks of both servers:

```tsx
<ToolCallerProvider namespace="tasks" callTool={tasksCaller}>
  <ToolCallerProvider namespace="billing" callTool={billingCaller}>
    <Dashboard />
  </ToolCallerProvider>
</ToolCallerProvider>
```

A provider without a namespace serves every namespace no provider names; with only that, a hook of
one server inside another server's provider would call the wrong server. Distinct namespaces also
keep the servers' queries apart in the one `QueryClient`.

## React 18 and 19

The hooks use only what both versions have: `createContext` with its `.Provider`, `useContext`,
`useMemo` and TanStack Query's hooks. The test suite runs on React 19.

## API

| Export                                                              | What it is                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ToolCallerProvider({ namespace?, callTool, children })`            | supplies the `ToolCaller` for a namespace, or for every other one           |
| `useToolCaller(namespace?)`                                         | the caller for the namespace or `null`; throws when no provider serves it   |
| `useToolQuery<TMap, TName, TSelected>(ns, name, args, options?)`    | a tool call as a TanStack query                                             |
| `useToolMutation<TMap, TName, TOnMutateResult>(ns, name, options?)` | a tool call as a TanStack mutation                                          |
| `toolQueryKey<TMap, TName>(ns, name, args)`                         | the typed query key `[ns, name, args]`                                      |
| `toolQueryOptions<TMap, TName>(ns, name, args, context)`            | the options of `useToolQuery`, for suspense, prefetching and `useQueries`   |
| `NoToolCallerError`, `isNoToolCallerError(error)`                   | a call while the provider had no caller (`toolName`)                        |
| `UseToolQueryOptions<TOutput, TSelected>`                           | `useQuery` options without `queryKey` and `queryFn`                         |
| `UseToolMutationOptions<TMap, TName, TOnMutateResult>`              | `useMutation` options without `mutationFn`, plus `invalidates`              |
| `ToolCallQueryKey`, `ToolQueryKey`, `ToolQueryKeyPrefix`            | the typed key of one call, the key's runtime shape, an `invalidates` prefix |
| `ToolQueryOptions`, `ToolQueryContext`, `ToolMutationVariables`     | `toolQueryOptions`' result and second argument, a mutation's variables      |
| `ToolCallerProviderProps`                                           | the provider's props                                                        |
