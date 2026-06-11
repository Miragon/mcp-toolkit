import type { MCPServer } from "mcp-use/server"
import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { APP_ONLY_META, buildSingleWidgetView, uiMeta } from "@miragon/mcp-toolkit-core"
import { createToolRegistrar, withToolErrors } from "@miragon/mcp-toolkit-core/tools"
import { definition } from "./definition.js"
import {
  COMPLETE_TASK,
  CREATE_TASK,
  LIST_TASKS,
  SHOW_TASKS_BOARD,
  TASKS_BOARD_DATA,
} from "./tool-names.js"
import {
  createTaskStore,
  type TaskPriority,
  type TaskStatus,
  type TaskStore,
  type TasksBoardData,
} from "./store.js"

/**
 * The `tasks` module — the missing example: an MCP server with its **own** tools
 * (no upstream proxy) plus a hand-built widget. Compare with `articles`
 * (UI-only, `proxyBinding`) and `customers` (fully upstream-hosted). This is the
 * common real case: "I'm building my own MCP server with tools + UI."
 *
 * It contributes three kinds of tool:
 *   1. Domain tools via `createToolRegistrar` — `list_tasks`, `create_task`,
 *      `complete_task`. Each declares a Zod `inputSchema` with `.describe()` on
 *      every field, MCP `annotations` (read-only / idempotent / destructive
 *      hints), and an `outputSchema`; the registrar wraps the handler in
 *      `withToolErrors` and mirrors the result into `structuredContent`.
 *   2. One widget tool `show_tasks_board` — renders the board through the same
 *      `McpAppView` shell as `render-view` by returning `buildSingleWidgetView`
 *      with `_meta.ui.resourceUri` so the host renders the result as UI.
 *   3. One app-only feed `tasks_board_data` — the same `TasksBoardData` as plain
 *      JSON (`APP_ONLY_META`), so the widget can self-refresh via `callTool`
 *      without the host trying to render the feed.
 *
 * `registerTools` and `registerWidgetTools` close over a single `store` instance
 * created in `createPlugin()`, so a `create_task` is visible to the next
 * `list_tasks` / `show_tasks_board` within the running server.
 */

const statusSchema = z
  .enum(["todo", "doing", "done"])
  .describe("Lifecycle state: 'todo' (open), 'doing' (in progress), or 'done' (completed).")

const prioritySchema = z.enum(["low", "medium", "high"]).describe("Relative urgency of the task.")

/** Mirrors {@link Task}; advertised as each tool's `outputSchema`. */
const taskSchema = z.object({
  id: z.string().describe("Stable task id."),
  title: z.string().describe("Human-readable task title."),
  status: statusSchema,
  priority: prioritySchema,
  createdAt: z.string().describe("ISO-8601 creation timestamp."),
  completedAt: z
    .string()
    .nullable()
    .describe("ISO-8601 completion timestamp, or null while the task is open."),
})

/**
 * Plain (no-UI) tool result carrying JSON. The `tasks_board_data` feed uses this
 * so the widget's in-widget `callTool` gets the data back — a widget-tool result
 * (with `_meta.ui.resourceUri`) would be *rendered* by the host instead of
 * returned. Mirrors the data into both channels so text-first and
 * structured-first decoders agree.
 */
function rawData(data: TasksBoardData) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as unknown as Record<string, unknown>,
  }
}

/** One-line, model-facing summary of the board (never the full task list). */
function boardSummary(board: TasksBoardData): string {
  const c = board.counts
  return (
    `Task board: ${c.total} task(s) — ${c.todo} to do, ${c.doing} in progress, ` +
    `${c.done} done. Use create_task to add and complete_task to finish a task.`
  )
}

