# CLI

Every command and flag of `mcp-tool-codegen`, what it prints and which exit code it returns.

**Requirements:** Node.js 22.18 or newer, the first that loads a `.ts` config.

<dl class="facts">
  <dt>Binary</dt><dd><code>mcp-tool-codegen</code></dd>
  <dt>Package</dt><dd><code>@miragon/mcp-toolkit-tool-codegen</code>, a dev dependency</dd>
  <dt>Depends on</dt><dd><code>@modelcontextprotocol/client</code>, <code>handlebars</code>, <code>json-schema-to-typescript</code> and <code>prettier</code>, which json-schema-to-typescript uses too; the core and React packages as optional peers of the same minor version</dd>
  <dt>Exit codes</dt><dd>0 done, 1 failure or drift, 2 usage error</dd>
</dl>

Run it through your package manager (`pnpm exec mcp-tool-codegen`, `npx mcp-tool-codegen`) or from
a script in `package.json`. The runs on this page use the config of `examples/tasks` in a project
at `/home/you/tasks-client`, against the example server (`pnpm serve` in `examples/tasks`).

## Commands

| Command            | What it does                                                                               | Reads      |
| ------------------ | ------------------------------------------------------------------------------------------ | ---------- |
| `generate`         | Reads the server's `tools/list` and writes `tools.ts`, plus `hooks.tsx` with `react: true` | the config |
| `generate --check` | Compares the files in `out` with a fresh generation and writes nothing                     | the config |
| `inspect`          | Prints the server's tools as a Markdown table                                              | its flags  |
| `help`             | Prints the help                                                                            |            |

`--help` prints the synopsis and every flag:

```sh
pnpm exec mcp-tool-codegen --help
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

## `generate`

| Flag              | Value  | Default             | What it does                                                                                     |
| ----------------- | ------ | ------------------- | ------------------------------------------------------------------------------------------------ |
| `--config <path>` | a path | `codegen.config.ts` | The config module, resolved against the working directory. `out` resolves against its directory. |
| `--check`         | none   | off                 | Writes nothing and exits with 1 on drift, see [`generate --check`](#generate---check).           |
| `--help`, `-h`    | none   |                     | Prints the help instead.                                                                         |

`generate` runs these steps and stops at the first that fails, before anything is written:

1. Loads and validates the config ([Configuration](./configuration.md)). Nothing connects before
   the config is valid.
2. Connects to `url` over streamable HTTP with `auth` and `headers`, runs the initialize handshake
   of the 2025 protocol revisions, reads the complete `tools/list` (every page) and closes the
   connection. The MCP SDK checks the list's shape here and rejects, for example, a tool without a
   name.
3. Checks the list: an empty list, a tool listed twice and an override for a tool the server does
   not list fail the run, with `--check` too.
4. Sorts the tools by name and renders `tools.ts`, plus `hooks.tsx` with `react: true`
   ([Generated code](./generated-code.md)).
5. Writes the files into `out`, or compares them with `--check`.

It writes the files and says how many tools they hold:

```sh
pnpm exec mcp-tool-codegen generate
```

```txt
generated 4 tools: tools.ts, hooks.tsx in /home/you/tasks-client/src/generated
```

With `react` turned off after a run that wrote hooks, the same command removes the old
`hooks.tsx`:

```txt
generated 4 tools: tools.ts in /home/you/tasks-client/src/generated
removed the stale hooks.tsx (react is off)
```

### `generate --check`

The drift gate for CI. It compares every line of the files in `out` with a fresh generation, except
the third line, `// Source: <origin>`: that line says where the files were generated from, so a
check against the same tools at another address (a CI service host, another port) passes.

When nothing differs, it exits with 0:

```sh
pnpm exec mcp-tool-codegen generate --check
```

```txt
up to date: 4 tools in /home/you/tasks-client/src/generated
```

After a hand edit in `tools.ts` and with `hooks.tsx` deleted, it names both and exits with 1:

```txt
drift: tools.ts differs from a fresh generation
  - 135:     /** Returns one task by its id. */
  + 135:     /** Returns one task. */
drift: hooks.tsx is missing in /home/you/tasks-client/src/generated
run "mcp-tool-codegen generate" to update /home/you/tasks-client/src/generated
```

With `react` turned off and a generated `hooks.tsx` still in `out`:

```txt
drift: hooks.tsx is stale: react is off, so generate would remove it
run "mcp-tool-codegen generate" to update /home/you/tasks-client/src/generated
```

| Line                                                                   | When                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `up to date: <n> tools in <out>`                                       | Every file matches (stdout, exit 0).                  |
| `drift: <file> is missing in <out>`                                    | A file the config asks for does not exist.            |
| `drift: <file> differs from a fresh generation`                        | The content differs, the `// Source:` line aside.     |
| `  - <line>: <text>` and `  + <line>: <text>`                          | The differing lines: on disk (`-`) and fresh (`+`).   |
| `  ... (more differences not shown)`                                   | 20 line positions differ; the report stops there.     |
| `drift: hooks.tsx is stale: react is off, so generate would remove it` | A generated `hooks.tsx` is left while `react` is off. |
| `run "mcp-tool-codegen generate" to update <out>`                      | Last line after any drift (exit 1).                   |

The lines are compared by position, without aligning them: one inserted line marks every line after
it as different, up to the limit of 20 positions. A position prints up to two lines, `-` and `+`,
so the report shows at most 40.

## `inspect`

| Flag                     | Value       | Default | What it does                                                                          |
| ------------------------ | ----------- | ------- | ------------------------------------------------------------------------------------- |
| `--url <url>`            | a URL       |         | Required. The server's streamable HTTP endpoint, `http:` or `https:`, no credentials. |
| `--token <token>`        | a token     |         | Sends `Authorization: Bearer <token>`.                                                |
| `--header <name>`        | header name |         | Sends a custom auth header with this name. Needs `--header-value`.                    |
| `--header-value <value>` | a value     |         | The value of that header. Needs `--header`.                                           |
| `--help`, `-h`           | none        |         | Prints the help instead.                                                              |

`--token` and `--header` exclude each other. A token or header value must not contain line breaks,
control characters or characters beyond Latin-1. `inspect` reads no config.

It prints one row per tool:

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

| Column        | Content                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| `name`        | The tool name as the server lists it.                                                     |
| `hook`        | `query` when the tool is annotated `readOnlyHint: true`, else `mutation`. No `overrides`. |
| `description` | The tool description on one line.                                                         |
| `input`       | The top-level property names of the input schema, comma-separated.                        |

The rows keep the server's order; `generate` sorts by name. In a cell, `|` is escaped as `\|` and
line breaks and invisible characters become spaces.

## `help`

`help`, `--help` and `-h` print the help to stdout and exit with 0, as does `--help` or `-h` after
a command (`generate --help`). `help` takes no further argument, and a bare `mcp-tool-codegen` is a
usage error.

## Exit codes

| Code | Meaning          | When                                                                                                 |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `0`  | Done             | `generate` wrote, `generate --check` found no drift, `inspect` printed, `help`                       |
| `1`  | Failure or drift | A config error, an unreachable server, an empty tool list, a generation error, drift under `--check` |
| `2`  | Usage error      | An unknown command or flag, a missing value, a flag given twice, a 2.x flag                          |

## Usage errors

A usage error prints the problem and the synopsis to stderr and exits with 2. A 2.x flag names what
replaces it:

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

