# Keep generated code in sync

Let CI fail when the committed generated files no longer match the server's tools, and run the
same check before you push.

**Requirements:** a project set up as in [Generate typed tools](./generate.md), with the
generated files committed.

The examples use the server of `examples/tasks` and a project in `/home/you/tasks-client`. A line
`...` in an output marks lines left out.

## 1. Check locally

`generate --check` fetches the server's tools, generates in memory and compares the result with
the files in `out`. It writes nothing:

```sh
pnpm exec mcp-tool-codegen generate --check
```

```txt
up to date: 4 tools in /home/you/tasks-client/src/generated
```

It exits 0 when the files are up to date. The comparison skips the `// Source:` line, which names
the server's origin, so the check passes against the same tools at another address: a CI service
host, another port. A script in `package.json` gives it a short name:

```json
{
  "scripts": {
    "generate": "mcp-tool-codegen generate",
    "generate:check": "mcp-tool-codegen generate --check"
  }
}
```

## 2. Read a drift report

Say the server's `add-task` gained an optional `due` parameter. The committed `tools.ts` lacks
it, and the check fails with exit code 1:

```sh
pnpm exec mcp-tool-codegen generate --check
```

```txt
drift: tools.ts differs from a fresh generation
  - 17: }
  + 17:   /**
  - 18:
  + 18:    * When the task is due, as an ISO date.
  - 19: export interface TasksAddTaskOutput {
  + 19:    */
  - 20:   /**
  + 20:   due?: string
...
run "mcp-tool-codegen generate" to update /home/you/tasks-client/src/generated
```

The report compares the files line by line at the same position, so a new line shifts every line
after it, and it stops after 20 differing positions (each up to two lines, `-` and `+`). The lines
marked `+` are the fresh generation: here the new `due` property of `TasksAddTaskInput`.

Two other reports name a whole file. With `react: true` but no `hooks.tsx` yet:

```txt
drift: hooks.tsx is missing in /home/you/tasks-client/src/generated
run "mcp-tool-codegen generate" to update /home/you/tasks-client/src/generated
```

With `react` turned off but the generated `hooks.tsx` still there:

```txt
drift: hooks.tsx is stale: react is off, so generate would remove it
run "mcp-tool-codegen generate" to update /home/you/tasks-client/src/generated
```

In every case, run `pnpm generate`, review the diff and commit it. Exit code 1 also means the
server could not be reached or the config is invalid; the message says which. Exit code 2 is a
wrong command line.

## 3. Run the check in CI

When the server lives in the same repository, start it in the job and run the check against it.
`pnpm serve` stands for the script that starts your server (in `examples/tasks`:
`tsx src/server.ts`). This GitHub Actions workflow waits until the port accepts connections:

```yaml
name: Generated code

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      # Reads the pnpm version from packageManager in package.json.
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Start the MCP server
        run: |
          pnpm serve &
          timeout 60 bash -c 'until (echo > /dev/tcp/localhost/4000) 2>/dev/null; do sleep 1; done'
      - run: pnpm generate:check
```

For a server elsewhere, such as a staging deployment, let the config read its URL and token from
the environment ([Generate typed tools](./generate.md#send-a-token-or-headers-at-build-time) has
the rules for `auth`):

```ts
import type { CodegenConfig } from "@miragon/mcp-toolkit-tool-codegen"

const token = process.env.TASKS_TOKEN

const config: CodegenConfig = {
  name: "tasks",
  url: process.env.TASKS_MCP_URL ?? "http://localhost:4000/mcp",
  auth: token ? { mode: "bearer", token } : { mode: "none" },
  out: "./src/generated",
}

export default config
```

Then set both on the step:

```yaml
- run: pnpm generate:check
  env:
    TASKS_MCP_URL: https://tasks.staging.example.com/mcp
    TASKS_TOKEN: ${{ secrets.TASKS_TOKEN }}
```

## Check without a running server

When your tests can boot the server in process, the drift check can be a test that needs no
server in CI. The generator's API does what `generate --check` does: `fetchTools` reads the tools,
`renderCodegen` generates in memory, and `checkCodegenOutput` compares with `out`, the
`// Source:` line aside. For an mcp-use server like the one in `examples/tasks`, with Vitest:

```ts
import path from "node:path"
import { checkCodegenOutput, fetchTools, renderCodegen } from "@miragon/mcp-toolkit-tool-codegen"
import { expect, it } from "vitest"
import config from "../codegen.config.js"
import { createTasksServer } from "../src/server.js"

it("the committed generated code equals a fresh generation", async () => {
  const server = createTasksServer()
  const { port } = await server.listen(0, { host: "127.0.0.1" })
  try {
    const tools = await fetchTools({ url: `http://127.0.0.1:${port}/mcp` })
    const result = await renderCodegen(tools, config)
    const outDir = path.resolve(import.meta.dirname, "..", config.out)
    const drift = await checkCodegenOutput(result, outDir)
    expect(drift.map(({ file, kind }) => `${file} is ${kind}`)).toEqual([])
  } finally {
    await server.close()
  }
})
```

A relative `outDir` resolves against the working directory, which is why the test resolves `out`
against the config file's directory, as the CLI does. With the `due` parameter from step 2, the
test fails:

```txt
...
AssertionError: expected [ 'tools.ts is changed' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "tools.ts is changed",
+ ]
...
```

`examples/tasks` runs the same check in `test/codegen.test.ts`, as part of its tests.

## Next steps

- [Generated code](../reference/generated-code.md): what the files hold, line by line.
- [CLI](../reference/cli.md): `generate --check` and the exit codes.
- [Guarantees and limits](../guarantees.md): what the generator does with the server's text.
