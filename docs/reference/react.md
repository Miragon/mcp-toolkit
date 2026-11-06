# React API

Every export of `@miragon/mcp-toolkit-tool-codegen-react`, the runtime of the generated `hooks.tsx`:
what it takes, what it returns and how it fails.

<dl class="facts">
  <dt>Package</dt>
  <dd><code>@miragon/mcp-toolkit-tool-codegen-react</code></dd>
  <dt>Install</dt>
  <dd><code>pnpm add @miragon/mcp-toolkit-tool-codegen-react@4 @miragon/mcp-toolkit-tool-codegen-core@4 @tanstack/react-query</code></dd>
  <dt>Peers</dt>
  <dd><code>react</code> <code>^19.0.0</code>, <code>@tanstack/react-query</code> <code>^5.100.2</code> (the first release whose <code>fetchQuery</code> takes what <code>toolQueryOptions</code> returns), <code>@miragon/mcp-toolkit-tool-codegen-core</code> of the same minor version; CI runs the tests against the lowest version of each range too</dd>
  <dt>Needs</dt>
  <dd>a <code>QueryClientProvider</code> above the hooks, which your app renders: the package creates no <code>QueryClient</code></dd>
  <dt>Module</dt>
  <dd>ESM only</dd>
</dl>

## Exports

