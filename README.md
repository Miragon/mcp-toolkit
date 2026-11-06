# mcp-toolkit

Typed calls to MCP tools, generated from the server's own `tools/list`. At build time the
`mcp-tool-codegen` CLI reads an MCP server's tool list and writes TypeScript: an input and an
output type per tool, a tool map keyed by the server's tool names, a typed client and, opt-in,
React hooks. An unknown tool name or wrong arguments fail to compile. The generated client runs on a
framework-free core package (Node, browsers, MCP Apps widgets); the hooks run on a React package
over TanStack Query v5. Everything from the server is treated as untrusted input to the generator.

| Package                                                                    | Role                                                                                                                              | Runtime dependencies / peers                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`@miragon/mcp-toolkit-tool-codegen`](./packages/tool-codegen)             | Build-time CLI and generator (Node): `tools/list` → `tools.ts` and, with `react: true`, `hooks.tsx`. A dev dependency.            | `@modelcontextprotocol/client`, `handlebars`, `json-schema-to-typescript`                                             |
| [`@miragon/mcp-toolkit-tool-codegen-core`](./packages/tool-codegen-core)   | Runtime of `tools.ts`: the `ToolCaller` contract, `createTypedCallTool`, result parsing, `ToolCallError`, `toolCallerFromClient`. | none                                                                                                                  |
| [`@miragon/mcp-toolkit-tool-codegen-react`](./packages/tool-codegen-react) | Runtime of `hooks.tsx`: `ToolCallerProvider`, `useToolQuery`, `useToolMutation` on TanStack Query.                                | peers: `react` `^18 \|\| ^19`, `@tanstack/react-query` `^5.48`, `@miragon/mcp-toolkit-tool-codegen-core` (same minor) |

[`examples/tasks`](./examples/tasks) runs the whole chain on one small MCP server: codegen, the
typed client in Node, the hooks in a Vite React app, and tests as the drift gate.

## Quick start

**1. Generate.** Install the generator and the core, point a config at your server and run the CLI:

```sh
pnpm add -D @miragon/mcp-toolkit-tool-codegen
pnpm add @miragon/mcp-toolkit-tool-codegen-core
```

```ts
// codegen.config.ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  name: "tasks", // names TasksToolMap, createTasksClient, useTasks<Tool>Query/Mutation
  url: "http://localhost:4000/mcp", // the server's streamable HTTP endpoint
  out: "./src/generated", // resolved against this file's directory
}

export default config
```

```sh
pnpm exec mcp-tool-codegen generate          # write src/generated/tools.ts
pnpm exec mcp-tool-codegen generate --check  # exit 1 when the committed files drift
```

Node.js loads a `.ts` config itself from 22.18 on (in a CommonJS package, name it
`codegen.config.mts`). Commit the generated files. Auth, overrides and the CLI are described in the
[tool-codegen README](./packages/tool-codegen/README.md).

