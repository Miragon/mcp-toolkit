# Migrating from 2.x

Move a project from mcp-toolkit 2.x to 3.0, which ships only the code generator and its two runtime
packages.

**Requirements:** Node.js 20 or later for the CLI, 22.18 or later for a `.ts` config.

3.0 keeps one part of the toolkit. `@miragon/mcp-toolkit-core` and `@miragon/mcp-toolkit-ui` are no
longer developed in this repository, and their published 2.x versions stay on npm. The 2.x docs site
about those packages, the hosted playground and the starter template are no longer built from it
either; this site covers 3.0 only. The steps below move a project that uses
`@miragon/mcp-toolkit-tool-codegen`.

## 1. Install the 3.0 packages

The generator stays a dev dependency; the runtime of `tools.ts` is a package of its own now:

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen@3
pnpm add @miragon/mcp-toolkit-tool-codegen-core@3
```

For the React hooks, add their runtime and TanStack Query:

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-react@3 @tanstack/react-query
```

Keep the three packages on the same minor version: the generator writes code against the runtime of
its own release and declares both runtime packages as optional peers (`~` its version), so your
package manager reports a mismatch. `help` prints the commands of 3.0:

```sh
pnpm exec mcp-tool-codegen help
```

```txt
mcp-tool-codegen: typed TypeScript clients from an MCP server's tools/list.

Usage:
  mcp-tool-codegen generate [--config <path>] [--check]
  mcp-tool-codegen inspect --url <url> [--token <token> | --header <name> --header-value <value>]
  mcp-tool-codegen help

generate   Fetch tools/list and write tools.ts (and hooks.tsx with react: true)
           into the config's out directory.
  --config <path>   Config module whose default export is a CodegenConfig
                    (default: ./codegen.config.ts). out resolves against its directory.
  --check           Write nothing; exit 1 when a generated file is missing, differs
                    from a fresh generation, or is a stale hooks.tsx (CI drift gate).

inspect    Print the server's tools as a Markdown table.
  --url <url>                              Streamable HTTP endpoint of the MCP server.
  --token <token>                          Send "Authorization: Bearer <token>".
  --header <name> --header-value <value>   Send a custom auth header instead.

help       Show this message.
```

## 2. Rename the config keys

Two keys are renamed, the override keys lose their prefix, and the hooks need a switch:

::: code-group

```ts [2.x]
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

export default {
  proxyName: "tasks",
  upstreamUrl: "http://localhost:4000/mcp",
  out: "./src/generated",
  overrides: {
    "tasks_get-task": { output: "{ id: string; title: string; done: boolean }" },
  },
} satisfies CodegenConfig
```

```ts [3.0]
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

export default {
  name: "tasks",
  url: "http://localhost:4000/mcp",
  out: "./src/generated",
  react: true,
  overrides: {
    "get-task": { output: "{ id: string; title: string; done: boolean }" },
  },
} satisfies CodegenConfig
```

:::

- `proxyName` is now `name`, and `upstreamUrl` is now `url`.
- `out` resolves against the config file's directory, not the working directory. If you ran the CLI
  from another directory than the config's, check where `out` points now.
- `overrides` is keyed by the tool names as the server lists them, without the `<proxyName>_`
  prefix.
- `react: true` writes `hooks.tsx`. Without it `generate` writes `tools.ts` alone and removes the
  `hooks.tsx` an earlier run generated, the one from 2.x included.
- Unknown keys and an override for a tool the server does not list fail the run with a message
  naming them.

Run against a 2.x config, the 3.0 CLI names each renamed key:

```sh
pnpm exec mcp-tool-codegen generate
```

```txt
mcp-tool-codegen: invalid codegen config:
  | - "proxyName" was renamed to "name" in 3.0
  | - "upstreamUrl" was renamed to "url" in 3.0
  | - "name" must start with a letter and contain only letters, digits, "-" and "_"
  | - "url" must be an http(s) URL
```

## 3. Update the CLI calls

