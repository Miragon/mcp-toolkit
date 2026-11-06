# @miragon/mcp-toolkit-tool-codegen

Build-time codegen for typed MCP tool calls. The `mcp-tool-codegen` CLI reads an MCP server's
`tools/list` and writes TypeScript: input and output types per tool, a tool map, a typed client
factory and, opt-in, React hooks. The generated code runs on two small runtime packages:

| Package                                   | Used by                                     |
| ----------------------------------------- | ------------------------------------------- |
| `@miragon/mcp-toolkit-tool-codegen-core`  | `tools.ts` (framework-free: Node, browsers) |
| `@miragon/mcp-toolkit-tool-codegen-react` | `hooks.tsx` (React, TanStack Query v5)      |

## Install

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen
pnpm add @miragon/mcp-toolkit-tool-codegen-core
# with react: true
pnpm add @miragon/mcp-toolkit-tool-codegen-react @tanstack/react-query react
```

Keep the three packages on the same minor version: the generator writes code against the runtime
API of its own release, and declares both runtime packages as optional peers (`~` its version), so
a package manager reports a mismatch. The CLI needs Node.js 20 or newer (22.18 for a `.ts` config).

## Config

`codegen.config.ts`, the CLI's default (`--config` names another file):

```ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const token = process.env.TASKS_TOKEN

export default {
  name: "tasks",
  url: "http://localhost:4000/mcp",
  auth: token ? { mode: "bearer", token } : { mode: "none" },
  out: "./src/generated",
  react: true,
  overrides: { "get-task": { hook: "query" } },
} satisfies CodegenConfig
```

The config is an ES module, loaded with Node.js's own type stripping, so only erasable TypeScript
(type imports and annotations) works in it:

- Node.js loads a `.ts` config from 22.18 on. On older versions, use a `.mjs` config, or run the
  CLI through tsx: `NODE_OPTIONS="--import tsx" pnpm exec mcp-tool-codegen generate`.
- In a `"type": "commonjs"` package Node.js reads `.ts` and `.js` as CommonJS, where the config's
  `export default` is a syntax error. Name the file `codegen.config.mts` (or `.mjs`) and pass
  `--config codegen.config.mts`.

| Field       | Meaning                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`      | Names the client (`TasksToolMap`, `createTasksClient`, `useTasks<Tool>Query`) and is the React query-key namespace. A letter, then letters, digits, `-`, `_`.            |
| `url`       | Streamable HTTP endpoint of the MCP server (`http:`/`https:`), without credentials: those go into `auth`.                                                                |
| `auth`      | `{ mode: "none" }` (default), `{ mode: "bearer", token }` or `{ mode: "header", headerName, value }`. No OAuth: run the flow once and pass the access token as `bearer`. |
| `headers`   | Extra request headers. Names compare case-insensitively; a header named like the auth header replaces it.                                                                |
| `out`       | Output directory; the CLI resolves it against the config file's directory.                                                                                               |
| `react`     | Also write `hooks.tsx` (default `false`).                                                                                                                                |
| `overrides` | Keyed by the tool name as the server lists it; see below.                                                                                                                |

Per tool, `overrides` takes:

- `input`, `output`: a TypeScript type expression that replaces the generated type, for a tool
  without an `outputSchema` or a schema the generator cannot read. A tool's output without
  `structuredContent` is its first text block, read as JSON when it parses as JSON (the core
  package's parse rules): text such as `"2.10"` or `"true"` arrives as a number or boolean, so an
  `output: "string"` override is only right for text that never parses as JSON.
- `hook`: `"query"` or `"mutation"`, instead of the `readOnlyHint` rule.
- `identifier`: the name to build the tool's identifiers from instead of its own (a letter, then
  letters and digits): `{ identifier: "searchAll" }` gives `TasksSearchAllInput`, the method
  `searchAll` and `useTasksSearchAllQuery`. For a tool whose name collides with another's, with a
  reserved name or has no ASCII letter or digit (see Security).

Unknown keys, an override for a tool the server does not list, and the 2.x keys `proxyName` and
`upstreamUrl` fail the run with a message naming them. Header and auth values must not contain
line breaks, control characters or characters beyond Latin-1; the message names the header, never
the value.

## CLI

```sh
mcp-tool-codegen generate [--config <path>] [--check]
mcp-tool-codegen inspect --url <url> [--token <token> | --header <name> --header-value <value>]
mcp-tool-codegen help
```

