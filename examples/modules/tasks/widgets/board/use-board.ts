import { useMemo, useState } from "react"
import { useToast, useToolMutation, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { Task, TaskStatus, TasksBoardData } from "../../store.js"
import { COMPLETE_TASK, TASKS_BOARD_DATA } from "../../tool-names.js"
import { useTasksText } from "../messages.js"
import { releasable, runCompletion } from "./board-logic.js"

/**
 * The board's data: the pushed seed, or the self-fetched feed, plus a refresh
 * that reports its outcome as a toast (feedback is never silent) and resolves
 * with the fresh board, or `null` when it failed.
 */
export function useBoard(pushed: TasksBoardData | null) {
  const text = useTasksText()
  const toast = useToast()
  // Self-fetch the feed when the host pushed nothing; when it did, seed from
  // `pushed` and only hit the feed on an explicit refresh. `refetch()` runs even
  // while the query is disabled, and `query.data ?? pushed` then prefers the
  // freshly fetched board over the initial seed.
  const query = useToolQuery<TasksBoardData>(
    ["tasks", "board"],
    TASKS_BOARD_DATA,
    {},
    { enabled: pushed == null },
  )

  async function refresh(): Promise<TasksBoardData | null> {
    const result = await query.refetch()
    if (result.isError) {
      toast.show({ tone: "danger", title: text.refreshFailed, description: text.refreshFailedHint })
      return null
    }
    toast.show({ tone: "success", title: text.refreshed })
    return result.data ?? null
  }

  return { query, board: query.data ?? pushed ?? null, refresh }
}

/**
 * Optimistic completion: a completed task shows as done at once and is shown
 * open again if its `complete_task` call fails, so the row never claims a
 * write that did not happen. Every call settles on its own promise
 * ({@link runCompletion}), so overlapping completions each keep their
 * rollback and their toast.
 *
 * `placedAs` maps each task completed here to its status from before the
 * click. The board keeps such a row in place (`listTasks`) and shows it as
 * just completed until an explicit refresh hands `release` a board that has
 * the task done; a completion still running keeps its entry.
 */
export function useCompletion(board: TasksBoardData | null, onSettled: () => void) {
  const text = useTasksText()
  const toast = useToast()
  const mutation = useToolMutation<Task>(COMPLETE_TASK)
  const [placedAs, setPlacedAs] = useState<ReadonlyMap<string, TaskStatus>>(() => new Map())

  function complete(task: Task) {
    // The button is gone once clicked; this also ignores a repeat call.
    if (placedAs.has(task.id) || task.status === "done") return
    void runCompletion(task, {
      call: (taskId) => mutation.mutateAsync({ taskId }),
      mark: ({ id, status }) => setPlacedAs((map) => new Map(map).set(id, status)),
      unmark: ({ id }) =>
        setPlacedAs((map) => {
          const next = new Map(map)
          next.delete(id)
          return next
        }),
      succeeded: ({ title }) => {
        toast.show({ tone: "success", title: text.completed, description: title })
        onSettled()
      },
      failed: () =>
        toast.show({
          tone: "danger",
          title: text.completeFailed,
          description: text.completeFailedHint,
        }),
    })
  }

  const tasks = useMemo(
    () =>
      (board?.tasks ?? []).map((task) =>
        placedAs.has(task.id) && task.status !== "done"
          ? { ...task, status: "done" as const }
          : task,
      ),
    [board, placedAs],
  )
  const release = (fresh: TasksBoardData) =>
    setPlacedAs((map) => new Map([...map].filter(([id]) => !releasable(fresh, id))))
  return { tasks, placedAs, complete, release }
}
