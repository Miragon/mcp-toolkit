/**
 * In-memory task store — the domain layer of a self-owned MCP server. Swap this
 * closure for a repository over your own persistence; the tool handlers in
 * `plugin.ts` do not change.
 */

export type TaskStatus = "todo" | "doing" | "done"

export type TaskPriority = "low" | "medium" | "high"

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  /** ISO-8601 creation timestamp. */
  createdAt: string
}

/** Per-status tallies shown in the widget's KPI strip. */
export interface TaskCounts {
  total: number
  todo: number
  doing: number
  done: number
}

/**
 * The view-model the widget renders. It is the *exact* shape that travels
 * tool result → `structuredContent` → `adaptDataWidget` → the widget's `data`
 * prop, so the widget never reshapes a server payload by hand.
 */
export interface TasksBoardData {
  tasks: Task[]
  counts: TaskCounts
  /** ISO-8601 timestamp of when the snapshot was taken. */
  generatedAt: string
}

export interface ListTasksFilter {
  status?: TaskStatus
  priority?: TaskPriority
}

export interface CreateTaskInput {
  title: string
  priority?: TaskPriority
}

export interface TaskStore {
  list(filter?: ListTasksFilter): Task[]
  create(input: CreateTaskInput): Task
  /** Snapshots the whole board (tasks + counts + timestamp) for the widget. */
  board(): TasksBoardData
}

export function countByStatus(tasks: Task[]): TaskCounts {
  const counts: TaskCounts = { total: tasks.length, todo: 0, doing: 0, done: 0 }
  for (const task of tasks) counts[task.status] += 1
  return counts
}

export function filterTasks(tasks: Task[], filter: ListTasksFilter = {}): Task[] {
  return tasks.filter(
    (task) =>
      (filter.status === undefined || task.status === filter.status) &&
      (filter.priority === undefined || task.priority === filter.priority),
  )
}

/** A small demo seed so `list_tasks` / `show_tasks_board` show content out of the box. */
function defaultSeed(): Task[] {
  return [
    {
      id: "t-1",
      title: "Draft the onboarding guide",
      status: "todo",
      priority: "high",
      createdAt: "2026-06-01T09:00:00.000Z",
    },
    {
      id: "t-2",
      title: "Review pull request #42",
      status: "doing",
      priority: "medium",
      createdAt: "2026-06-02T11:30:00.000Z",
    },
    {
      id: "t-3",
      title: "Ship the release notes",
      status: "done",
      priority: "medium",
      createdAt: "2026-05-28T08:45:00.000Z",
    },
  ]
}

/**
 * Builds a fresh store. `createPlugin()` calls this once, so every tool and
 * feed of one plugin instance shares the same data: a `create_task` is visible
 * to the next `list_tasks` / `show_tasks_board` within the running server.
 */
export function createTaskStore(): TaskStore {
  const now = () => new Date().toISOString()
  const tasks: Task[] = defaultSeed()

  // New ids start at 1001 so they never collide with the seed ids.
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
      }
      tasks.push(task)
      return task
    },

    board() {
      const all = filterTasks(tasks, {})
      return { tasks: all, counts: countByStatus(all), generatedAt: now() }
    },
  }
}
