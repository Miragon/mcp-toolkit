import type { MCPServer } from "mcp-use"
import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { appsSdkMeta, buildSingleWidgetView, viewResourceUri } from "@miragon/mcp-toolkit-core"
import { createToolRegistrar, withToolErrors } from "@miragon/mcp-toolkit-core/tools"
import { definition } from "./definition.js"
import { CREATE_TASK, LIST_TASKS, SHOW_TASKS_BOARD, TASKS_BOARD_DATA } from "./tool-names.js"
import { createTaskStore, type TaskStore, type TasksBoardData } from "./store.js"

/**
 * The `tasks` module: an MCP server module with its **own** tools plus a
 * hand-built widget. It contributes three kinds of tool:
 *   1. Domain tools via `createToolRegistrar` — `list_tasks`, `create_task`.
 *      Each declares a Zod `inputSchema` with `.describe()` on every field,
 *      MCP `annotations`, and an `outputSchema`.
 *   2. One widget tool `show_tasks_board` — bound to its own view (named
 *      after the tool), so the host renders the result as UI.
 *   3. One app-only feed `tasks_board_data` — the same data as plain JSON
 *      (native `visibility: "app"`), callable from inside the widget without
 *      the host trying to render it.
 */

const statusSchema = z
  .enum(["todo", "doing", "done"])
  .describe("Lifecycle state: 'todo' (open), 'doing' (in progress), or 'done' (completed).")

const prioritySchema = z.enum(["low", "medium", "high"]).describe("Relative urgency of the task.")

/** Mirrors the `Task` type; advertised as each tool's `outputSchema`. */
const taskSchema = z.object({
  id: z.string().describe("Stable task id."),
  title: z.string().describe("Human-readable task title."),
  status: statusSchema,
  priority: prioritySchema,
  createdAt: z.string().describe("ISO-8601 creation timestamp."),
})

/**
 * Plain (no-UI) tool result carrying JSON. The `tasks_board_data` feed uses
 * this so an in-widget `callTool` gets the data back — a view-bound widget
 * tool's result would be *rendered* by the host instead.
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
    `${c.done} done. Use create_task to add a task.`
  )
}

// ── Domain tools ─────────────────────────────────────────────────────────────
function registerTaskTools(server: MCPServer, store: TaskStore) {
  const register = createToolRegistrar<TaskStore>(server, store)

  register({
    name: LIST_TASKS,
    category: "tasks",
    description:
      "List tasks, optionally filtered by status and/or priority. Returns id, title, status, priority, and the creation timestamp.",
    // Pure read of local data (a closed world) — repeatable, no side effects.
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      status: statusSchema.optional().describe("Only tasks in this status."),
      priority: prioritySchema.optional().describe("Only tasks with this priority."),
    },
    // A bare array is auto-wrapped to `{ data: [...] }` for structuredContent.
    outputSchema: z.array(taskSchema),
    handler: (client, args) => {
      const { status, priority } = args
      return Promise.resolve(client.list({ status, priority }))
    },
  })

  register({
    name: CREATE_TASK,
    category: "tasks",
    description: "Create a new task (it starts in the 'todo' status). Returns the created task.",
    // Writes state and every call adds another task — neither read-only nor
    // idempotent; it only adds, so not destructive.
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
      const { title, priority } = args
      return Promise.resolve(client.create({ title, priority }))
    },
  })
}

// ── Widget tool + app-only data feed ─────────────────────────────────────────
function registerTaskWidgetTools(server: MCPServer, store: TaskStore) {
  // Eager render: compute the board now and hand it to the widget through the
  // view envelope. The `view` binding (named after the tool) tells the host to
  // render the result into `views/show_tasks_board/`; `adaptDataWidget` there
  // resolves the widget's `data` prop from the `tasks:board` `_dataType`. The
  // `openai/*` keys cover Apps SDK hosts, which don't read the view binding.
  server.tool(
    {
      name: SHOW_TASKS_BOARD,
      title: "Task Board",
      description:
        "Show the task board: KPI counts by status and the task list. Use it whenever the user wants to see their tasks.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}),
      view: { name: SHOW_TASKS_BOARD },
      outputSchema: z.object({}).passthrough(),
      _meta: appsSdkMeta({ resourceUri: viewResourceUri(SHOW_TASKS_BOARD), title: "Task Board" }),
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
      return Promise.resolve({ content: view.content, structuredContent: view.structuredContent })
    }),
  )

  // App-only JSON feed (no UI). The native `visibility: "app"` hides it from
  // the LLM tool surface while keeping it callable from inside the widget.
  server.tool(
    {
      name: TASKS_BOARD_DATA,
      title: "Task board data (internal)",
      description:
        "Internal JSON feed (no UI) backing the task board widget. Prefer show_tasks_board.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}),
      visibility: "app",
    },
    withToolErrors(() => Promise.resolve(rawData(store.board()))),
  )
}

export function createPlugin(): AppPlugin {
  // One store per plugin instance; every tool/feed here shares it.
  const store: TaskStore = createTaskStore()

  return {
    definition,
    // The framework types `server` as `unknown` (the core root barrel stays
    // mcp-use-free); at runtime it is always the host's `MCPServer`.
    registerTools: (server) => registerTaskTools(server as MCPServer, store),
    registerWidgetTools: (server) => registerTaskWidgetTools(server as MCPServer, store),
  }
}

// Re-export the view-model types so the widget imports the `data` shape from
// the module's public surface.
export type { Task, TasksBoardData } from "./store.js"