| Export                                                | Kind      | What it is                                                                       |
| ----------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| [`ToolCallerProvider`](#toolcallerprovider)           | component | supplies the `ToolCaller` for one namespace or for every other one               |
| [`useToolCaller`](#usetoolcaller)                     | hook      | the caller for a namespace, or `null` while there is none                        |
| [`useToolQuery`](#usetoolquery)                       | hook      | a tool call as a TanStack query                                                  |
| [`useToolMutation`](#usetoolmutation)                 | hook      | a tool call as a TanStack mutation                                               |
| [`toolQueryKey`](#toolquerykey)                       | function  | the typed query key `[namespace, toolName, args]`                                |
| [`toolQueryOptions`](#toolqueryoptions)               | function  | the options `useToolQuery` runs with, for suspense and prefetching               |
| [`isNoToolCallerError`](#isnotoolcallererror)         | function  | `true` for a `NoToolCallerError`, also one from another copy                     |
| [`NoToolCallerError`](#notoolcallererror)             | class     | a tool was called while the provider had no caller                               |
| [`ToolCallerProviderProps`](#toolcallerproviderprops) | type      | the provider's props                                                             |
| [`UseToolQueryOptions`](#usetoolqueryoptions)         | type      | `useQuery` options without `queryKey` and `queryFn`, plus `callOptions`          |
| [`UseToolMutationOptions`](#usetoolmutationoptions)   | type      | `useMutation` options without `mutationFn`, plus `invalidates` and `callOptions` |
| [`ToolQueryCallOptions`](#toolquerycalloptions)       | type      | a query's `callOptions`: `ToolCallOptions` without `signal`                      |
| [`ToolMutationVariables`](#toolmutationvariables)     | type      | what `mutate()` takes                                                            |
| [`ToolQueryKey`](#toolquerykey-1)                     | type      | the runtime shape of a tool query's key                                          |
| [`ToolCallQueryKey`](#toolcallquerykey)               | type      | the key of one call, typed and tagged with the tool's output                     |
| [`ToolQueryKeyPrefix`](#toolquerykeyprefix)           | type      | one entry of `invalidates`                                                       |
| [`ToolQueryContext`](#toolquerycontext)               | type      | the last argument of `toolQueryOptions`                                          |
| [`ToolQueryOptions`](#toolqueryoptions-1)             | type      | what `toolQueryOptions` returns                                                  |

## Components

### `ToolCallerProvider`

```tsx
function ToolCallerProvider(props: ToolCallerProviderProps): ReactElement
```

| Prop        | Type                              | Meaning                                                                                                                                           |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `namespace` | `string`, optional                | the namespace whose hooks use this caller: the codegen config's `name`. Without it, the caller serves every namespace no provider above names.    |
| `callTool`  | `ToolCaller \| null \| undefined` | the function the hooks below call tools with; `null` or `undefined` while it is not ready (a client still connecting, a widget host not attached) |
| `children`  | `ReactNode`                       | the components that use the hooks                                                                                                                 |

- Renders its children with the caller added to those of the providers above. Providers nest in any
  order: one with a `namespace` adds that namespace's caller, one without replaces the caller for
  every namespace no provider names.
- Never throws.
- Leaves the `QueryClient` to you: render it inside your `QueryClientProvider`. Swapping one caller
  for another refetches nothing, since the cache belongs to the `QueryClient`. While `callTool` is
  missing, queries wait and mutations reject with a [`NoToolCallerError`](#notoolcallererror).

```tsx
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

const queryClient = new QueryClient()
const callTool = toolCallerFromClient(client) // a connected @modelcontextprotocol/client Client

export function Root({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToolCallerProvider callTool={callTool}>{children}</ToolCallerProvider>
    </QueryClientProvider>
  )
}
```

Two servers, each under its own namespace:

```tsx
<ToolCallerProvider namespace="tasks" callTool={tasksCaller}>
  <ToolCallerProvider namespace="billing" callTool={billingCaller}>
    <Dashboard />
  </ToolCallerProvider>
</ToolCallerProvider>
```

## Hooks

Each hook lists its parameters, then what it returns, how it fails and what it leaves to you.

### `useToolCaller`

```ts
function useToolCaller(namespace?: string): ToolCaller | null
```

| Parameter   | Type               | Meaning                              |
| ----------- | ------------------ | ------------------------------------ |
| `namespace` | `string`, optional | the namespace to find the caller for |

- Returns the caller of the nearest provider whose `namespace` is `namespace`, else that of the
  nearest provider without a namespace; `null` while that provider's `callTool` is `null` or
  `undefined`. A provider that names the namespace wins even while its caller is `null`.
- Throws an `Error` when no provider serves the namespace, a wiring mistake rather than a loading
  state:
  `useToolCaller, useToolQuery and useToolMutation need a <ToolCallerProvider namespace="tasks"> (or one without a namespace) above them: render it inside your QueryClientProvider and pass it the callTool function.`
  Without a namespace the message asks for `a <ToolCallerProvider>`.
- Leaves the call to you: the hooks call it for you, and by hand it builds a
  [`ToolQueryContext`](#toolquerycontext) for [`toolQueryOptions`](#toolqueryoptions).

### `useToolQuery`

```ts
function useToolQuery<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
  TSelected = ToolOutput<TMap, TName>,
>(
  namespace: string,
  name: TName,
  args: ToolInput<TMap, TName>,
  options?: UseToolQueryOptions<ToolOutput<TMap, TName>, TSelected>,
): UseQueryResult<TSelected, Error>
```

| Parameter   | Type                                          | Meaning                                                                                                                                                                             |
| ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TMap`      | type parameter                                | the tool map; explicit, since nothing in the arguments names it. A map with an index signature fails [`ToolMapOf`](./core.md#toolmapof), so a misspelled tool name does not compile |
| `TName`     | type parameter                                | the tool; must match `name`                                                                                                                                                         |
| `TSelected` | type parameter                                | the type `select` returns; default the tool's output                                                                                                                                |
| `namespace` | `string`                                      | the first element of the key and the key to the caller                                                                                                                              |
| `name`      | `TName`                                       | the tool                                                                                                                                                                            |
| `args`      | `ToolInput<TMap, TName>`                      | the tool's input                                                                                                                                                                    |
| `options`   | [`UseToolQueryOptions`](#usetoolqueryoptions) | every `useQuery` option except `queryKey` and `queryFn`, plus `callOptions` for the tool call                                                                                       |

- Returns TanStack's `UseQueryResult<TSelected, Error>` for the query cached under
  [`toolQueryKey(namespace, name, args)`](#toolquerykey). Its `data` is the tool's output, decoded
  by the core package's `parseToolResult`.
- Fails the query with a `ToolCallError` (the tool answered `isError: true`), a
  [`NoToolCallerError`](#notoolcallererror) (only when refetched by hand while the provider has no
  caller) or whatever the caller threw, unchanged. Throws during render when no provider serves the
  namespace (see [`useToolCaller`](#usetoolcaller)) or no `QueryClientProvider` is above (TanStack's
  `No QueryClient set, use QueryClientProvider to set one`).
- Leaves `initialData` without effect on the type: `data` stays possibly `undefined`, where
  `useQuery` narrows it to defined.

| Behaviour  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waiting    | While the provider has no caller, the query is disabled on top of `options.enabled` (`status: "pending"`, `fetchStatus: "idle"`) and starts once a caller arrives. `enabled` as a boolean or a function still applies.                                                                                                                                                                                                     |
| Cancelling | TanStack's `AbortSignal` goes to the caller, so a query that unmounts or is cancelled mid-call aborts the request.                                                                                                                                                                                                                                                                                                         |
| Call       | `options.callOptions` (`timeout`, `onprogress`, `resetTimeoutOnProgress`, `maxTotalTimeout`) go to the caller with that signal, on every fetch. They are not part of the key, and they take no `signal`: the query's own one would replace it.                                                                                                                                                                             |
| Retry      | Without `options.retry`: a `ToolCallError`, a `NoToolCallerError` or a request timeout (below) never retries; any other failure retries as the `QueryClient` says for the key (`setQueryDefaults`, then `defaultOptions.queries.retry`), and as TanStack's default when it says nothing: 3 times, on the server (TanStack's `isServer`) not at all. Read at failure time. With `options.retry`, that option decides alone. |
| Key        | TanStack hashes the key by value, so args built anew on every render are fine.                                                                                                                                                                                                                                                                                                                                             |

The server is what TanStack's `isServer` says: no `window`, or Deno. An override through
`environmentManager.setIsServer` (TanStack Query 5.91 and later) is not read; in a runtime that
needs one, set `defaultOptions.queries.retry` on the `QueryClient`.

A request timeout is the MCP SDK's error for a call that ran past its `timeout` or, kept alive by
progress, past its `maxTotalTimeout`: an `SdkError` with code `REQUEST_TIMEOUT` from the v2 SDK, an
`McpError` with code `-32001` and the message `MCP error -32001: Request timed out` or
`MCP error -32001: Maximum total timeout exceeded` from the v1 SDK. The hook recognises it by that
code and message, without the SDK. An error the server sends with the code `-32001` (the v2 SDK's
convention for `Session not found`) is not a timeout: the v1 SDK gives it the same code and name,
but the server's message.
A retry would wait the whole timeout again: with `callOptions: { timeout: 300_000 }`, TanStack's 3
retries would keep the query pending for about 20 minutes. To retry timeouts anyway, pass `retry`.

```tsx
import { useToolQuery } from "@miragon/mcp-toolkit-tool-codegen-react"
import type { TasksToolMap } from "./generated/tools.js"

const list = useToolQuery<TasksToolMap, "list-tasks">("tasks", "list-tasks", { done: false })
const count = useToolQuery<TasksToolMap, "list-tasks", number>(
  "tasks",
  "list-tasks",
  {},
  {
    select: (data) => data.tasks.length,
    callOptions: { timeout: 120_000 },
  },
)
```

### `useToolMutation`

```ts
function useToolMutation<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
  TOnMutateResult = unknown,
>(
  namespace: string,
  name: TName,
  options?: UseToolMutationOptions<TMap, TName, TOnMutateResult>,
): UseMutationResult<
  ToolOutput<TMap, TName>,
  Error,
  ToolMutationVariables<TMap, TName>,
  TOnMutateResult
>
```

| Parameter         | Type                                                | Meaning                                                                                                                                                                             |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TMap`            | type parameter                                      | the tool map; explicit, since nothing in the arguments names it. A map with an index signature fails [`ToolMapOf`](./core.md#toolmapof), so a misspelled tool name does not compile |
| `TName`           | type parameter                                      | the tool; must match `name`                                                                                                                                                         |
| `TOnMutateResult` | type parameter                                      | what `onMutate` returns, the context `onError` and `onSettled` receive                                                                                                              |
| `namespace`       | `string`                                            | the key to the caller and the default prefix to invalidate                                                                                                                          |
| `name`            | `TName`                                             | the tool                                                                                                                                                                            |
| `options`         | [`UseToolMutationOptions`](#usetoolmutationoptions) | every `useMutation` option except `mutationFn`, plus `invalidates` and `callOptions`                                                                                                |

- Returns TanStack's `UseMutationResult`: `mutate(args)` and `mutateAsync(args)` run the tool and
  resolve with its parsed output. For a tool whose input has no required property, `mutate()` sends
  `{}`.
- Rejects with a `ToolCallError` (the tool answered `isError: true`), a
  [`NoToolCallerError`](#notoolcallererror) (the provider has no caller) or whatever the caller
  threw, unchanged. Throws during render as [`useToolQuery`](#usetoolquery) does.
- Leaves retries to TanStack's mutation default, no retry, unless `options.retry` says otherwise.
  Every call `mutate` makes gets `options.callOptions` (a
  [`ToolCallOptions`](./core.md#toolcalloptions)), and no abort signal unless they carry one: a
  mutation has none of its own. Once that signal is aborted, every later `mutate` fails at once.

After a success, the invalidation starts first, then your `onSuccess` runs with all of TanStack's
arguments:

| `invalidates`                    | Invalidated                                   | The mutation settles                                           |
| -------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| not set                          | `[namespace]`: every query of the same server | once `onSuccess` is done, without waiting for the refetches    |
| `false`                          | nothing                                       | once `onSuccess` is done                                       |
| `[["tasks", "list-tasks"], ...]` | every query under one of the key prefixes     | once `onSuccess` is done and those queries on screen refetched |

The default is not awaited: it covers every query of the server, and one of them failing at the
transport would hold the mutation pending through all its retries. TanStack refetches the
invalidated queries on screen and marks the others stale.

```tsx
import { useToolMutation } from "@miragon/mcp-toolkit-tool-codegen-react"
import type { TasksToolMap } from "./generated/tools.js"

const addTask = useToolMutation<TasksToolMap, "add-task">("tasks", "add-task", {
  invalidates: [["tasks", "list-tasks"]],
  onSuccess: (task) => showMessage(`${task.title} was added`),
  callOptions: { timeout: 30_000 },
})
addTask.mutate({ title: "Tag the release" })
```

## Functions

Each function lists its parameters, then what it returns, how it fails and what it leaves to you.

### `toolQueryKey`

```ts
function toolQueryKey<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>>(
  namespace: string,
  toolName: TName,
  args: ToolInput<TMap, TName>,
): ToolCallQueryKey<TMap, TName>
```

| Parameter   | Type                     | Meaning                     |
| ----------- | ------------------------ | --------------------------- |
| `namespace` | `string`                 | the codegen config's `name` |
| `toolName`  | `TName`                  | the tool                    |
| `args`      | `ToolInput<TMap, TName>` | the tool's input            |

- Returns `[namespace, toolName, args]`, typed as a [`ToolCallQueryKey`](#toolcallquerykey): an
  unknown tool or wrong args do not compile, and `getQueryData` and `setQueryData` know the data's
  type. It is the key [`useToolQuery`](#usetoolquery) caches the call under.
- Never throws.
- Leaves prefixes unchecked: a prefix you write yourself for `invalidateQueries` is a plain TanStack
  key. The generated `<name>QueryKey(tool, args)` passes the namespace for you.

```ts
import { toolQueryKey } from "@miragon/mcp-toolkit-tool-codegen-react"
import { tasksQueryKey } from "./generated/hooks.js"

queryClient.setQueryData(tasksQueryKey("get-task", { id: "task-1" }), task) // task: TasksGetTaskOutput
queryClient.getQueryData(
  toolQueryKey<TasksToolMap, "get-task">("tasks", "get-task", { id: "task-1" }),
)
await queryClient.invalidateQueries({ queryKey: ["tasks", "list-tasks"] }) // every list-tasks call
```

### `toolQueryOptions`

```ts
function toolQueryOptions<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>>(
  namespace: string,
  name: TName,
  args: ToolInput<TMap, TName>,
  context: ToolQueryContext,
): ToolQueryOptions<TMap, TName>
```

| Parameter   | Type                                    | Meaning                                   |
| ----------- | --------------------------------------- | ----------------------------------------- |
| `namespace` | `string`                                | the codegen config's `name`               |
| `name`      | `TName`                                 | the tool                                  |
| `args`      | `ToolInput<TMap, TName>`                | the tool's input                          |
| `context`   | [`ToolQueryContext`](#toolquerycontext) | `{ callTool, queryClient, callOptions? }` |

- Returns `{ queryKey, queryFn, retry }` with the key, the call (with `context.callOptions` and
  TanStack's abort signal) and the retry rule of [`useToolQuery`](#usetoolquery), for what takes
  options instead of a hook:
  `useSuspenseQuery`, `useQueries`, `queryClient.fetchQuery`, `prefetchQuery` and
  `ensureQueryData`. Spread it to add options: `{ ...toolQueryOptions(...), staleTime: 60_000 }`.
- Fails the query as [`useToolQuery`](#usetoolquery) does, with one difference: with
  `callTool: null` the query does not wait, it fails with a
  [`NoToolCallerError`](#notoolcallererror), which is not retried.
- Keeps that retry rule in `prefetchQuery`, `fetchQuery` and `ensureQueryData` too, which do not
  retry a plain query: in the browser, a failure other than those retries 3 times unless the
  `QueryClient` or a spread `retry` says otherwise.
- Leaves the caller and the client to you: outside a component pass them in, inside one take them
  from [`useToolCaller`](#usetoolcaller) and `useQueryClient()`.

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

### `isNoToolCallerError`

```ts
function isNoToolCallerError(error: unknown): error is NoToolCallerError
```

| Parameter | Type      | Meaning                           |
| --------- | --------- | --------------------------------- |
| `error`   | `unknown` | a query's or a mutation's `error` |

- Returns `true` for a [`NoToolCallerError`](#notoolcallererror), also one thrown by another copy of
  this package, where `instanceof` fails. It reads a brand under
  `Symbol.for("@miragon/mcp-toolkit-tool-codegen-react/NoToolCallerError")`.
- Never throws.
- Leaves a `ToolCallError` to the core package's `isToolCallError`.

## Classes

### `NoToolCallerError`

```ts
class NoToolCallerError extends Error {
  constructor(toolName: string)
  readonly name: "NoToolCallerError"
  readonly toolName: string
}
```

| Property   | Value                                                                       |
| ---------- | --------------------------------------------------------------------------- |
| `name`     | `"NoToolCallerError"`                                                       |
| `toolName` | the tool that was called                                                    |
| `message`  | `Cannot call tool "<toolName>": the ToolCallerProvider has no callTool yet` |

A mutation rejects with it, and a query fails with it when refetched by hand, while the
[`ToolCallerProvider`](#toolcallerprovider) has no caller. So does a query built with
[`toolQueryOptions`](#toolqueryoptions) and `callTool: null`. The hooks never retry it: once a
caller arrives, a waiting query starts by itself. Recognise one with
[`isNoToolCallerError`](#isnotoolcallererror).

## Types

Each type shows its definition, then what it promises and where it is used. `ToolMapOf`, `ToolName`,
`ToolInput` and `ToolOutput` come from the core package; see [Core API](./core.md).

### `ToolCallerProviderProps`

```ts
interface ToolCallerProviderProps {
  namespace?: string
  callTool: ToolCaller | null | undefined
  children: ReactNode
}
```

The props of [`ToolCallerProvider`](#toolcallerprovider). `callTool` is required, but may be `null`
or `undefined` while the caller is not ready.

### `UseToolQueryOptions`

```ts
type UseToolQueryOptions<TOutput, TSelected = TOutput> = Omit<
  UseQueryOptions<TOutput, Error, TSelected, ToolQueryKey>,
  "queryKey" | "queryFn"
> & {
  callOptions?: ToolQueryCallOptions
}
```

Every `useQuery` option except the two [`useToolQuery`](#usetoolquery) owns, plus `callOptions`:
the timeouts and the progress callback of the tool call, see
[`ToolQueryCallOptions`](#toolquerycalloptions). The generated query hooks take it as their
`options`: `useTasksListTasksQuery({}, { callOptions: { timeout: 120_000 } })`.

### `ToolQueryCallOptions`

```ts
type ToolQueryCallOptions = Omit<ToolCallOptions, "signal">
```

The core package's [`ToolCallOptions`](./core.md#toolcalloptions) without `signal`: `timeout`,
`onprogress`, `resetTimeoutOnProgress` and `maxTotalTimeout`. A query hands TanStack's own signal
to the call, which aborts it on unmount and on cancel, so it takes no other. The options are not
part of the query key: two components that query the same tool with the same args share one cache
entry, and the call runs with the options of whichever fetches.

### `UseToolMutationOptions`

```ts
type UseToolMutationOptions<
  TMap extends ToolMapOf<TMap>,
  TName extends ToolName<TMap>,
  TOnMutateResult = unknown,
> = Omit<
  UseMutationOptions<
    ToolOutput<TMap, TName>,
    Error,
    ToolMutationVariables<TMap, TName>,
    TOnMutateResult
  >,
  "mutationFn"
> & {
  invalidates?: false | readonly ToolQueryKeyPrefix<TMap>[]
  callOptions?: ToolCallOptions
}
```

Every `useMutation` option except `mutationFn`, plus `invalidates`: the key prefixes to invalidate
once the tool succeeded, default `[namespace]`, `false` for none, and `callOptions`: the
[`ToolCallOptions`](./core.md#toolcalloptions) of every call `mutate` makes, a `signal` included.
The generated mutation hooks take it as their `options`.

### `ToolMutationVariables`

```ts
type ToolMutationVariables<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>> =
  Record<never, never> extends ToolInput<TMap, TName>
    ? ToolInput<TMap, TName> | void
    : ToolInput<TMap, TName>
```

What `mutate()` takes: the tool's input, which it may leave out when `{}` is a valid input. It then
sends `{}`.

### `ToolQueryKey`

```ts
type ToolQueryKey = readonly [namespace: string, toolName: string, args: unknown]
```

The runtime shape of a tool query's key. The namespace comes first, so `[namespace]` is the prefix
of every query of one server and `[namespace, toolName]` that of every call of one tool.

### `ToolCallQueryKey`

```ts
type ToolCallQueryKey<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>> = DataTag<
  readonly [namespace: string, toolName: TName, args: ToolInput<TMap, TName>],
  ToolOutput<TMap, TName>
>
```

The key of one call, typed by the tool map and tagged with the tool's output through TanStack's
`DataTag`, so `getQueryData` and `setQueryData` know the data's type.
[`toolQueryKey`](#toolquerykey) and the generated `<name>QueryKey` return it.

### `ToolQueryKeyPrefix`

```ts
type ToolQueryKeyPrefix<TMap extends ToolMapOf<TMap>> = readonly [
  namespace: string,
  toolName?: ToolName<TMap>,
  ...rest: unknown[],
]
```

One entry of `invalidates`: a namespace, then optionally one of the map's tool names (a misspelled
one fails to compile) and more. Another server's tool cannot be named this way; invalidate it in
`onSuccess` with the `QueryClient`.

### `ToolQueryContext`

```ts
interface ToolQueryContext {
  callTool: ToolCaller | null
  queryClient: QueryClient
  callOptions?: ToolQueryCallOptions
}
```

What a tool query runs with outside a component, the last argument of
[`toolQueryOptions`](#toolqueryoptions). `callTool: null` fails the query with a
[`NoToolCallerError`](#notoolcallererror); `queryClient`'s retry defaults decide failures other than
the tool's own answer and a request timeout; `callOptions` go to the call as in
[`useToolQuery`](#usetoolquery).

### `ToolQueryOptions`

```ts
type ToolQueryOptions<TMap extends ToolMapOf<TMap>, TName extends ToolName<TMap>> = UseQueryOptions<
  ToolOutput<TMap, TName>,
  Error,
  ToolOutput<TMap, TName>,
  ToolCallQueryKey<TMap, TName>
> & {
  queryKey: ToolCallQueryKey<TMap, TName>
  queryFn: QueryFunction<ToolOutput<TMap, TName>, ToolCallQueryKey<TMap, TName>>
}
```

TanStack's query options with the key and the query function always set: what
[`toolQueryOptions`](#toolqueryoptions) returns.

## Next steps

- [Use the React hooks](../guides/react-hooks.md): the provider, the generated hooks, invalidation
  and suspense in an app.
- [Core API](./core.md): the `ToolCaller`, `ToolCallError` and the parse rules under every hook.
- [Guarantees and limits](../guarantees.md): what the hooks leave open, such as `initialData`.
