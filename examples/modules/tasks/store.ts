/**
 * In-memory task store for the `tasks` example module.
 *
 * This is the domain layer of a self-owned MCP server: `tasks` registers its
 * own tools backed by this store (the `articles` module does the same, with a
 * codegen'd typed client on top). Keeping the data
 * here — with no network, database, or `node:*` import — makes the example
 * runnable as-is and keeps the pure logic (`countByStatus`, `filterTasks`)
 * unit-testable with Vitest (see `store.test.ts`).
 *
 * In a real server you would swap this closure for a repository over your own
 * persistence; the tool handlers in `plugin.ts` would not change.
 */

/** Lifecycle state of a task. Drives the KPI counts and the status tone. */
export type TaskStatus = "todo" | "doing" | "done"

/** Relative urgency, surfaced as a coloured badge in the board widget. */
export type TaskPriority = "low" | "medium" | "high"

export interface Task {
  /** Stable id (`t-…`). Seeded tasks use `t-1…`, created ones `t-1001…`. */
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  /** ISO-8601 creation timestamp. */
  createdAt: string
  /** ISO-8601 completion timestamp, or `null` while the task is open. */
  completedAt: string | null
}

/** Per-status tallies shown in the board's KPI strip. */
export interface TaskCounts {
  total: number
  todo: number
  doing: number
  done: number
}

/**
 * The view-model the board widget renders. It is the *exact* shape that travels
 * tool result → `structuredContent` → `adaptDataWidget` → the widget's `data`
 * prop, so the widget never reshapes a server payload by hand. Both
 * `show_tasks_board` (eager render) and the `tasks_board_data` feed (in-widget
 * refresh) return this object.
 */
export interface TasksBoardData {
  tasks: Task[]
  counts: TaskCounts
  /** ISO-8601 timestamp of when the snapshot was taken (shown in the header). */
  generatedAt: string
}

/** Optional filter accepted by `list_tasks`. */
export interface ListTasksFilter {
  status?: TaskStatus
  priority?: TaskPriority
}

/** Payload accepted by `create_task`. */
export interface CreateTaskInput {
  title: string
  priority?: TaskPriority
}

export interface TaskStore {
  /** Returns the tasks matching `filter` (no filter → all tasks). */
  list(filter?: ListTasksFilter): Task[]
  /** Appends a new `todo` task and returns it. */
  create(input: CreateTaskInput): Task
  /** Marks a task `done` (idempotent); throws on an unknown id. */
  complete(id: string): Task
  /** Snapshots the whole board (tasks + counts + timestamp) for the widget. */
  board(): TasksBoardData
}

export interface CreateTaskStoreOptions {
  /**
   * Clock injection. Defaults to `Date.now`-based ISO strings; tests pass a
   * fixed clock so `createdAt` / `completedAt` / `generatedAt` are deterministic.
   */
  now?: () => string
  /** Replace the default demo seed (e.g. start empty in a test). */
  seed?: Task[]
}

/** Tallies tasks by status. Pure — unit-tested in `store.test.ts`. */
export function countByStatus(tasks: Task[]): TaskCounts {
  const counts: TaskCounts = { total: tasks.length, todo: 0, doing: 0, done: 0 }
  for (const task of tasks) counts[task.status] += 1
  return counts
}

/** Applies the optional `status` / `priority` filter. Pure — unit-tested. */
export function filterTasks(tasks: Task[], filter: ListTasksFilter = {}): Task[] {
  return tasks.filter(
    (task) =>
      (filter.status === undefined || task.status === filter.status) &&
      (filter.priority === undefined || task.priority === filter.priority),
  )
}

/** A small, readable demo board so `list_tasks` / `show_tasks_board` show content out of the box. */
function defaultSeed(): Task[] {
  return [
    {
      id: "t-1",
      title: "Draft the onboarding guide",
      status: "todo",
      priority: "high",
      createdAt: "2026-06-01T09:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t-2",
      title: "Review pull request #42",
      status: "doing",
      priority: "medium",
      createdAt: "2026-06-02T11:30:00.000Z",
      completedAt: null,
    },
    {
      id: "t-3",
      title: "Reply to the design feedback",
      status: "todo",
      priority: "low",
      createdAt: "2026-06-03T14:15:00.000Z",
      completedAt: null,
    },
    {
      id: "t-4",
      title: "Ship the release notes",
      status: "done",
      priority: "medium",
      createdAt: "2026-05-28T08:45:00.000Z",
      completedAt: "2026-05-29T16:20:00.000Z",
    },
  ]
}

/**
 * Builds a fresh task store. `createPlugin()` calls this once so every plugin
 * instance owns an isolated store — the tool handlers and the widget feeds all
 * close over the *same* instance, which is what makes a `create_task` visible to
 * the next `list_tasks` / `show_tasks_board` within one server process.
 */
export function createTaskStore(options: CreateTaskStoreOptions = {}): TaskStore {
  const now = options.now ?? (() => new Date().toISOString())
  // Copy the seed so two stores (host + smoke test) never alias the same array.
  const tasks: Task[] = (options.seed ?? defaultSeed()).map((task) => ({ ...task }))

  // New ids start at 1001 so they never collide with the `t-1…` seed ids.
  let seq = 1000
  const nextId = () => `t-${(seq += 1)}`

  return {
    list(filter = {}) {
      return filterTasks(tasks, filter)
    },

    create(input) {
      const title = input.title.trim()
      if (title.length === 0) throw new Error("A task must have a non-empty title.")
      const task: Task = {
        id: nextId(),
        title,
        status: "todo",
        priority: input.priority ?? "medium",
        createdAt: now(),
        completedAt: null,
      }
      tasks.push(task)
      return task
    },

    complete(id) {
      const task = tasks.find((t) => t.id === id)
      if (!task) throw new Error(`Unknown task id: "${id}".`)
      // Idempotent: completing an already-done task is a no-op (keeps the
      // original completedAt), which is why `complete_task` is `idempotentHint`.
      if (task.status !== "done") {
        task.status = "done"
        task.completedAt = now()
      }
      return task
    },

    board() {
      const all = filterTasks(tasks, {})
      return { tasks: all, counts: countByStatus(all), generatedAt: now() }
    },
  }
}