Check your `package.json` scripts and CI workflows for the 2.x flags:

| 2.x                                    | 3.0                               |
| -------------------------------------- | --------------------------------- |
| `generate -c <path>`                   | `generate --config <path>`        |
| `inspect --upstream <url>`, `-u <url>` | `inspect --url <url>`             |
| `-o <dir>`, `--out <dir>`              | gone: `out` is set in the config  |
| `-p <name>`, `--proxy <name>`          | gone: `name` is set in the config |

An unknown flag or argument now exits 2 instead of being ignored, and a bare `mcp-tool-codegen`
exits 2 instead of printing the help. A 2.x flag names its replacement:

```sh
pnpm exec mcp-tool-codegen generate -c codegen.config.ts
```

```txt
mcp-tool-codegen: unknown flag "-c" for generate (3.0 renamed it to --config)

Usage:
  mcp-tool-codegen generate [--config <path>] [--check]
  mcp-tool-codegen inspect --url <url> [--token <token> | --header <name> --header-value <value>]
  mcp-tool-codegen help
```

## 4. Regenerate the files

`generate` rewrites `tools.ts` and, with `react: true`, `hooks.tsx`:

```sh
pnpm exec mcp-tool-codegen generate
```

The tool map is keyed by the server's own names now, and `tools.ts` also exports a client factory,
`create<Name>Client`, and its type, `<Name>Client`:

```sh
grep -E '^export (function|type)|^  "' src/generated/tools.ts
```

```txt
  "add-task": {
  "complete-task": {
  "get-task": {
  "list-tasks": {
export type TasksToolName = keyof TasksToolMap
export type TasksCallTool = TypedCallTool<TasksToolMap>
export function createTasksClient(callTool: ToolCaller) {
export type TasksClient = ReturnType<typeof createTasksClient>
```

Expect more of a diff than the names. `tools.ts` imports `@miragon/mcp-toolkit-tool-codegen-core`. A
letter after a digit is now upper-cased in type names, as json-schema-to-typescript does:
`oauth2token` gives `Oauth2Token`, not `Oauth2token`, and `get_v2beta` gives `GetV2Beta`. The
header's `// Source:` line names only the server's origin, and the `// Proxy:` line is gone.

## 5. Fix the imports and the tool names

Your own code still names the 2.x runtime and the prefixed tools:

- `ToolShape`, `TypedCallTool` and the rest of the runtime come from
  `@miragon/mcp-toolkit-tool-codegen-core`. The generator no longer exports them, from its main
  entry or from `@miragon/mcp-toolkit-tool-codegen/runtime`, which is gone, as is the
  `./templates/*` export.
- Tool names lose the prefix: `"tasks_list-tasks"` is now `"list-tasks"`, as the server lists it.
- Type names follow the new spelling from step 4.

For example, this file still imports the 2.x runtime and calls a tool by its prefixed name:

```ts
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import type { TypedCallTool } from "@miragon/mcp-toolkit-tool-codegen/runtime"
import { createTasksClient, type TasksToolMap } from "./generated/tools.js"

declare const callTool: ToolCaller
export const typed: TypedCallTool<TasksToolMap> = createTasksClient(callTool).call
await createTasksClient(callTool).call("tasks_list-tasks", {})
```

`/runtime` is gone, and the tool map has no index signature now, so the compiler finds both:

```sh
pnpm exec tsc --noEmit
```

```txt
src/tasks.ts(2,36): error TS2307: Cannot find module '@miragon/mcp-toolkit-tool-codegen/runtime' or its corresponding type declarations.
src/tasks.ts(7,40): error TS2345: Argument of type '"tasks_list-tasks"' is not assignable to parameter of type 'ToolName<TasksToolMap>'.
```

A hand-written map that extends `Record<string, ToolShape>`, as 2.x generated, no longer compiles
with `createTypedCallTool` either: with an index signature a misspelled name would compile. Drop the
`extends`.

