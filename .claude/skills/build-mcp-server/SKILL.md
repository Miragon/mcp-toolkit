---
name: build-mcp-server
description: >-
  Build an MCP server with @miragon/mcp-toolkit: a host via createFrameworkApp
  plus a module that registers its OWN tools and a widget. Use when asked to
  "build/create an MCP server", "stand up an MCP server with tools and a UI",
  "add a module with its own tools" (createToolRegistrar, not a proxy), "expose a
  tool plus a widget", wire an AppPlugin into createFrameworkApp, add an app-only
  *_data feed (APP_ONLY_META), write a show_* widget tool (buildSingleWidgetView /
  uiMeta), or bundle a widget into mcp-app.html. The worked example is the `tasks`
  module.
---

# Build an MCP server with `@miragon/mcp-toolkit`

The common real case: **"I'm building my own MCP server. I want it to expose some
tools _and_ a nice UI."** This is **not** the proxy-federation path — your module
registers its **own** tools (no upstream), backed by data it owns.

**Read the worked example first — copy it, don't reinvent it:**

- **End-to-end module** — [`examples/modules/tasks/`](../../../examples/modules/tasks/README.md):
  an `AppDefinition` + `AppPlugin` that registers `list_tasks` / `create_task` /
  `complete_task` via `createToolRegistrar`, a `show_tasks_board` widget tool, an
  app-only `tasks_board_data` feed, and a hand-built `TasksBoard` widget — wired
  into the host and the app bundle. Every file is runnable as-is (no network, no DB).
- **Host** — [`examples/host/index.ts`](../../../examples/host/index.ts) boots the
  server with `createFrameworkApp`.
- **Concepts** — [`AppPlugin`](../../../docs/concepts/app-plugins.md),
  [the view builder](../../../docs/concepts/view-builder.md).
- For the **widget itself**, use the sibling skill
  [`build-mcp-widget`](../build-mcp-widget/SKILL.md); for **white-labeling** the
  client, [`white-label-client`](../white-label-client/SKILL.md).

Boundaries that apply (see `CLAUDE.md`): **ESM with `.js` import extensions**;
server code imports `mcp-use/server` and `@miragon/mcp-toolkit-core/tools`; pure
domain logic (filters, tallies) is **Vitest-tested**, tool/React glue is not.

## The shape of a server

```
host  →  createFrameworkApp({ plugins: [myPlugin()], app: { resourceUri, htmlPath } })
plugin →  AppPlugin { definition, registerTools, registerWidgetTools }
            registerTools        →  createToolRegistrar  →  list_tasks / create_task / …
            registerWidgetTools  →  show_tasks_board (buildSingleWidgetView + uiMeta)
                                 →  tasks_board_data    (APP_ONLY_META JSON feed)
bundle →  app-bundle/main.tsx maps "tasks:board" → adaptDataWidget(TasksBoard)
```

## Step 1 — The host (`createFrameworkApp`)

The host is your chassis: it loads plugins, mounts the `mcp-app.html` bundle as a
resource, and (optionally) federates upstream proxies. From
[`examples/host/index.ts`](../../../examples/host/index.ts):

```ts
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp, createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const app = await createFrameworkApp({
  name: "toolkit-example-host",
  version: "0.0.1",
  baseUrl: process.env.MCP_URL, // public URL the resource/proxies mount under
  plugins: [createTasksPlugin()], // one or more AppPlugins — add yours here
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES), // [] when self-owned only
  app: {
    // The UI resource: a single bundled HTML file the host serves and widgets render into.
    resourceUri: "ui://toolkit-example/mcp-app.html",
    htmlPath: path.join(here, "..", "app-bundle", "dist", "index.html"),
    // Opt into the visual in-iframe builder + dashboard persistence (off by
    // default — lean servers omit this). Without `builder: true` the
    // `dashboardStore` below is ignored and no builder/dashboard tools exist.
    builder: true,
    dashboardStore: createFileSystemDashboardStore({ dir: path.join(here, ".dashboards") }),
  },
})
await app.listen(Number(process.env.PORT ?? 3010))
```

`resourceUri` may be omitted — the framework derives `ui://<name>/mcp-app.<hash>.html`
by content-hashing `htmlPath`. `proxies: []` is fine when nothing is federated.
The visual builder + dashboard CRUD (`get-builder-catalogue`, `save/list/load/
delete-dashboard`) are **opt-in** via `app: { builder: true }`; widget rendering
(`render-view`) always works without it.

## Step 2 — The module contract (`AppDefinition`)

