# `tasks` — build your own MCP server with tools + a widget

The end-to-end example for the **most common real case**: _"I'm building my own
MCP server. I want it to expose some tools **and** a nice UI."_ Every example
module is self-owned; where `articles` adds a typed generated client
(tool-codegen), `tasks` stays minimal: it registers its
**own** tools with `createToolRegistrar`, backed by an in-memory store it owns.

There is no backend and no network: the domain lives in
[`store.ts`](./store.ts), so you can run, read, and copy this module as-is.

```
modules/tasks/
├── definition.ts          AppDefinition: module name + the `tasks:board` widget
├── tool-names.ts          tool-name constants shared by the server and the widget
├── store.ts               in-memory domain + pure helpers (countByStatus, filterTasks)
├── store.test.ts          Vitest for the pure logic (repo test policy)
├── plugin.ts              createPlugin(): registerTools + registerWidgetTools
└── widgets/
    └── TasksBoard.tsx      the hand-built `({ data })` widget
```

## The four moving parts

### 1. `definition.ts` — the static contract

An `AppDefinition` with the module `name` and one widget. The board is _pushed_
by the `show_tasks_board` tool (not resolved from a pipeline key), so it needs no
`requires`; `consumes: ["tasks:board"]` names the step `dataType` the host-side
`adaptDataWidget` resolves the widget's `data` from. `steps: []` — this module
owns its data in-process instead of fetching through a declarative step.

### 2. `plugin.ts` — the tools (the part the other examples don't show)

`createPlugin()` builds one in-memory `store` and returns an `AppPlugin` whose
`registerTools` / `registerWidgetTools` close over it:

- **Domain tools** via `createToolRegistrar` (from
  `@miragon/mcp-toolkit-core/tools`): `list_tasks`, `create_task`,
  `complete_task`. Each declares a Zod `inputSchema` with a `.describe()` on
  **every** field, MCP `annotations`, and an `outputSchema`. The registrar wraps
  the handler in `withToolErrors` and mirrors the return value into
  `structuredContent` (a bare array auto-wraps to `{ data: [...] }`).

  | tool            | `readOnlyHint` | `idempotentHint` | `destructiveHint` | why                                                 |
  | --------------- | -------------- | ---------------- | ----------------- | --------------------------------------------------- |
  | `list_tasks`    | `true`         | `true`           | —                 | pure read, repeatable                               |
  | `create_task`   | `false`        | `false`          | `false`           | each call adds a new task                           |
  | `complete_task` | `false`        | `true`           | `false`           | re-completing the same id is a no-op, not a removal |

  (All set `openWorldHint: false` — the data is local to this server, a closed world.)

- **One widget tool** `show_tasks_board`: returns `buildSingleWidgetView(...)`
  with a native `view` binding (+ `appsSdkMeta` for Apps SDK hosts), so the host renders the result as
  UI instead of returning it. The `resourceUri` is handed to
  `registerWidgetTools` by the framework at boot.

- **One app-only feed** `tasks_board_data`: the same `TasksBoardData` as plain
  JSON, marked `visibility: "app"` so conforming hosts hide it from the LLM while the
  widget can still call it for an in-place refresh.

### 3. `widgets/TasksBoard.tsx` — the hand-built widget

A curated `({ data }: { data: TasksBoardData | null })` component built from the
slim composed UI layer — `WidgetHeader`, `KpiGrid` (boxed, click-to-filter
cells), `FilterBar` + `useDebouncedValue`, `SectionHeading`, `StatusBadge` for
each task's state, `Badge`, `LivePill`, `ListFooter` (mounted next to the empty
filter result too, so its live region announces "No entries"). No auto-UI, no
`<div>` soup, theme tokens only (so it white-labels).

**Complete** is a deterministic write: the button calls `complete_task` through
`useToolMutation`, shows the row as done at once, rolls it back if the call
fails, and reports the outcome as a toast (`useToast`). Each call settles on its
own promise (`mutateAsync`), so two quick completions keep their own rollback.
The completed row stays where it was until the next Refresh, so nothing moves
under the pointer, and the focus moves to the row instead of falling to the
page. An active status filter is named in the KPI header and in the control
that clears it. The tool carries
`openai/widgetAccessible` so Apps SDK hosts let the widget call it. **Adding** a
task needs a title from the user, so it stays a chat hand-off: "Ask agent to
add" hands a prompt to the host via `useHostActions()`, which the agent turns
into `create_task` + `show_tasks_board`. The button says so and is styled as the
secondary action. Everything else (KPI filter, search, pagination) is
deterministic in-widget interaction with no model round-trip.

The widget also shows the states a user needs: a failed self-fetch renders an
`ErrorState` with a retry (the raw reason sits under Details), an empty board
and an empty filter result are two different `EmptyState`s with their next
step, and a refresh reports its outcome as a toast.

### 4. Registration — host + bundle

- **Host** ([`../../host/index.ts`](../../host/index.ts)): add
  `createTasksPlugin()` to `plugins`. The framework calls `registerTools` and
  `registerWidgetTools` at boot — the tools now appear in `tools/list`.
- **Bundle** ([`../../app-bundle/main.tsx`](../../app-bundle/main.tsx)): register
  the component under its widget id. Because `TasksBoard` is a single-data
  `({ data })` widget, wrap it with `adaptDataWidget`:

  ```tsx
  "tasks:board": adaptDataWidget<TasksBoardData>(TasksBoard, "tasks:board"),
  ```

## The data flow (tool result → `data` prop)

```
show_tasks_board (plugin.ts)
  → store.board()                     : TasksBoardData
  → buildSingleWidgetView({ dataType: "tasks:board", data })
  → structuredContent: ViewStructuredContent
        .context.stepData.result = { _dataType: "tasks:board", data }
  → host renders the app bundle (the tool's view binding)
  → adaptDataWidget(TasksBoard, "tasks:board")
        finds the step whose _dataType === "tasks:board"
  → TasksBoard receives that step's data as its `data` prop
```

On a manual **Refresh** (or when no data was pushed) the widget self-fetches the
`tasks_board_data` feed via `useToolQuery`; the freshly fetched board wins over
the initial seed. See [`.claude/skills/build-mcp-widget`](../../../.claude/skills/build-mcp-widget/SKILL.md)
for the full contract.

## Run it

```sh
# 1. Build the host's widget bundle (includes tasks:board)
pnpm --filter @miragon/mcp-toolkit-examples build:bundle

# 2. Boot the host (serves articles + tasks + orders)
pnpm --filter @miragon/mcp-toolkit-examples dev:host
```

Then drive it with `curl` (or the MCP Inspector):

```sh
# the module's own tools show up directly in tools/list
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# render the board as UI
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"show_tasks_board","arguments":{}}}' \
  | jq '.result.structuredContent.context.stepData.result._dataType'
```

## Iterate on the widget in isolation

Develop the UI with fixture data and a mocked host — no server needed. A
`TasksBoard` story is wired in
[`../../widget-playground/stories.ts`](../../widget-playground/stories.ts):

```sh
pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
```

Edit the JSON to re-render live; the **Model context** panel shows the
`<ModelContext>` line the board reports; the **Host activity** panel logs every
`callTool` (Refresh and Complete) and `sendFollowUpMessage` (the add hand-off). The
brand switcher proves the token-only styling re-skins cleanly.

## Verify

```sh
# pure-logic unit tests
pnpm --filter @miragon/mcp-toolkit-examples test

# the in-process host smoke test boots createTasksPlugin() and round-trips the
# tools — see ../../test/tasks.smoke.test.ts
```
