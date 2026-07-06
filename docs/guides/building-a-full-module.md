# Building a full module

A "full module" owns its data — it registers its **own** MCP tools (no
upstream proxy) plus a widget, all in one `AppPlugin`. This is the common
real case: _"I'm building my own MCP server. I want it to expose some tools
and a nice UI."_ The worked example is
[`examples/modules/tasks/`](../../examples/modules/tasks/README.md) —
runnable as-is (in-memory store, no network); this guide walks along its
real files.

For the opposite cases see:

- [Building a UI-only module](building-a-ui-only-module.md) — wrap an
  existing upstream MCP by binding a plugin to a proxy.
- [Registering upstream proxies](registering-upstream-proxies.md) —
  federate an external MCP under the host's namespace.

## Layout

```
modules/tasks/
├── definition.ts       AppDefinition: module name + widgets
├── tool-names.ts       tool-name constants shared by server and widget
├── store.ts            pure domain logic (Vitest-tested)
├── plugin.ts           createPlugin(): registerTools + registerWidgetTools
└── widgets/
    └── TasksBoard.tsx  the hand-built ({ data }) widget
```

## `definition.ts` — the static contract

From [`examples/modules/tasks/definition.ts`](../../examples/modules/tasks/definition.ts):

```ts
import type { AppDefinition } from "@miragon/mcp-toolkit-core"

export const definition: AppDefinition = {
  name: "tasks",
  steps: [], // this module owns its data in-process — no pipeline step
  widgets: [
    {
      id: "tasks:board",
      description: "A task board: KPI counts by status, filterable task list.",
      requires: [], // pushed by show_tasks_board, not resolved from a pipeline key
      consumes: ["tasks:board"], // the step dataType the widget's `data` binds to
      size: "full",
    },
  ],
}
```

`requires` is builder reachability only: the keys that must be in context
before the widget renders. `consumes` is the actual data binding: the step
`_dataType` that `adaptDataWidget` resolves the widget's `data` prop from.
See [Widgets](../concepts/widgets.md) for the full distinction.

## Domain tools — `createToolRegistrar`

`createToolRegistrar(server, client)` (from
`@miragon/mcp-toolkit-core/tools`) returns a `register({...})` you call once
per tool. It builds the Zod schema, advertises `outputSchema` and
`annotations`, wraps the handler in `withToolErrors` for you, and mirrors
the return value into `structuredContent` — a bare array auto-wraps to
`{ data: [...] }`. One registration, trimmed from
[`examples/modules/tasks/plugin.ts`](../../examples/modules/tasks/plugin.ts):

```ts
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

const register = createToolRegistrar<TaskStore>(server, store)

register({
  name: "list_tasks",
  description: "List tasks, optionally filtered by status and/or priority.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    status: statusSchema.optional().describe("Only tasks in this status."),
    priority: prioritySchema.optional().describe("Only tasks with this priority."),
  },
  outputSchema: z.array(taskSchema), // bare array → { data: [...] }
  handler: (client, args) => Promise.resolve(client.list(args)),
})
```

The annotations encode the side-effect contract — pick honestly per tool:

| tool            | `readOnlyHint` | `idempotentHint` | `destructiveHint` | why                                                 |
| --------------- | -------------- | ---------------- | ----------------- | --------------------------------------------------- |
| `list_tasks`    | `true`         | `true`           | —                 | pure read, repeatable                               |
| `create_task`   | `false`        | `false`          | `false`           | each call adds a new task                           |
| `complete_task` | `false`        | `true`           | `false`           | re-completing the same id is a no-op, not a removal |

All three set `openWorldHint: false` — the data is local to this server, a
closed world.

Two rules:

- **`.describe()` every input field.** The input schema is the model-facing
  documentation; a field without a description is a tool the model will
  misuse.
- **`outputSchema` is the structured contract.** Widgets and
  `parseToolResult` decode it, not your text. For list tools that paginate,
  return an explicit envelope (`items` / `total` / `page` / `pageSize`)
  instead of a bare array — see the
  [`add-mcp-tool` skill](../../.claude/skills/add-mcp-tool/SKILL.md).

## The widget tool — `buildSingleWidgetView` + `uiMeta`

