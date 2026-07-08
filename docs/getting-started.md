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
cp examples/env.example examples/.env    # first time only
pnpm --filter @miragon/mcp-toolkit-examples start
```

`start` builds all widget bundles, boots the two demo upstreams
(articles `:4000`, customers `:4001`), and starts the host on `:3010` once both
upstreams are up. The host serves four modules covering every module kind —
see [examples/README.md](../examples/README.md) for what each one proves.

Now look at it:

- **Inspector** — open `http://localhost:3010/inspector` (built into mcp-use)
  and call `show_tasks_board`. That is the full loop: an MCP tool returning a
  rendered widget.
- **Shell** — list the federated tool surface:

  ```sh
  curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
  ```

For UI work without any server or `.env`, use the widget playground
(fixture data, mocked host):

```sh
pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
```

::: tip Running processes individually
`dev:host` alone expects the widget bundle to exist — run
`pnpm --filter @miragon/mcp-toolkit-examples build:bundle` once first (the
one-shot `start` does this for you). Booting the host without the upstreams
prints a warning that plugin `articles` declares a `proxyBinding` with no
matching proxy — harmless unless you call the articles steps; start
`dev:articles-upstream` / `dev:customers-upstream` to clear it.
:::

## Start your own project

### The fast way: use the template

[`Miragon/mcp-toolkit-starter`](https://github.com/Miragon/mcp-toolkit-starter)
is a self-contained starter — one host, one module with its own tools, one
widget, and the `mcp-app.html` Vite bundle setup — with pinned versions, CI,
and the `.npmrc` prepared. Click "Use this template", or:

```sh
gh repo create my-mcp-server --template Miragon/mcp-toolkit-starter --private --clone
```

Then follow its README. The starter is an auto-synced mirror of
[`templates/minimal-server`](../templates/minimal-server/README.md) in this
repo — copying that directory works just as well.

### By hand

The packages live on GitHub Packages under the restricted `@miragon` scope.
Add an `.npmrc` next to your `package.json`:

```
@miragon:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

and export a [personal access token](https://github.com/settings/tokens) with
`read:packages` as `GITHUB_TOKEN`. Then install — the peer dependencies are
pinned exactly, so match them:

```sh
pnpm add @miragon/mcp-toolkit-core @miragon/mcp-toolkit-proxy-contract
pnpm add @modelcontextprotocol/sdk@1.29.0 mcp-use@1.34.1 zod@4.4.3
```

A minimal host:

```ts
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
import { createPlugin as createTasksPlugin } from "./modules/tasks/plugin.js"

const here = path.dirname(fileURLToPath(import.meta.url))

const app = await createFrameworkApp({
  name: "my-mcp",
  version: "0.1.0",
  baseUrl: process.env.MCP_URL,
  plugins: [createTasksPlugin()], // your AppPlugins
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
  app: {
    resourceUri: "ui://my-mcp/mcp-app.html",
    htmlPath: path.join(here, "mcp-app.html"),
  },
})

await app.listen(Number(process.env.PORT ?? 3010))
```

That boots an MCP server with the framework tool trio
(`get-framework-manifest`, `render-view`, `refresh-view`), an `mcp-app-html`
resource serving the widget bundle, and any upstream proxies declared in
`MCP_PROXIES` (tools auto-federated).

Two things the snippet leans on:

- **The plugin** — a module that registers its own tools and a widget. Build it
  along [building a full module](guides/building-a-full-module.md); the runnable
  reference is [`examples/modules/tasks`](../examples/modules/tasks/README.md).
- **The widget bundle** — `htmlPath` must point at a built single-file
  `mcp-app.html` that maps widget ids to React components. The template ships
  this Vite setup; in-repo the reference is
  [`examples/app-bundle`](../examples/app-bundle/).

Import paths are deliberate: server-side factories come from
`@miragon/mcp-toolkit-core/tools` (never the root barrel, which stays
browser-safe), widget-side hooks from `@miragon/mcp-toolkit-ui/app` and
`@miragon/mcp-toolkit-ui/hooks`. See each package README for the subpath map.

## Where to next

- [Playground tour](playground/tour.md) — the toolkit's feature surface as a
  click-through: widgets, composed views, pipelines, builder.
- [Building a full module](guides/building-a-full-module.md) — your own tools +
  widget end-to-end (the common case).
- [Architecture](concepts/architecture.md) — what the server actually does on
  each request.
- [Building a UI-only module](guides/building-a-ui-only-module.md) — wrap an
  existing upstream MCP instead.
- [Env var reference](reference/env-vars.md) — all config knobs.
