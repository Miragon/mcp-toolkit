import { describe, expect, it, vi } from "vitest"
import type { Task, TaskStatus } from "../../store.js"
import { listTasks, releasable, runCompletion, type TaskListFilter } from "./board-logic.js"

/**
 * The board's list order and its completion flow, without a DOM. Both guard
 * what a double-click on Complete did: the completed row jumped to the end
 * at once, the next task moved up under the pointer and the second click
 * completed it too; and a second completion started before the first settled
 * swallowed the first one's rollback.
 */

function task(id: string, status: TaskStatus, priority: Task["priority"] = "medium"): Task {
  return { id, title: id, status, priority, createdAt: "2026-01-01", completedAt: null }
}

const ALL: TaskListFilter = { needle: "", status: null, priority: null }
const ids = (tasks: Task[]) => tasks.map((t) => t.id)

describe("listTasks", () => {
  const board = [
    task("draft", "todo", "high"),
    task("reply", "todo", "low"),
    task("review", "doing"),
    task("ship", "done"),
  ]

  it("lists open work first, then by priority", () => {
    const shuffled = [board[3], board[1], board[2], board[0]] as Task[]
    expect(ids(listTasks(shuffled, new Map(), ALL))).toEqual(["draft", "reply", "review", "ship"])
  })

  it("keeps a task completed here in its old place (nothing moves under the pointer)", () => {
    const completed = board.map((t) => (t.id === "draft" ? { ...t, status: "done" as const } : t))
    const placedAs = new Map<string, TaskStatus>([["draft", "todo"]])
    expect(ids(listTasks(completed, placedAs, ALL))).toEqual(["draft", "reply", "review", "ship"])
    // Without the held place it sorts among the done tasks, as after a refresh.
    expect(ids(listTasks(completed, new Map(), ALL))).toEqual(["reply", "review", "draft", "ship"])
  })

  it("keeps it in a filter on its old status and lists it under its new one too", () => {
    const completed = board.map((t) => (t.id === "draft" ? { ...t, status: "done" as const } : t))
    const placedAs = new Map<string, TaskStatus>([["draft", "todo"]])
    expect(ids(listTasks(completed, placedAs, { ...ALL, status: "todo" }))).toEqual([
      "draft",
      "reply",
    ])
    expect(ids(listTasks(completed, placedAs, { ...ALL, status: "done" }))).toEqual([
      "draft",
      "ship",
    ])
    expect(ids(listTasks(completed, new Map(), { ...ALL, status: "todo" }))).toEqual(["reply"])
  })

  it("filters by title text and priority", () => {
    expect(ids(listTasks(board, new Map(), { ...ALL, needle: "re" }))).toEqual(["reply", "review"])
    expect(ids(listTasks(board, new Map(), { ...ALL, priority: "low" }))).toEqual(["reply"])
    expect(ids(listTasks(board, new Map(), { ...ALL, needle: "nothing" }))).toEqual([])
  })
})

describe("releasable", () => {
  it("lets a row go only once the fresh board has the task done", () => {
    const fresh = { tasks: [task("a", "done"), task("b", "todo")] }
    expect(releasable(fresh, "a")).toBe(true)
    // Still running, or not confirmed: the row keeps its place and its done state.
    expect(releasable(fresh, "b")).toBe(false)
    expect(releasable(fresh, "gone")).toBe(false)
  })
})

/** A promise the test settles by hand. */
function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function recorder() {
  const log: string[] = []
  return {
    log,
    steps: (call: (taskId: string) => Promise<unknown>) => ({
      call,
      mark: (t: Task) => log.push(`mark ${t.id}`),
      unmark: (t: Task) => log.push(`unmark ${t.id}`),
      succeeded: (t: Task) => log.push(`ok ${t.id}`),
      failed: (t: Task) => log.push(`failed ${t.id}`),
    }),
  }
}

describe("runCompletion", () => {
  it("marks at once, then reports success", async () => {
    const { log, steps } = recorder()
    const call = vi.fn(() => Promise.resolve({}))
    await runCompletion(task("a", "todo"), steps(call))
    expect(call).toHaveBeenCalledWith("a")
    expect(log).toEqual(["mark a", "ok a"])
  })

  it("rolls back and reports a failed call", async () => {
    const { log, steps } = recorder()
    await runCompletion(
      task("a", "todo"),
      steps(() => Promise.reject(new Error("boom"))),
    )
    expect(log).toEqual(["mark a", "unmark a", "failed a"])
  })

  it("settles overlapping completions each on their own (the first one's rollback survives)", async () => {
    const { log, steps } = recorder()
    const first = deferred()
    const second = deferred()
    const calls: Record<string, Promise<void>> = { a: first.promise, b: second.promise }
    const call = (taskId: string) => calls[taskId] as Promise<void>

    const a = runCompletion(task("a", "todo"), steps(call))
    const b = runCompletion(task("b", "todo"), steps(call))
    expect(log).toEqual(["mark a", "mark b"])

    second.resolve()
    first.reject(new Error("boom"))
    await Promise.all([a, b])
    expect(log).toEqual(["mark a", "mark b", "ok b", "unmark a", "failed a"])
  })
})