One `show_*` tool per view lives in `registerWidgetTools`, which the
framework hands the app's `resourceUri` at boot. It computes the data now
and returns the `ViewStructuredContent` envelope; `uiMeta({ resourceUri })`
tells the host to render the result as UI instead of returning it:

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
    _meta: uiMeta({ resourceUri }),
  },
  withToolErrors(() => {
    const board = store.board()
    const view = buildSingleWidgetView({
      widget: "tasks:board",
      app: "tasks",
      dataType: "tasks:board", // adaptDataWidget matches the widget on this
      data: board,
      title: "Tasks",
      summary: boardSummary(board), // short, model-facing text — never the full list
    })
    return Promise.resolve({ content: view.content, structuredContent: view.structuredContent })
  }),
)
```

## The app-only data feed — `APP_ONLY_META`

Optionally, a `*_data` twin returns the same data as plain JSON so the
widget can self-refresh via `callTool`. `APP_ONLY_META` hides it from the
LLM tool surface while keeping it callable from inside the widget iframe:

```ts
import { APP_ONLY_META } from "@miragon/mcp-toolkit-core"

server.tool(
  {
    name: "tasks_board_data",
    description: "Internal JSON feed (no UI) backing the board's refresh. Prefer show_tasks_board.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    schema: z.object({}),
    _meta: APP_ONLY_META,
  },
  // Mirror the payload into both content[].text and structuredContent —
  // a uiMeta result would be rendered by the host instead of returned.
  withToolErrors(() => Promise.resolve(rawData(store.board()))),
)
```

## The widget — a typed `data` prop

The widget is a plain React component taking the typed data:

```tsx
// widgets/TasksBoard.tsx
export function TasksBoard({ data }: { data: TasksBoardData | null }) {
  // render from data; self-fetch tasks_board_data via useToolQuery on refresh
}
```

It never sees the `ViewStructuredContent` envelope — `adaptDataWidget`
resolves the step whose `_dataType` is `"tasks:board"` and forwards its
`data`. For building the component itself (catalog, host-portable bridge,
playground loop) use the
[`build-mcp-widget` skill](../../.claude/skills/build-mcp-widget/SKILL.md).

## Register — plugin and bundle (both!)

The widget id is registered **twice**:

1. In the plugin's `definition.widgets` (above), and
2. in the host's app-bundle widget-id map,
   [`examples/app-bundle/main.tsx`](../../examples/app-bundle/main.tsx):

```tsx
import { McpToolkitApp, adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"

const widgets = {
  "tasks:board": adaptDataWidget<TasksBoardData>(TasksBoard, "tasks:board"),
}
createRoot(root).render(<McpToolkitApp widgets={widgets} />)
```

After changing the map or the widget, rebuild the bundle:

```sh
pnpm --filter @miragon/mcp-toolkit-examples build:bundle
```

`createPlugin()` assembles the `AppPlugin` — one store, both registrars
closed over it:

```ts
export function createPlugin(): AppPlugin {
  const store = createTaskStore()
  return {
    definition,
    registerTools: (server) => registerTaskTools(server as MCPServer, store),
    registerWidgetTools: (server, resourceUri) =>
      registerTaskWidgetTools(server as MCPServer, store, resourceUri),
  }
}
```

## Register in the host

```ts
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"

await createFrameworkApp({
  // ...
  plugins: [createTasksPlugin()],
})
```

The framework calls `registerTools` and `registerWidgetTools` at boot — the
tools appear in `tools/list`.

## Verify end-to-end

Boot the host (`pnpm --filter @miragon/mcp-toolkit-examples dev:host`) and
drive it with `curl`, or use the inspector at
`http://localhost:3010/inspector`:

```sh
# the module's own tools appear directly in tools/list
curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# render the board as UI
curl -sX POST http://localhost:3010/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"show_tasks_board","arguments":{}}}' \
  | jq '.result.structuredContent.context.stepData.result._dataType'
```

Success signal: the second call prints `"tasks:board"` — the `_dataType` in
`structuredContent` that binds the pushed data to the widget.

## See also

- [Widgets](../concepts/widgets.md) — `requires` vs `consumes`, bundling.
- [App plugins](../concepts/app-plugins.md) — the `AppPlugin` contract.
- Skills: [`build-mcp-server`](../../.claude/skills/build-mcp-server/SKILL.md) ·
  [`add-mcp-tool`](../../.claude/skills/add-mcp-tool/SKILL.md) ·
  [`build-mcp-widget`](../../.claude/skills/build-mcp-widget/SKILL.md)
- Runnable code: [`examples/modules/tasks/`](../../examples/modules/tasks/README.md)
  (this guide's module) and
  [`examples/modules/orders/`](../../examples/modules/orders/README.md)
  (the multi-widget composed-view variant).