## 6. Move the hooks to the React package

The hooks are opt-in (`react: true`), import `@miragon/mcp-toolkit-tool-codegen-react` instead of
`@miragon/mcp-toolkit-ui`, and need a `ToolCallerProvider` under your `QueryClientProvider`. 2.x
gave every tool a query hook named `use<Proxy><Tool>`. 3.0 names it `use<Name><Tool>Query` for a
tool the server marks read-only (`readOnlyHint: true`) and `use<Name><Tool>Mutation` for every
other, since a query re-runs its tool on every refetch:

```sh
grep -E "^export function" src/generated/hooks.tsx
```

```txt
export function tasksQueryKey<TName extends TasksToolName>(
export function useTasksAddTaskMutation<TOnMutateResult = unknown>(
export function useTasksCompleteTaskMutation<TOnMutateResult = unknown>(
export function useTasksGetTaskQuery<TSelected = TasksGetTaskOutput>(
export function useTasksListTasksQuery<TSelected = TasksListTasksOutput>(
```

Where a component read `data` from the hook of a tool that is now a mutation, call `mutate(args)`
instead, or, if the tool only reads, mark it `readOnlyHint: true` on the server or set
`overrides.<tool>.hook` to `"query"`. The provider takes a `ToolCaller`, a function that resolves
with the raw tool result; `toolCallerFromClient` makes one from an MCP SDK v2 client:

```tsx
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot } from "react-dom/client"
import { useTasksAddTaskMutation, useTasksListTasksQuery } from "./generated/hooks.js"

const client = new Client({ name: "tasks-app", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))
const queryClient = new QueryClient()

function OpenTasks() {
  const list = useTasksListTasksQuery({ done: false }) // was useTasksListTasks
  const addTask = useTasksAddTaskMutation() // was useTasksAddTask, a query hook in 2.x
  return (
    <>
      <ul>
        {list.data?.tasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
      <button onClick={() => addTask.mutate({ title: "Tag the release" })}>Add a task</button>
    </>
  )
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ToolCallerProvider callTool={toolCallerFromClient(client)}>
      <OpenTasks />
    </ToolCallerProvider>
  </QueryClientProvider>,
)
```

The list renders once the client is connected, and a successful mutation refetches every query of
the `tasks` namespace.

## If you want the 2.x query defaults

2.x's `AppQueryProvider` created the `QueryClient` with `staleTime: 30_000` and
`refetchOnWindowFocus: false`. Your app now brings its own, on TanStack's defaults: stale at once
and refetched on window focus. Keep the 2.x behaviour with:

```ts
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})
```

## If you call the generator from code

The programmatic API of `@miragon/mcp-toolkit-tool-codegen` changed too:

| 2.x                                                          | 3.0                                                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchUpstreamTools({ upstreamUrl, ... })`                   | `fetchTools({ url, ... })`                                                                                                              |
| `UpstreamToolDescriptor`                                     | `ToolDescriptor`, now with `annotations`                                                                                                |
| `writeCodegenOutput(config, result)`, resolving with nothing | `writeCodegenOutput(result, outDir)`, resolving with `{ written, removed }`; a relative `outDir` resolves against the working directory |
| `CodegenResult.hooksFile`, required                          | `CodegenResult.hooksFile`, optional: set only with `react: true`                                                                        |
| `ToolShape`, `TypedCallTool`                                 | imported from `@miragon/mcp-toolkit-tool-codegen-core`                                                                                  |

New in 3.0: `checkCodegenOutput(result, outDir)` compares an output directory with a fresh
generation as `generate --check` does, and resolves with the list of drifts, empty when the files
are up to date.

## Next steps

- [Generate typed tools](./guides/generate.md): the 3.0 config, overrides and auth in full.
- [Use the React hooks](./guides/react-hooks.md): the provider, invalidation and suspense with the
  new hooks.
- [Keep generated code in sync](./guides/check-in-ci.md): `generate --check` as the drift gate in
  CI.