The static contract: the module name and the widgets it ships. From
[`examples/modules/tasks/definition.ts`](../../../examples/modules/tasks/definition.ts):

```ts
import type { AppDefinition } from "@miragon/mcp-toolkit-core"

export const definition: AppDefinition = {
  name: "tasks",
  steps: [], // self-owned: this module owns its data in-process, no pipeline step
  widgets: [
    {
      id: "tasks:board",
      description:
        "A task board: KPI counts by status, filterable task list, agentic add/complete.",
      requires: [], // pushed by show_tasks_board, not resolved from a pipeline key
      consumes: ["tasks:board"], // the step dataType adaptDataWidget resolves `data` from
      size: "full",
    },
  ],
}
```

## Step 3 — Register the module's own tools (`createToolRegistrar`)

`createToolRegistrar(server, client)` returns a `register({...})` you call once
per tool. It builds the Zod schema, advertises the `outputSchema` and
`annotations`, **wraps your handler in `withToolErrors` for you**, and mirrors the
return value into `structuredContent` (a bare array auto-wraps to `{ data: [...] }`).
From [`examples/modules/tasks/plugin.ts`](../../../examples/modules/tasks/plugin.ts):

```ts
import type { MCPServer } from "mcp-use/server"
import { z } from "zod"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

function registerTaskTools(server: MCPServer, store: TaskStore) {
  const register = createToolRegistrar<TaskStore>(server, store)

  register({
    name: "list_tasks",
    description:
      "List tasks, optionally filtered by status and/or priority. Returns id, title, status, priority, timestamps.",
    // Pure read, repeatable, data is local (closed world):
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      // .describe() EVERY field — it is the model's only doc for the argument.
      status: statusSchema.optional().describe("Only tasks in this status."),
      priority: prioritySchema.optional().describe("Only tasks with this priority."),
    },
    outputSchema: z.array(taskSchema), // bare array → auto-wrapped to { data: [...] }
    handler: (client, args) => {
      // The registrar types args loosely (post-Zod) — narrow to this tool's shape.
      const { status, priority } = args as { status?: TaskStatus; priority?: TaskPriority }
      return Promise.resolve(client.list({ status, priority }))
    },
  })
  // create_task (write, not idempotent) and complete_task (write, idempotent)
  // follow the same shape — see plugin.ts. The annotations encode the contract:
  //   read-only & repeatable → readOnlyHint + idempotentHint
  //   each call mutates       → readOnlyHint:false, idempotentHint:false
  //   re-run is a no-op        → readOnlyHint:false, idempotentHint:true
  //   nothing is removed       → destructiveHint:false
}
```

For the per-tool details (one entry, the annotations convention, pagination
envelopes), use the sibling skill [`add-mcp-tool`](../add-mcp-tool/SKILL.md).

## Step 4 — A widget tool + an app-only data feed

Two more tools live in `registerWidgetTools`, which the framework hands the app's
`resourceUri` at boot.

**(a) The widget tool** computes the data now and renders it through the same
`McpAppView` shell as `render-view`. `buildSingleWidgetView` wraps the data in the
`ViewStructuredContent` envelope; `uiMeta({ resourceUri })` tells the host to
render the result as UI instead of returning it:

```ts
import { buildSingleWidgetView, uiMeta } from "@miragon/mcp-toolkit-core"
import { withToolErrors } from "@miragon/mcp-toolkit-core/tools"

server.tool(
  {
    name: "show_tasks_board",
    title: "Task Board",
    description: "Show the task board; use it whenever the user wants to see their tasks.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    schema: z.object({}),
    _meta: uiMeta({ resourceUri }), // render this result as UI
  },
  withToolErrors(() => {
    const board = store.board()
    const view = buildSingleWidgetView({
      widget: "tasks:board",
      app: "tasks",
      dataType: "tasks:board", // adaptDataWidget matches the widget on this
      data: board,
      title: "Tasks",
      summary: boardSummary(board), // short, model-facing text (never the full list)
    })
    return Promise.resolve({ content: view.content, structuredContent: view.structuredContent })
  }),
)
```

> Thinner alternative: `createWidgetToolRegistrar(server, client, resourceUri)`
> builds the `uiMeta` for you and takes a handler returning `{ text, structuredContent }` —
> reach for it when you assemble the `structuredContent` yourself instead of via
> `buildSingleWidgetView`.

**(b) The app-only feed** returns the same data as plain JSON so the widget can
self-refresh via `callTool`. `APP_ONLY_META` hides it from the LLM tool surface
while keeping it callable from inside the widget iframe:

```ts
import { APP_ONLY_META } from "@miragon/mcp-toolkit-core"

server.tool(
  {
    name: "tasks_board_data",
    title: "Task board data (internal)",
    description: "Internal JSON feed (no UI) backing the board's refresh. Prefer show_tasks_board.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    schema: z.object({}),
    _meta: APP_ONLY_META, // hidden from the LLM, still callable from the widget
  },
  // rawData mirrors the payload into BOTH content[].text and structuredContent so
  // text-first and structured-first decoders agree — a widget tool's UI result
  // would be RENDERED by the host instead of returned, so feeds stay plain.
  withToolErrors(() => Promise.resolve(rawData(store.board()))),
)
```

## Step 5 — Assemble the `AppPlugin`

`createPlugin()` builds one `store` and closes the three registrars over it, so a
`create_task` is visible to the next `list_tasks` / `show_tasks_board`:

```ts
import type { AppPlugin } from "@miragon/mcp-toolkit-core"

export function createPlugin(): AppPlugin {
  const store: TaskStore = createTaskStore() // one isolated store per plugin instance
  return {
    definition,
    // The framework types `server` as `unknown` (the core root barrel stays
    // mcp-use-free); at runtime it is the host's MCPServer, so narrow it here —
    // the single documented cast in the module.
    registerTools: (server) => registerTaskTools(server as MCPServer, store),
    registerWidgetTools: (server, resourceUri) =>
      registerTaskWidgetTools(server as MCPServer, store, resourceUri),
  }
}
```

> A **UI-only** module (federating an upstream's tools) omits `registerTools` and
> sets `proxyBinding` instead — see `examples/modules/articles`. This skill is the
> self-owned case.

## Step 6 — Bundle the widget

The widget renders inside the app bundle the host serves. Register the component
under its widget id in [`examples/app-bundle/main.tsx`](../../../examples/app-bundle/main.tsx).
Because `TasksBoard` is a single-data `({ data })` widget, wrap it with
`adaptDataWidget` on the same `dataType`:

```tsx
import { McpToolkitApp, adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"
import { TasksBoard } from "../modules/tasks/widgets/TasksBoard.js"
import type { TasksBoardData } from "../modules/tasks/store.js"

const widgets = {
  "tasks:board": adaptDataWidget<TasksBoardData>(TasksBoard, "tasks:board"),
}
createRoot(document.getElementById("root")!).render(<McpToolkitApp widgets={widgets} />)
```

## Step 7 — Run & verify

```sh
# 1. First time only: the host reads its config from examples/.env
cp examples/env.example examples/.env
# 2. Build the widget bundle (htmlPath above points at app-bundle/dist/index.html)
pnpm --filter @miragon/mcp-toolkit-examples build:bundle
# 3. Boot the host
pnpm --filter @miragon/mcp-toolkit-examples dev:host
```

Booting without the demo upstreams prints a `proxyBinding "articles"` warning —
harmless for a self-owned module; only the articles steps need that upstream.

Drive it with the built-in inspector at `http://localhost:3010/inspector`, or
with `curl`:

```sh
# the module's own tools appear directly in tools/list
curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# render the board as UI (structuredContent carries the ViewStructuredContent envelope)
curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"show_tasks_board","arguments":{}}}' \
  | jq '.result.structuredContent.context.stepData.result._dataType'
```

An **in-process smoke test** boots the plugin over a loopback socket and
round-trips the tools — copy it for your module:
[`examples/test/tasks.smoke.test.ts`](../../../examples/test/tasks.smoke.test.ts).

Before committing, the repo gates must be green:

```sh
pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r lint
```

## Checklist

- [ ] `AppDefinition` declares the module name + widget(s) (`requires` / `consumes` / `size`).
- [ ] Domain logic lives in a pure, Vitest-tested store/repo — not in the handlers.
- [ ] Each tool via `createToolRegistrar`: `.describe()` on every field, MCP `annotations`, `outputSchema`.
- [ ] A `show_*` widget tool returns `buildSingleWidgetView` + `uiMeta({ resourceUri })`.
- [ ] An app-only `*_data` feed (`APP_ONLY_META`) backs the widget's self-refresh.
- [ ] `createPlugin()` closes the registrars over one store; `server as MCPServer` is the only cast.
- [ ] The widget is registered in the bundle (`adaptDataWidget` for `({ data })` widgets).
- [ ] `tools/list` shows the tools; `show_*` renders; repo gates green.