**2. Call from anywhere with the core.** The generated client takes a `ToolCaller`: the MCP SDK v2
client (`@modelcontextprotocol/client`, for the v1 SDK see the
[core README](./packages/tool-codegen-core/README.md#with-the-mcp-sdk-client)), a widget host
bridge or a test fake.

```sh
pnpm add @modelcontextprotocol/client
```

```ts
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createTasksClient } from "./generated/tools.js"

const client = new Client({ name: "tasks-script", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))

const tasks = createTasksClient(toolCallerFromClient(client))
const added = await tasks.addTask({ title: "Write the release notes" }) // typed input and output
const { tasks: open } = await tasks.listTasks({ done: false })
```

A tool that answers `isError: true` makes the call reject with a `ToolCallError` carrying the
tool's text. See the [core README](./packages/tool-codegen-core/README.md).

**3. Use the React hooks.** Add the React package and TanStack Query, set `react: true` in the
config and generate again: `hooks.tsx` joins `tools.ts`. The app brings its own
`QueryClientProvider`; `ToolCallerProvider` supplies the caller (`null` until the connection
stands, and the queries wait for it):

```sh
pnpm add @miragon/mcp-toolkit-tool-codegen-react @tanstack/react-query
```

```tsx
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useTasksAddTaskMutation, useTasksListTasksQuery } from "./generated/hooks.js"

const queryClient = new QueryClient()

export function Tasks({ callTool }: { callTool: ToolCaller | null }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToolCallerProvider callTool={callTool}>
        <OpenTasks />
      </ToolCallerProvider>
    </QueryClientProvider>
  )
}

function OpenTasks() {
  const list = useTasksListTasksQuery({ done: false })
  const addTask = useTasksAddTaskMutation() // on success, every "tasks" query is invalidated
  if (list.isPending) return <p>Loading tasks</p>
  if (list.isError) return <p>{list.error.message}</p>
  return (
    <>
      <ul>
        {list.data.tasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
      <button onClick={() => addTask.mutate({ title: "Tag the release" })}>Add a task</button>
    </>
  )
}
```

A tool annotated `readOnlyHint: true` gets a query hook; every other tool gets a mutation hook,
since a query re-runs its tool on every refetch. See the
[react README](./packages/tool-codegen-react/README.md).

## Coming from 2.x

- `@miragon/mcp-toolkit-core` and `@miragon/mcp-toolkit-ui` are no longer developed here. Their
  published 2.x versions stay on npm. The docs site, the hosted playground and the starter
  template are no longer built from this repository either.
- `@miragon/mcp-toolkit-tool-codegen` 3.0 breaks:
  - Config: `proxyName` is now `name` and `upstreamUrl` is now `url`; the old keys fail with a hint.
    `out` resolves against the config file's directory, not the working directory.
  - Tool names are no longer prefixed: the map is keyed by the server's own names (`"list_tasks"`,
    not `"tasks_list_tasks"`), and so are `overrides`.
  - `@miragon/mcp-toolkit-tool-codegen/runtime` is gone: `ToolShape`, `TypedCallTool` and the rest
    of the runtime live in `@miragon/mcp-toolkit-tool-codegen-core`, which `tools.ts` now imports.
  - Hooks are opt-in (`react: true`), import `@miragon/mcp-toolkit-tool-codegen-react` instead of
    `@miragon/mcp-toolkit-ui`, and need a `ToolCallerProvider` under your `QueryClientProvider`.
    Read-only tools get `use<Name><Tool>Query`, all others `use<Name><Tool>Mutation`.

The full list, including the CLI flags, the renamed exports and the `QueryClient` defaults 2.x set,
is in the tool-codegen README under
[Migrating from 2.x](./packages/tool-codegen/README.md#migrating-from-2x).

## Development

Node.js 22.22.2 or newer (mcp-use's minimum, used by the example and the codegen tests) and pnpm
10.32.1 (pinned in `packageManager`, `corepack enable` picks it up).

```sh
pnpm install
pnpm build           # first: the packages resolve each other through their built dist
pnpm typecheck
pnpm test            # every package and the example (with its drift gate), and scripts/*.test.mjs
pnpm lint
pnpm format:check    # pnpm format writes
pnpm check:exports   # publint and attw against the built packages
pnpm test:mutation   # Stryker for tool-codegen and tool-codegen-core
```

`pnpm test:coverage` runs the package tests against the coverage floors in each
`vitest.config.ts`. [`CONTRIBUTING.md`](./CONTRIBUTING.md) lists the bar for a pull request.

## Releases

[release-please](https://github.com/googleapis/release-please) reads the Conventional Commits on
`main` and keeps a Release PR open that bumps the three packages in lockstep and writes
`CHANGELOG.md`. A breaking change needs `!` or a `BREAKING CHANGE:` footer on the commit that lands
on `main`; the PR-title check also validates the subject of a single-commit PR, which GitHub uses as
the squash title. Merging the Release PR tags `v<version>` and creates the GitHub release; then one
publish job per package publishes it to npm with trusted publishing (OIDC, with provenance, no
`NPM_TOKEN`), skipping a version that is already on npm. The jobs run in dependency order (core,
then react, then the generator), so generated code never reaches npm ahead of its runtime.
`.github/workflows/publish-npm-package.yml` packs a package in one job and publishes the tarball
from another, the only one with the id-token, which runs no install, no build and no lifecycle
script.

Trusted publishing is configured per package on npmjs.com (Settings → Trusted publishing → GitHub
Actions): this repository, the workflow `release-please.yml` (npm checks the calling workflow, not
the reusable one) and the environment `npm`. `npm trust list @miragon/mcp-toolkit-tool-codegen`
shows the configuration that works; copy it. The `npm` environment should allow `main` only and ask
for a reviewer, which is what binds publishing to `main`. Dispatching `release-please.yml` with
`dry_run` packs the three packages without publishing; `force_publish` (on `main` only) publishes
the versions in `package.json` again after a failed run.

A package that is not on npm yet has no trusted-publishing settings, and npm expires a new
configuration that sees no publish within two days. For the first release of
`@miragon/mcp-toolkit-tool-codegen-core` and `-react` (3.0.0), before merging its Release PR:

1. Publish a placeholder of each by hand with pnpm (which rewrites the `workspace:` ranges), for
   example with the version set to `0.0.0-bootstrap.0` locally and
   `pnpm publish --access public --tag bootstrap`. npm may point `latest` at it until 3.0.0
   replaces it.
2. Configure each package's trusted publisher as above.
3. Merge the Release PR within two days: its OIDC publish of 3.0.0 validates the configuration.
   Do not publish 3.0.0 by hand.
