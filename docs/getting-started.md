# Getting started

Generate typed TypeScript for the example MCP server of this repository, make a first typed tool
call from Node.js and watch the compiler reject a wrong argument.

**Requirements:** Node.js 22.22.2 or later, the minimum of the example server this guide runs
(the CLI alone runs on Node.js 20 and loads a `.ts` config from 22.18 on), pnpm
(`corepack enable` provides it) and git.

::: tip With your own MCP server
Skip step 1, use your server's streamable HTTP endpoint as `url` and pick your own `name`. Steps 2
and 3 work as shown. In steps 4 and 5, call `create<Name>Client` and your server's tools instead
of `addTask` and `listTasks`.
:::

## 1. Start the example server

The example in `examples/tasks` is an MCP server with four tools for a small task list. Clone the
repository, install the example and the packages it uses, and start the server:

```sh
git clone https://github.com/Miragon/mcp-toolkit.git
cd mcp-toolkit
pnpm install --filter "@miragon/mcp-toolkit-example-tasks..."
cd examples/tasks
pnpm serve
```

```txt
> @miragon/mcp-toolkit-example-tasks@0.0.0 serve /home/you/mcp-toolkit/examples/tasks
> tsx src/server.ts

Tasks MCP server listening on http://localhost:4000/mcp
```

Leave this terminal open: the server keeps running and logs every request. It starts with an
empty task list each time. mcp-use, the framework under the server, sends anonymized usage
telemetry; `MCP_USE_ANONYMIZED_TELEMETRY=false pnpm serve` turns it off.

## 2. Set up a project

In a second terminal, outside the clone, create a project for the client. The generator is a dev
dependency, since it runs at build time. The generated code imports the core package at run time,
and the MCP SDK client connects to the server:

```sh
mkdir tasks-client && cd tasks-client
echo '{ "name": "tasks-client", "private": true, "type": "module" }' > package.json
pnpm add -D @miragon/mcp-toolkit-tool-codegen typescript
pnpm add @miragon/mcp-toolkit-tool-codegen-core @modelcontextprotocol/client
```

`"type": "module"` lets Node.js load the config and the script below as ES modules. `inspect`
shows what the server lists, and that the CLI reaches it:

```sh
pnpm exec mcp-tool-codegen inspect --url http://localhost:4000/mcp
```

```txt
| name | hook | description | input |
| --- | --- | --- | --- |
| list-tasks | query | Lists the tasks in the order they were added. | done |
| get-task | query | Returns one task. | id |
| add-task | mutation | Adds an open task and returns it. | title |
| complete-task | mutation | Marks a task as done and returns it. Completing a done task changes nothing. | id |
```

The `hook` column matters only for React: a tool annotated `readOnlyHint: true` gets a query hook,
every other tool a mutation hook.

## 3. Generate the types

Create `codegen.config.ts`, the file the CLI reads by default:

```ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  name: "tasks",
  url: "http://localhost:4000/mcp",
  out: "./src/generated",
}

export default config
```

`name` names the generated types and the client, `url` is the server's endpoint and `out` the
directory for the generated files, relative to the config file. `generate` reads the server's
`tools/list` and writes `tools.ts`:

```sh
pnpm exec mcp-tool-codegen generate
```

```txt
generated 4 tools: tools.ts in /home/you/tasks-client/src/generated
```

`src/generated/tools.ts` holds an input and an output type for each tool, built from the
server's schemas, and a tool map keyed by the server's own tool names (an excerpt; `// ...` marks
lines left out):

```ts
export interface TasksAddTaskInput {
  /**
   * What there is to do.
   */
  title: string
}

// ...

export interface TasksToolMap {
  "add-task": {
    input: TasksAddTaskInput
    output: TasksAddTaskOutput
  }
  // ...
}
```

## 4. Make a typed call

Create `src/main.ts`. It connects an MCP SDK client to the server, turns it into a `ToolCaller`
with `toolCallerFromClient` and hands that to the generated `createTasksClient`:

```ts
import { toolCallerFromClient } from "@miragon/mcp-toolkit-tool-codegen-core"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createTasksClient } from "./generated/tools.ts"

const client = new Client({ name: "tasks-client", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:4000/mcp")))

const tasks = createTasksClient(toolCallerFromClient(client))

const added = await tasks.addTask({ title: "Write the release notes" })
console.log(`added ${added.id}: ${added.title}`)

const { tasks: open } = await tasks.listTasks({ done: false })
console.log(`open: ${open.map((task) => task.title).join(", ")}`)

await client.close()
```

Node.js runs the TypeScript file itself, which is why the import names `tools.ts`:

```sh
node src/main.ts
```

```txt
added task-1: Write the release notes
open: Write the release notes
```

`added` is a `TasksAddTaskOutput` and `open` an array of tasks, typed by the server's output
schemas. Every run adds a task, so the ids count up while the server runs.

## 5. Let the compiler catch a wrong argument

Create `tsconfig.json`. `allowImportingTsExtensions` allows the `.ts` import, and `skipLibCheck`
skips the SDK's declaration files, which expect the Node.js types:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "esnext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`pnpm exec tsc` checks the project and prints nothing while every call fits the tool map. Now
pass `add-task` a `name` instead of its `title`:

```ts
const added = await tasks.addTask({ name: "Write the release notes" })
```

`tsc` now rejects the call:

```sh
pnpm exec tsc
```

```txt
src/main.ts(10,37): error TS2353: Object literal may only specify known properties, and 'name' does not exist in type 'TasksAddTaskInput'.
```

A tool name the server does not list, such as `tasks.call("add-tasks", ...)`, and a wrong type,
such as `listTasks({ done: "no" })`, fail the same way. Change `name` back to `title`, and the
check passes again.

## Troubleshooting

::: details `cannot list the tools of http://localhost:4000: fetch failed (ECONNREFUSED): is the server running at that address?`
`generate` and `inspect` print this when nothing listens at the URL. Start the server as in
step 1, or fix the port in `url`.
:::

::: details `Error: listen EADDRINUSE: address already in use` after `pnpm serve`
Another process holds port 4000. Start the server with `PORT=4001 pnpm serve` and use
`http://localhost:4001/mcp` in the config and in `src/main.ts`.
:::

::: details `Node.js loads a .ts config from version 22.18 on` with `Unknown file extension ".ts"`
The CLI runs on a Node.js older than 22.18, which cannot load `codegen.config.ts`. Update
Node.js, or use one of the other config formats in
[Generate typed tools](./guides/generate.md#load-the-config-on-older-nodejs-or-in-commonjs).
:::

::: details `"proxyName" was renamed to "name" in 3.0`
The config was written for 2.x. Rename `proxyName` to `name` and `upstreamUrl` to `url`;
[Migrating from 2.x](./migrating-from-2x.md) lists the other changes.
:::

## Next steps

- [Generate typed tools](./guides/generate.md): React hooks, overrides and auth for your own
  server.
- [Call tools from Node and the browser](./guides/call-tools.md): other callers, tool errors and
  the typed client in detail.
- [Keep generated code in sync](./guides/check-in-ci.md): fail CI when the server's tools change.
