import { useMemo, useState } from "react"
import { useToast, useToolMutation, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { Task, TasksBoardData } from "../../store.js"
import { COMPLETE_TASK, TASKS_BOARD_DATA } from "../../tool-names.js"
import { useTasksText } from "../messages.js"

/**
 * The board's data: the pushed seed, or the self-fetched feed, plus a refresh
 * that reports its outcome as a toast (feedback is never silent).
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

  async function refresh() {
    const result = await query.refetch()
    if (result.isError) {
      toast.show({ tone: "danger", title: text.refreshFailed, description: text.refreshFailedHint })
    } else {
      toast.show({ tone: "success", title: text.refreshed })
    }
  }

  return { query, board: query.data ?? pushed ?? null, refresh }
}

/**
 * Optimistic completion: a completed id shows as done at once and is dropped
 * again if `complete_task` fails, so the row never claims a write that did not
 * happen. Returns the board's tasks with the completions applied.
 */
export function useCompletion(board: TasksBoardData | null, onSettled: () => void) {
  const text = useTasksText()
  const toast = useToast()
  const mutation = useToolMutation<Task>(COMPLETE_TASK)
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set())

  function complete(task: Task) {
    setCompleted((ids) => new Set(ids).add(task.id))
    mutation.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          toast.show({ tone: "success", title: text.completed, description: task.title })
          onSettled()
        },
        onError: () => {
          setCompleted((ids) => {
            const next = new Set(ids)
            next.delete(task.id)
            return next
          })
          toast.show({
            tone: "danger",
            title: text.completeFailed,
            description: text.completeFailedHint,
          })
        },
      },
    )
  }

  const tasks = useMemo(
    () =>
      (board?.tasks ?? []).map((task) =>
        completed.has(task.id) && task.status !== "done"
          ? { ...task, status: "done" as const }
          : task,
      ),
    [board, completed],
  )
  const pending = mutation.isPending ? mutation.variables?.taskId : undefined
  return { tasks, complete, pendingId: typeof pending === "string" ? pending : null }
}
