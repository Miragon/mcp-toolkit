# Configuration

Every key of the codegen config file, how `mcp-tool-codegen generate` loads the file and where it
writes the generated code.

**Requirements:** Node.js 22.18 or newer for a `.ts` config. A `.mjs` config loads on every
Node.js the CLI runs on (20 or newer).

<dl class="facts">
  <dt>File</dt><dd><code>codegen.config.ts</code> in the working directory, or the file <code>--config</code> names</dd>
  <dt>Type</dt><dd><code>CodegenConfig</code> from <code>@miragon/mcp-toolkit-tool-codegen</code></dd>
  <dt>Read by</dt><dd><code>mcp-tool-codegen generate</code>; <code>inspect</code> reads no config</dd>
</dl>

The config of `examples/tasks`:

```ts
// Read by `mcp-tool-codegen generate` (Node.js strips the types itself, so only erasable
// TypeScript here: type imports and annotations, no enums or namespaces).
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const config: CodegenConfig = {
  name: "tasks",
  url: process.env.TASKS_MCP_URL ?? "http://localhost:4000/mcp",
  out: "./src/generated",
  react: true,
}

export default config
```

## Keys

| Key         | Type                           | Required | Default            | What it does                                                               |
| ----------- | ------------------------------ | -------- | ------------------ | -------------------------------------------------------------------------- |
| `name`      | `string`                       | yes      |                    | Names the generated code and is the namespace of its React query keys.     |
| `url`       | `string`                       | yes      |                    | The streamable HTTP endpoint of the MCP server whose `tools/list` is read. |
| `auth`      | `CodegenAuth`                  | no       | `{ mode: "none" }` | Static auth for the build-time handshake.                                  |
| `headers`   | `Record<string, string>`       | no       | none               | Extra request headers, sent after the auth header.                         |
| `out`       | `string`                       | yes      |                    | The directory the generated files go into.                                 |
| `react`     | `boolean`                      | no       | `false`            | Also write `hooks.tsx` with React hooks.                                   |
| `overrides` | `Record<string, ToolOverride>` | no       | none               | Per-tool settings, keyed by the tool name as the server lists it.          |

Any other key fails the run with `unknown key "<key>"`. The 2.x keys `proxyName` and `upstreamUrl`
fail with a message that names their replacement (`"proxyName" was renamed to "name" in 3.0`).
`CodegenConfig`, `CodegenAuth` and `ToolOverride` are exported as types by
`@miragon/mcp-toolkit-tool-codegen`.

### `name`

- Starts with an ASCII letter, then letters, digits, `-` and `_` (`^[A-Za-z][A-Za-z0-9_-]*$`).
- Every generated name is built from its PascalCase form: the runs of `A-Z`, `a-z` and `0-9`, each
  capitalised, a letter after a digit upper-cased.
