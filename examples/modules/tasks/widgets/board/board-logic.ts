import type { Task, TaskPriority, TaskStatus } from "../../store.js"

/** The list order: open work first, then by priority. */
const STATUS_ORDER: readonly TaskStatus[] = ["todo", "doing", "done"]
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

/** What the user narrowed the list to. `null` means "any". */
export interface TaskListFilter {
  /** Lower-cased search text; `""` matches every title. */
  needle: string
  status: TaskStatus | null
  priority: TaskPriority | null
}

/**
 * The rows the board lists: filtered, then sorted by status and priority.
 *
 * `placedAs` holds the tasks completed in this widget, each with its status
 * from before the click. Such a row keeps that place, and it still matches a
 * filter on that status, until the board drops the entry (on an explicit
 * refresh). Sorting by the new status instead would move the row away under
 * the pointer at once: the second click of a double-click would complete the
 * row that moved up, and in a "To do" filter the row would vanish.
 */
export function listTasks(
  tasks: readonly Task[],
  placedAs: ReadonlyMap<string, TaskStatus>,
  filter: TaskListFilter,
): Task[] {
  const placeOf = (task: Task) => placedAs.get(task.id) ?? task.status
  return tasks
    .filter(
      (task) =>
        (filter.needle === "" || task.title.toLowerCase().includes(filter.needle)) &&
        (filter.status === null ||
          task.status === filter.status ||
          placeOf(task) === filter.status) &&
        (filter.priority === null || task.priority === filter.priority),
    )
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(placeOf(a)) - STATUS_ORDER.indexOf(placeOf(b)) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    )
}

/**
 * Whether a task completed here may leave its held place: the fresh board
 * has it done. A completion still running (or a task the board no longer
 * lists as done) keeps its place and its done state.
 */
export function releasable(fresh: { tasks: readonly Task[] }, taskId: string): boolean {
  return fresh.tasks.some((task) => task.id === taskId && task.status === "done")
}

/**
 * One completion with its own outcome. `call` is the tool call
 * (`mutation.mutateAsync`): its promise settles for every call, while
 * TanStack's per-call `mutate(vars, { onError })` callbacks fire only for the
 * latest call, so a second Complete started before the first one settled
 * would swallow the first one's rollback and toast.
 */
export async function runCompletion(
  task: Task,
  steps: {
    call: (taskId: string) => Promise<unknown>
    /** Show the task as done at once. */
    mark: (task: Task) => void
    /** Show it open again: the call failed, so nothing was written. */
    unmark: (task: Task) => void
    succeeded: (task: Task) => void
    failed: (task: Task) => void
  },
): Promise<void> {
  steps.mark(task)
  try {
    await steps.call(task.id)
  } catch {
    steps.unmark(task)
    steps.failed(task)
    return
  }
  steps.succeeded(task)
}
