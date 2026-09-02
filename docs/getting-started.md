# Getting started

Zero-install first look: the [hosted playground](playground/index.md) is a
public toolkit server with a guided tour — call a tool, watch a widget render,
chain a pipeline. Nothing to clone.

Then two paths, in the order we recommend them:

1. [Run the examples](#run-the-examples-first) — see a complete host working in
   four commands. Works in a fresh clone, no npm auth.
2. [Start your own project](#start-your-own-project) — consume the published
   packages outside this repo.

## Run the examples first

From the repo root:

```sh
corepack enable                          # the repo pins pnpm via `packageManager`
pnpm install                             # `prepare` scripts build the package dists
pnpm --filter @miragon/mcp-toolkit-examples run dev:standalone
```

`dev:standalone` is the standard loop — the workflow mcp-use itself
propagates: [`examples/standalone-host`](../examples/standalone-host/README.md)
is a plain mcp-use project with `installToolkit` on top, run through
`mcp-use dev`. The CLI builds the views with HMR and prints the **built-in
inspector** URL (`…/mcp/inspector`) — call `show_tasks_board` there. That is
the full loop: an MCP tool returning a rendered widget, hot-reloading as you
edit the widget sources.

The full three-module host (articles, tasks, orders — the `createFrameworkApp`
Node-adapter path with the visual builder) is:

```sh
cp examples/env.example examples/.env    # first time only
pnpm --filter @miragon/mcp-toolkit-examples start
```

`start` builds the widget bundle and serves on `:3010` — see
[examples/README.md](../examples/README.md) for what each module proves.
Smoke-test it from the shell:

```sh
curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

For fixture-driven UI work without any server or `.env`, the optional widget
playground remains (fixture data, simulated host):

```sh
pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
```

::: tip Running processes individually
`dev:host` alone expects the widget bundle to exist — run
`pnpm --filter @miragon/mcp-toolkit-examples build:bundle` once first (the
one-shot `start` does this for you). And since the mcp-use 2.x move the
Node-adapter host reads the bundle once at boot: after a rebuild, restart it.
:::

## Start your own project

### The fast way: use the template

[`Miragon/mcp-toolkit-starter`](https://github.com/Miragon/mcp-toolkit-starter)
is a self-contained starter — a plain mcp-use project with the toolkit on top:
one module with its own tools, one widget, and `views/` built and served by the
mcp-use CLI — with pinned versions and CI prepared. Click "Use this template",
or:

```sh
gh repo create my-mcp-server --template Miragon/mcp-toolkit-starter --private --clone
```

Then follow its README. The starter is an auto-synced mirror of
[`templates/minimal-server`](../templates/minimal-server/README.md) in this
repo — copying that directory works just as well.

### By hand

The packages live on the public npm registry under the `@miragon` scope — no
`.npmrc` or token needed. Install — the peer dependencies are pinned exactly,
so match them:

```sh
pnpm add @miragon/mcp-toolkit-core
pnpm add mcp-use@2.3.3 zod@4.4.3
```

### The standard path — a plain mcp-use project, toolkit on top

You own a normal [mcp-use](https://mcp-use.com) project (own `MCPServer`,
`views/` convention, `mcp-use dev` / `build` / `start`); `installToolkit`
adds the composition features:

```ts
// index.ts
import { MCPServer } from "mcp-use"
import { installToolkit } from "@miragon/mcp-toolkit-core/tools"
import { createPlugin as createTasksPlugin } from "./modules/tasks/plugin.js"

const server = new MCPServer({ name: "my-mcp", version: "0.1.0" })

server.tool({ name: "echo", ... }, handler) // your plain mcp-use tools

installToolkit(server, { modules: [createTasksPlugin()] })

export default server
```

Add `views/render-view/view.tsx` (plus one `views/<tool>/view.tsx` per
model-visible widget tool), each rendering `McpToolkitApp` with your widget
map — the CLI discovers, builds, and serves them by convention. The runnable
reference is
[`examples/standalone-host`](../examples/standalone-host/README.md).

### The Node adapter — `createFrameworkApp`

When the server must run in your own process (embedded in existing
infrastructure, custom entrypoints) or ship its views inline in the MCP
resources (e.g. behind gateways that only forward the JSON-RPC endpoint),
use the batteries-included wrapper instead:

```ts
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { createPlugin as createTasksPlugin } from "./modules/tasks/plugin.js"

const here = path.dirname(fileURLToPath(import.meta.url))

const app = await createFrameworkApp({
  name: "my-mcp",
  version: "0.1.0",
  plugins: [createTasksPlugin()], // your AppPlugins
  app: {
    bundle: {
      jsPath: path.join(here, "dist", "mcp-app.js"),
      cssPath: path.join(here, "dist", "mcp-app.css"),
    },
  },
})

await app.listen(Number(process.env.PORT ?? 3010))
```

Both paths boot the same framework surface — the tool trio
(`get-framework-manifest`, `render-view`, `refresh-view`) plus mcp-use's
natively registered view resources (`ui://views/<tool>.html`); they differ
only in who builds and serves the views. Aggregating several such servers
into one surface is an external MCP gateway's job (e.g.
[agentgateway](https://agentgateway.dev)) — see
[architecture](concepts/architecture.md).

Things the snippets lean on:

- **The plugin** — a module that registers its own tools and a widget. See the
  [app-plugins concept](concepts/app-plugins.md); the runnable
  reference is [`examples/modules/tasks`](../examples/modules/tasks/README.md).
- **The widget bundle** (adapter path only) — `app.bundle` must point at a
  built ES module (and stylesheet) that maps widget ids to React components.
  The template ships this Vite setup; in-repo the reference is
  [`examples/app-bundle`](../examples/app-bundle/).

Import paths are deliberate: server-side factories come from
`@miragon/mcp-toolkit-core/tools` (never the root barrel, which stays
browser-safe), widget-side hooks from `@miragon/mcp-toolkit-ui/app` and
`@miragon/mcp-toolkit-ui/hooks`. See each package README for the subpath map.

## Where to next

- [Playground tour](playground/tour.md) — the toolkit's feature surface as a
  click-through: widgets, composed views, pipelines, builder.
- [Architecture](concepts/architecture.md) — what the server actually does on
  each request.
- [Using tool-codegen](guides/using-tool-codegen.md) — typed tool calls from
  steps and widgets, worked through the articles module.
- [Env var reference](reference/env-vars.md) — all config knobs.