- A name whose generated names equal an import fails the run: `typed` (`TypedCallTool`), and `tool`
  with `react: true` and a query hook (`toolQueryKey`). See
  [Generated code](./generated-code.md#collisions).
- The namespace of the React query keys is `name` as written.
- An app that calls several servers gives each config its own `name`; `ToolCallerProvider` takes
  it as its `namespace`.

| Generated             | `name: "tasks"`                               | `name: "my-app"`                              |
| --------------------- | --------------------------------------------- | --------------------------------------------- |
| Prefix                | `Tasks`                                       | `MyApp`                                       |
| Tool map              | `TasksToolMap`                                | `MyAppToolMap`                                |
| Client factory        | `createTasksClient`                           | `createMyAppClient`                           |
| Types of `list-tasks` | `TasksListTasksInput`, `TasksListTasksOutput` | `MyAppListTasksInput`, `MyAppListTasksOutput` |
| Query hook            | `useTasksListTasksQuery`                      | `useMyAppListTasksQuery`                      |
| Query key helper      | `tasksQueryKey`                               | `myAppQueryKey`                               |
| Query key namespace   | `"tasks"`                                     | `"my-app"`                                    |

Every name with its rule: [Generated code](./generated-code.md#names).

### `url`

- An `http:` or `https:` URL of the server's streamable HTTP endpoint.
- No user name or password in it: `https://user:secret@example.com/mcp` fails with
  `"url" must not carry credentials: put them into "auth"`.
- Only its origin (scheme, host and port) appears in the generated files' `// Source:` line and in
  the CLI's messages, never its path, query or credentials.
- The config is code, so the URL can come from an environment variable, as `TASKS_MCP_URL` above.

### `auth`

| Mode     | Shape                                                   | Request header                  |
| -------- | ------------------------------------------------------- | ------------------------------- |
| `none`   | `{ mode: "none" }`                                      | none                            |
| `bearer` | `{ mode: "bearer", token: string }`                     | `authorization: Bearer <token>` |
| `header` | `{ mode: "header", headerName: string, value: string }` | `<headerName>: <value>`         |

- Each shape takes exactly its keys; any other key fails the run.
- `token` must not be empty or blank. `headerName` is an HTTP header name (an RFC 9110 token).
- `token` and `value` must not contain line breaks, control characters or characters beyond
  Latin-1. The message names where the problem sits, never the value.
- OAuth is not supported. Run the flow once and pass the access token as `bearer`.

The token from an environment variable, none when it is unset:

```ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const token = process.env.TASKS_TOKEN

export default {
  name: "tasks",
  url: "http://localhost:4000/mcp",
  auth: token ? { mode: "bearer", token } : { mode: "none" },
  out: "./src/generated",
} satisfies CodegenConfig
```

### `headers`

- An object of header names and string values. A name is an HTTP header name; a value follows the
  rule of `auth` values.
- Sent with every request of the handshake, after the auth header. Names compare
  case-insensitively, so a header named like the auth header (`Authorization`) replaces it.

### `out`

- A non-empty path. A relative path resolves against the directory of the config file, not the
  working directory; an absolute path stays as it is.
- `generate` creates the directory with its parents and writes `tools.ts`, plus `hooks.tsx` with
  `react: true`. Other files in the directory stay untouched.
- `generate --check` compares the files in this directory and writes nothing.

### `react`

- `true`: `generate` also writes `hooks.tsx`.
- `false` or left out: only `tools.ts`. A `hooks.tsx` the generator wrote earlier (its first line
  starts with `// AUTO-GENERATED by @miragon/mcp-toolkit-tool-codegen.`) is removed by `generate`
  and reported as stale by `generate --check`. A `hooks.tsx` without that line stays.

### `overrides`

Each key is a tool name as the server lists it. An override for a tool the server does not list
fails the run once the tool list has arrived.

| Key          | Type                    | Default                                            | What it does                                                           |
| ------------ | ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `input`      | `string`                | the type of `inputSchema`                          | A TypeScript type expression that replaces the input type.             |
| `output`     | `string`                | the type of `outputSchema`; `unknown` without one  | A TypeScript type expression that replaces the output type.            |
| `hook`       | `"query" \| "mutation"` | `query` with `readOnlyHint: true`, else `mutation` | Forces the kind of the tool's hook in `hooks.tsx`.                     |
| `identifier` | `string`                | the tool name                                      | Builds the tool's identifiers from this name instead of the tool name. |

- `input`, `output`: non-empty. The expression goes into `tools.ts` trimmed and unchecked, as
  `export type <Name><Tool>Input = <expression>` (or `Output`); a wrong one shows up when you
  compile. With an `input` override, `args` is always required.
- `output`: a result without `structuredContent` is its first text block, read as JSON when it
  parses as JSON. Text such as `"2.10"` or `"true"` arrives as a number or a boolean, so
  `output: "string"` is only right for text that never parses as JSON.
- `hook`: changes only `hooks.tsx`. `inspect` reads no config and shows the kind by
  `readOnlyHint` alone.
- `identifier`: a letter, then letters and digits (`^[A-Za-z][A-Za-z0-9]*$`). With
  `identifier: "searchAll"` the tool gives `<Name>SearchAllInput`, the client method `searchAll`
  and `use<Name>SearchAllQuery` (or `Mutation`). The tool map key and every call keep the tool's
  own name. Use it for a name that collides with another tool's, with a client member such as
  `then`, or that has no ASCII letter or digit.

For a server with the tools `get-task` and `über-liste`:

```ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

export default {
  name: "tasks",
  url: "http://localhost:4000/mcp",
  out: "./src/generated",
  react: true,
  overrides: {
    "get-task": { hook: "query" },
    "über-liste": { identifier: "uberList", output: "{ items: string[] }" },
  },
} satisfies CodegenConfig
```

## Loading the file

- `--config <path>` resolves against the working directory; without it the CLI reads
  `codegen.config.ts` there.
- The CLI imports the file with Node.js, takes its default export and validates it. The file runs
  as code: imports and `process.env` work.
- A TypeScript config goes through Node.js's built-in type stripping: only erasable TypeScript
  (type imports, annotations, `satisfies`), no enums, namespaces or parameter properties.

| File extension | Loads                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `.ts`          | Node.js 22.18 or newer, not in a package with `"type": "commonjs"`                                             |
| `.mts`         | Node.js 22.18 or newer, in every package                                                                       |
| `.cts`         | Node.js 22.18 or newer, in every package, with `module.exports = { ... }`, which Node.js hands over as default |
| `.js`          | not in a package with `"type": "commonjs"`                                                                     |
| `.mjs`         | in every package                                                                                               |
| `.cjs`         | in every package, with `module.exports = { ... }`, which Node.js hands over as default                         |

In a package without a `"type"` field, Node.js loads a `.ts` or `.js` config with ES module syntax
after a `MODULE_TYPELESS_PACKAGE_JSON` warning; `"type": "module"` silences it.

| Message                                                                                                                                               | Cause                                      | What helps                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `config file not found: <path>`                                                                                                                       | No file at the resolved path               | Run in the right directory or pass `--config`.                  |
| `cannot load <path> (Node.js loads a .ts config from version 22.18 on; use a .mjs config, or run the CLI with NODE_OPTIONS="--import tsx"): <reason>` | A `.ts` config on Node.js before 22.18     | Update Node.js, use a `.mjs` config or run the CLI through tsx. |
| `cannot load <path> (in a CommonJS package, name the config codegen.config.mts and pass it with --config): <reason>`                                  | An ES module config in a CommonJS package  | Rename it to `.mts` and pass `--config codegen.config.mts`.     |
| `cannot load <path>: <reason>`                                                                                                                        | Any other error while importing the file   | Fix what `<reason>` names.                                      |
| `<path> has no default export`                                                                                                                        | The module exports the config by name only | Add `export default`.                                           |
| `invalid codegen config:` and one line per problem                                                                                                    | A key fails validation                     | Fix every listed key.                                           |

## Validation

The CLI checks the whole config before it connects to the server and lists every problem in one
message. A config with several problems:

```ts
export default {
  proxyName: "tasks",
  url: "https://user:secret@example.com/mcp",
  out: "",
  react: "yes",
  overrides: { "get-task": { hook: "read", pageSize: 10 } },
}
```

`generate` names each one and exits with 1:

```sh
pnpm exec mcp-tool-codegen generate --config broken.config.ts
```

```txt
mcp-tool-codegen: invalid codegen config:
  | - "proxyName" was renamed to "name" in 3.0
  | - "name" must start with a letter and contain only letters, digits, "-" and "_"
  | - "url" must not carry credentials: put them into "auth"
  | - "out" must be a non-empty string
  | - "react" must be a boolean
  | - "overrides" entry "get-task" has the unknown key "pageSize"
  | - "overrides" entry "get-task": "hook" must be "query" or "mutation"
```

The tool names of `overrides` are checked against the server's list, so that check comes after the
connection:

```sh
pnpm exec mcp-tool-codegen generate --config unknown-tool.config.ts
```

```txt
mcp-tool-codegen: "overrides" names tools the server does not list: "delete-task"
```

## Next steps

- [CLI](./cli.md): the commands that read this file, their output and exit codes.
- [Generated code](./generated-code.md): what `name`, `react` and `overrides` change in the
  output.
- [Generate typed tools](../guides/generate.md): a config from scratch, step by step.