| Message                                                                                 | When                                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `missing command`                                                                       | No command given.                                       |
| `unknown command "<command>"`                                                           | Not `generate`, `inspect` or `help`.                    |
| `unexpected argument "<argument>"`                                                      | A value without a flag, or anything after `help`.       |
| `unknown flag "<flag>" for <command>`                                                   | The command has no such flag.                           |
| `unknown flag "<flag>" for <command> (<replacement>)`                                   | A flag of 2.x, see the table below.                     |
| `<flag> is given twice`                                                                 | A flag appears twice.                                   |
| `<flag> needs a value`                                                                  | The value is missing or starts with `--`.               |
| `inspect needs --url <url>`                                                             | `inspect` without `--url`.                              |
| `--url must be an http(s) URL`                                                          | The URL does not parse or is not `http:` or `https:`.   |
| `--url must not carry credentials: pass them with --token or --header`                  | The URL holds a user name or password.                  |
| `use either --token or --header with --header-value, not both`                          | `--token` together with `--header` or `--header-value`. |
| `--header and --header-value go together`                                               | One of the two without the other.                       |
| `--header must be a valid header name`                                                  | The name is not an HTTP header name.                    |
| `--token must not contain line breaks, control characters or characters beyond Latin-1` | Also for `--header-value`. The value is never printed.  |

| 2.x flag           | In 3.0                                |
| ------------------ | ------------------------------------- |
| `-c`               | `--config`                            |
| `-u`, `--upstream` | `--url`                               |
| `-o`, `--out`      | Dropped: `out` is set in the config.  |
| `-p`, `--proxy`    | Dropped: `name` is set in the config. |

## Errors

Any other failure prints `mcp-tool-codegen: <message>` to stderr and exits with 1. With the
example server stopped:

```sh
pnpm exec mcp-tool-codegen generate
```

```txt
mcp-tool-codegen: cannot list the tools of http://localhost:4000: fetch failed (ECONNREFUSED): is the server running at that address?
```

A message can carry the server's text (an HTTP error body, tool names, schema errors). The CLI
turns invisible characters into spaces, writes every `##[` as `## [` (a GitHub Actions runner reads
that form as a command anywhere in a line), cuts the message after 2,000 characters
(`... (truncated)`) and indents every line after the first with two spaces, a `|` and a space, so
no server text starts a line of the log. What the MCP SDK prints while the tools are fetched, a
warning or a debug line, goes the same way: to stderr, as `mcp-tool-codegen: <message>`.

In the messages below, `...` stands for text left out on this page; the CLI prints the full message.