// ── Domain tools (the module's own tools, no upstream) ───────────────────────
function registerTaskTools(server: MCPServer, store: TaskStore) {
  const register = createToolRegistrar<TaskStore>(server, store)

  register({
    name: LIST_TASKS,
    category: "tasks",
    description:
      "List tasks, optionally filtered by status and/or priority. Returns id, title, status, priority, and timestamps.",
    // Pure read, no side effects, repeatable, and the data is local to this
    // server (a closed world) — so openWorldHint is false.
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      status: statusSchema.optional().describe("Only tasks in this status."),
      priority: prioritySchema.optional().describe("Only tasks with this priority."),
    },
    // A bare array is auto-wrapped to `{ data: [...] }` for structuredContent.
    outputSchema: z.array(taskSchema),
    handler: (client, args) => {
      // The registrar types `args` loosely (post-Zod `Record<string, any>`), so
      // narrow it to this tool's validated shape before use.
      const { status, priority } = args as { status?: TaskStatus; priority?: TaskPriority }
      return Promise.resolve(client.list({ status, priority }))
    },
  })

  register({
    name: CREATE_TASK,
    category: "tasks",
    description: "Create a new task (it starts in the 'todo' status). Returns the created task.",
    // Writes state and a fresh call adds another task, so it is neither
    // read-only nor idempotent; it only adds, so it is not destructive.
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      title: z.string().min(1).describe("Title of the task to create (required, non-empty)."),
      priority: prioritySchema
        .optional()
        .describe("Priority of the new task. Defaults to 'medium'."),
    },
    outputSchema: taskSchema,
    handler: (client, args) => {
      const { title, priority } = args as { title: string; priority?: TaskPriority }
      return Promise.resolve(client.create({ title, priority }))
    },
  })

  register({
    name: COMPLETE_TASK,
    category: "tasks",
    description:
      "Mark a task as done by its id. Idempotent: completing an already-done task is a no-op. Returns the updated task.",
    // Mutates, but re-running with the same id yields the same state, so it is
    // idempotent; flipping a status to done is not a destructive removal.
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      taskId: z.string().describe("Id of the task to complete (as returned by list_tasks)."),
    },
    outputSchema: taskSchema,
    handler: (client, args) => {
      const { taskId } = args as { taskId: string }
      return Promise.resolve(client.complete(taskId))
    },
  })
}

// ── Widget tool + app-only data feed (need the app's resource URI) ───────────
function registerTaskWidgetTools(server: MCPServer, store: TaskStore, resourceUri: string) {
  // The eager render: compute the board now and hand it to the widget via the
  // `McpAppView` envelope. `_meta.ui.resourceUri` tells the host to render the
  // result into the app bundle instead of returning it; the `tasks:board` widget
  // resolves its `data` from the `tasks:board` `_dataType` via `adaptDataWidget`.
  server.tool(
    {
      name: SHOW_TASKS_BOARD,
      title: "Task Board",
      description:
        "Show the task board: KPI counts by status and a filterable task list. The board view; use it whenever the user wants to see their tasks.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      schema: z.object({}),
      _meta: uiMeta({ resourceUri }),
    },
    withToolErrors(() => {
      const board = store.board()
      const view = buildSingleWidgetView({
        widget: "tasks:board",
        app: "tasks",
        dataType: "tasks:board",
        data: board,
        title: "Tasks",
        summary: boardSummary(board),
      })
      // Return a fresh object literal (not the named `ViewToolResult`) so it
      // satisfies the MCP tool-callback result shape.
      return Promise.resolve({ content: view.content, structuredContent: view.structuredContent })
    }),
  )

  // App-only JSON feed (no UI) the widget self-fetches on refresh. Marked
  // `APP_ONLY_META` so conforming hosts hide it from the LLM tool surface while
  // keeping it callable from inside the widget iframe via `callTool`.
  server.tool(
    {
      name: TASKS_BOARD_DATA,
      title: "Task board data (internal)",
      description:
        "Internal JSON feed (no UI) backing the task board widget's in-place refresh. Prefer show_tasks_board.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      schema: z.object({}),
      _meta: APP_ONLY_META,
    },
    withToolErrors(() => Promise.resolve(rawData(store.board()))),
  )
}

export function createPlugin(): AppPlugin {
  // One store per plugin instance: the host and the in-process smoke test each
  // get an isolated board, while every tool/feed here shares this one.
  const store: TaskStore = createTaskStore()

  return {
    definition,
    // The framework types the `server` param as `unknown` (the core root barrel
    // stays mcp-use-free); at runtime it is always the host's `MCPServer`, so we
    // narrow it here — the single, documented cast in this module.
    registerTools: (server) => registerTaskTools(server as MCPServer, store),
    registerWidgetTools: (server, resourceUri) =>
      registerTaskWidgetTools(server as MCPServer, store, resourceUri),
  }
}

// Re-export the view-model types so consumers (and the widget) import the
// `data` shape from the module's public surface.
export type { Task, TasksBoardData } from "./store.js"