- `generate` writes `tools.ts`, and `hooks.tsx` with `react: true`, into `out`. With `react` off it
  removes a `hooks.tsx` it generated earlier.
- `generate --check` writes nothing and exits 1 when a generated file is missing, differs from a
  fresh generation, or is a leftover `hooks.tsx` while `react` is off: the CI drift gate. It
  compares everything but the `// Source:` line, which names the server's origin, so the check
  passes against the same tools at another address (a CI service host, another port).
- `inspect` prints the tools as a Markdown table, with the hook kind each would get.

Exit codes: 0 ok, 1 failure or drift, 2 usage error (unknown command or flag, missing value; a
2.x flag such as `-c` or `--upstream` names its replacement). A server that cannot be reached
fails with its origin and the cause (`cannot list the tools of http://localhost:4000: fetch failed
(ECONNREFUSED): is the server running at that address?`).

## Generated code

For the server of [`examples/tasks`](https://github.com/Miragon/mcp-toolkit/tree/main/examples/tasks)
(read-only `list-tasks` and `get-task`, writing `add-task` and `complete-task`; abridged, without
bodies):

```ts
// tools.ts (imports only @miragon/mcp-toolkit-tool-codegen-core)
export interface TasksListTasksInput {
  done?: boolean
}
export interface TasksListTasksOutput {
  tasks: { id: string; title: string; done: boolean }[]
}
export interface TasksAddTaskInput {
  title: string
}
// ... TasksAddTaskOutput, TasksGetTask*, TasksCompleteTask*

export interface TasksToolMap {
  "add-task": { input: TasksAddTaskInput; output: TasksAddTaskOutput }
  "list-tasks": { input: TasksListTasksInput; output: TasksListTasksOutput }
  // ...
}
export type TasksToolName = keyof TasksToolMap // "add-task" | "complete-task" | ...
export type TasksCallTool = TypedCallTool<TasksToolMap>
export function createTasksClient(callTool: ToolCaller) // { call, addTask, listTasks, ... }
export type TasksClient = ReturnType<typeof createTasksClient>

// hooks.tsx (imports only @miragon/mcp-toolkit-tool-codegen-react and ./tools.js)
export function tasksQueryKey<TName extends TasksToolName>(name, args): ToolCallQueryKey<...>
export function useTasksListTasksQuery<TSelected = TasksListTasksOutput>(args?, options?)
export function useTasksAddTaskMutation<TOnMutateResult = unknown>(options?)
```

The map is keyed by the server's own tool names and has no index signature, so unknown names and
wrong arguments do not compile. `args` may be left out when the input has no required property. A
tool without an `outputSchema` has the output `unknown`; an output schema that is an object without
properties gives `Record<string, unknown>`. `tasksQueryKey(tool, args)` is the typed query key for
the `QueryClient`, written when there is a query hook. The tools are sorted by name, the files
regenerate byte-identically and come out Prettier-formatted (print width 100, no semicolons);
exclude `out` from your formatter if your style differs.

Node, with the MCP SDK v2 client:

```ts
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { createTasksClient } from "./generated/tools.js"

const tasks = createTasksClient(toolCallerFromClient(mcpClient))
const { tasks: open } = await tasks.listTasks({ done: false })
```

React: the app brings its `QueryClientProvider`; `ToolCallerProvider` supplies the caller.

```tsx
<ToolCallerProvider callTool={callTool}>
  <TaskList />
</ToolCallerProvider>
// in TaskList: const { data } = useTasksListTasksQuery({ done: false })
```

### Query or mutation

A tool gets a query hook only when it is annotated `readOnlyHint: true`; every other tool gets a
mutation hook. MCP's `readOnlyHint` defaults to `false`, and a query re-runs its tool on every
refetch, so an unannotated write must never become a query. `overrides.<tool>.hook` decides
otherwise per tool.

## Security

Everything in `tools/list` is untrusted (Miragon/mcp-toolkit#177: 2.x copied tool names into the
generated code unescaped, so a malicious server could inject code). The generator guarantees:

- Identifiers are built only from the `[A-Za-z0-9]` runs of a tool name (or its
  `overrides.<tool>.identifier`). Two tools that map to the same identifier, a name without such
  characters, and a client method JavaScript looks up on any object (`then`, which would make the
  client a thenable that `await` calls, `toJSON`, `toString`, `valueOf`, `constructor`, ...) fail
  the run with a message naming the tool and what resolves it.
- Tool names and other server text appear in code only as JSON string literals, with control,
  format, bidirectional, zero-width and other invisible characters (Unicode tags, fillers, the soft
  hyphen) escaped. A property key stays quoted unless it is a plain ASCII identifier.
- Schemas are rebuilt from an allowlist of keywords before `json-schema-to-typescript` sees them:
  `tsType`/`tsEnumNames` (raw TypeScript), `title`/`$id` (declaration names), `minItems`/`maxItems`
  and unknown keywords are dropped.
- Only local `$ref`s (`#`, `#/…`) resolve, and only to a schema position of the same schema; any
  other `$ref` (`file:`, `http:`, a relative path, a pointer into `required` or a name→schema map)
  becomes `unknown`, and the generator never reads a file or calls a URL for one. Every reference
  target is declared once, as a type prefixed with the tool's type name, so a schema cannot expand
  exponentially or declare a name of its own choosing.
- Descriptions cannot close the JSDoc they sit in nor become a TypeScript comment directive
  (`@ts-ignore`), and invisible characters are dropped from them.
- The `// Source:` header holds only the server URL's origin: no credentials, query, fragment or
  path, where hosted MCP servers often carry an API key. The generated files are meant to be
  committed.
- The CLI prints server text with control characters replaced and every line of an error after the
  first marked ` |`, so a server's error body can neither send terminal escape sequences nor
  start a line of a CI log (a GitHub Actions `::error` command).

## Programmatic API

```ts
import {
  generateTools, // (config) => Promise<CodegenResult>: fetch tools/list and render
  renderCodegen, // (tools: ToolDescriptor[], config) => Promise<CodegenResult>: no network
  writeCodegenOutput, // (result, outDir) => Promise<{ written; removed }>
  checkCodegenOutput, // (result, outDir) => Promise<CodegenDrift[]>: [] when up to date
  fetchTools, // ({ url, auth?, headers? }) => Promise<ToolDescriptor[]>
} from "@miragon/mcp-toolkit-tool-codegen"
```

`CodegenResult` is `{ toolsFile, hooksFile?, tools }`; `hooksFile` is set only with `react: true`.
A relative `outDir` resolves against the working directory. `checkCodegenOutput` compares as
`generate --check` does, the `// Source:` line aside. `ToolDescriptor` carries `name`, `title`,
`description`, `inputSchema`, `outputSchema` and `annotations`.

## Migrating from 2.x

- Config: `proxyName` is `name`, `upstreamUrl` is `url`; `out` now resolves against the config
  file's directory, not the working directory. Override keys are the server's tool names.
- CLI: `-c` is `--config`; `inspect --upstream`/`-u` is `--url`; `-o`/`--out` and `-p`/`--proxy`
  are gone (both are set in the config). An unknown flag or argument now exits 2 instead of being
  ignored, and a bare `mcp-tool-codegen` exits 2 instead of printing the help.
- Tool names are no longer prefixed: `"tasks_list_tasks"` is `"list_tasks"`, as the server lists it.
- Type names: a letter after a digit is now upper-cased, as json-schema-to-typescript does
  (`oauth2token` gives `Oauth2Token`, not `Oauth2token`; `get_v2beta` gives `GetV2Beta`).
- Exports: `fetchUpstreamTools` is `fetchTools` and its option `upstreamUrl` is `url`;
  `UpstreamToolDescriptor` is `ToolDescriptor` (now with `annotations`). `writeCodegenOutput`
  takes `(result, outDir)` instead of `(config, result)`. `CodegenResult.hooksFile` is optional.
- `ToolShape` and `TypedCallTool` are no longer exported here, from the main entry or from
  `@miragon/mcp-toolkit-tool-codegen/runtime` (gone): import them and the rest of the runtime from
  `@miragon/mcp-toolkit-tool-codegen-core`. The `./templates/*` export is gone.
- `tools.ts` now also exports `create<Name>Client` and `<Name>Client`.
- Hooks are opt-in (`react: true`), import `@miragon/mcp-toolkit-tool-codegen-react` instead of
  `@miragon/mcp-toolkit-ui`, and need a `ToolCallerProvider` above them. `use<Proxy><Tool>` is now
  `use<Name><Tool>Query` for a read-only tool and `use<Name><Tool>Mutation` for every other.
- 2.x's `AppQueryProvider` created the `QueryClient` with `staleTime: 30_000` and
  `refetchOnWindowFocus: false`. Your app now brings its own, on TanStack's defaults (stale at once,
  refetched on focus); keep the 2.x behaviour with
  `new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })`.