| Message                                                                                                                                                         | When                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `config file not found: <path>` and the other loading errors                                                                                                    | The config cannot be loaded, see [Configuration](./configuration.md#loading-the-file).                                                        |
| `invalid codegen config:` and one line per problem                                                                                                              | The config fails validation, see [Configuration](./configuration.md#validation).                                                              |
| `cannot list the tools of <origin>: <reason>`                                                                                                                   | The connection, the handshake or `tools/list` failed. A refused connection adds the system code and `is the server running at that address?`. |
| `cannot list the tools of <origin>: Invalid result for tools/list: ...`                                                                                         | The server's `tools/list` fails the MCP SDK's schema check, for example a tool without a name. The SDK's errors follow on the next lines.     |
| `the server at <origin> lists no tools, so nothing was generated. Check that "url" names its MCP endpoint, ...`                                                 | `tools/list` is empty after every page: a wrong path, another server, or `auth` without the scope that shows the tools. Also under `--check`. |
| `the server lists the tool "<name>" twice`                                                                                                                      | Two entries share a name.                                                                                                                     |
| `"overrides" names tools the server does not list: <names>`                                                                                                     | An `overrides` key matches no tool.                                                                                                           |
| `cannot generate code for the tool "<name>": its name has no ASCII letter or digit ...`                                                                         | No identifier can be built, see [Generated code](./generated-code.md#collisions).                                                             |
| `cannot generate tools.ts: ... both produce the identifier "<identifier>". ...`                                                                                 | Two declarations would share a name, see [Generated code](./generated-code.md#collisions).                                                    |
| `cannot generate the client of tools.ts: ... both produce the identifier "<identifier>". ...`                                                                   | Two client methods would share a name, or one is a reserved member.                                                                           |
| `cannot generate hooks.tsx: ... both produce the identifier "<identifier>". Change the config name.`                                                            | The config's query key helper would take the name of an import.                                                                               |
| `cannot generate the <input or output> type of the tool "<name>": <reason>. Set overrides["<name>"].<input or output> to a TypeScript type to skip its schema.` | The schema cannot be turned into a type.                                                                                                      |

## Environment variables

The CLI reads no variable of its own. Two reach it through Node.js and the config:

| Variable                      | Effect                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `NODE_OPTIONS="--import tsx"` | Loads a `.ts` config on Node.js before 22.18 (tsx installed in the project). |
| Any variable the config reads | The config is code: `process.env.TASKS_MCP_URL` in `examples/tasks`.         |

## Programmatic API

`@miragon/mcp-toolkit-tool-codegen` exports the steps of `generate` as functions (an ES module):

```ts
function generateTools(config: CodegenConfig): Promise<CodegenResult>
function renderCodegen(
  tools: readonly ToolDescriptor[],
  config: CodegenConfig,
): Promise<CodegenResult>
function fetchTools(options: FetchToolsOptions): Promise<ToolDescriptor[]>
function writeCodegenOutput(
  result: CodegenResult,
  outDir: string,
): Promise<{ written: CodegenFile[]; removed: CodegenFile[] }>
function checkCodegenOutput(result: CodegenResult, outDir: string): Promise<CodegenDrift[]>
```

| Export               | What it does                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateTools`      | Validates the config, reads `tools/list` and renders the files. Writes nothing. Rejects an empty list, as `generate` does.                                  |
| `renderCodegen`      | Renders the files from a tool list, without a network call, an empty list too. An entry without a name fails with `the server lists a tool without a name`. |
| `fetchTools`         | Runs the handshake and returns the complete `tools/list` in the server's order.                                                                             |
| `writeCodegenOutput` | Writes the files and removes a stale generated `hooks.tsx`. A relative `outDir` resolves against the working directory.                                     |
| `checkCodegenOutput` | Compares as `generate --check` does; `[]` when up to date.                                                                                                  |

| Type                | Shape                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodegenConfig`     | The config, see [Configuration](./configuration.md#keys).                                                                                                             |
| `ToolOverride`      | `{ input?: string; output?: string; hook?: "query" \| "mutation"; identifier?: string }`                                                                              |
| `CodegenAuth`       | `{ mode: "none" } \| { mode: "bearer"; token: string } \| { mode: "header"; headerName: string; value: string }`                                                      |
| `CodegenResult`     | `{ toolsFile: string; hooksFile?: string; tools: ToolDescriptor[] }`: `hooksFile` only with `react: true`, `tools` sorted by name                                     |
| `FetchToolsOptions` | `{ url: string; auth?: CodegenAuth; headers?: Record<string, string> }`                                                                                               |
| `ToolDescriptor`    | `{ name: string; title?: string; description?: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>; annotations?: ToolAnnotations }` |
| `ToolAnnotations`   | `{ title?: string; readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }`                                            |
| `CodegenFile`       | `"tools.ts" \| "hooks.tsx"`                                                                                                                                           |
| `CodegenDrift`      | `{ file: CodegenFile; kind: "missing" \| "changed" \| "stale"; expected?: string; actual?: string }`                                                                  |

The drift test of `examples/tasks` boots the server in the test process and compares without the
CLI. Unlike the CLI, `checkCodegenOutput` resolves a relative `outDir` against the working
directory, so the test resolves `out` against the config's directory itself:

```ts
const { default: config } = await import("../codegen.config.js")
const result = await renderCodegen(await fetchTools({ url: server.url.href }), config)

const outDir = path.resolve(path.dirname(CONFIG_FILE), config.out)
expect(await checkCodegenOutput(result, outDir)).toEqual([])
```

## Next steps

- [Configuration](./configuration.md): every key `generate` reads.
- [Keep generated code in sync](../guides/check-in-ci.md): `generate --check` in CI and before a
  commit.
- [Generated code](./generated-code.md): what the written files contain.
