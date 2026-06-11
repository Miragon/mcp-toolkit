import { describe, expect, it } from "vitest"
import { countByStatus, createTaskStore, filterTasks, type Task } from "./store.js"

/**
 * Unit tests for the pure store logic. The repo's test policy is "pure logic →
 * Vitest"; the tool wiring is covered by the in-process host smoke test
 * (`examples/test/tasks.smoke.test.ts`), so here we only exercise the store.
 */

const SAMPLE: Task[] = [
  {
    id: "a",
    title: "A",
    status: "todo",
    priority: "high",
    createdAt: "2026-01-01",
    completedAt: null,
  },
  {
    id: "b",
    title: "B",
    status: "doing",
    priority: "low",
    createdAt: "2026-01-02",
    completedAt: null,
  },
  {
    id: "c",
    title: "C",
    status: "done",
    priority: "high",
    createdAt: "2026-01-03",
    completedAt: "2026-01-04",
  },
]

describe("countByStatus", () => {
  it("tallies tasks per status and reports the total", () => {
    expect(countByStatus(SAMPLE)).toEqual({ total: 3, todo: 1, doing: 1, done: 1 })
  })

  it("returns all-zero counts for an empty list", () => {
    expect(countByStatus([])).toEqual({ total: 0, todo: 0, doing: 0, done: 0 })
  })
})

describe("filterTasks", () => {
  it("returns every task when no filter is given", () => {
    expect(filterTasks(SAMPLE)).toHaveLength(3)
  })

  it("filters by status", () => {
    expect(filterTasks(SAMPLE, { status: "todo" }).map((t) => t.id)).toEqual(["a"])
  })

  it("filters by priority", () => {
    expect(filterTasks(SAMPLE, { priority: "high" }).map((t) => t.id)).toEqual(["a", "c"])
  })

  it("ANDs status and priority", () => {
    expect(filterTasks(SAMPLE, { status: "done", priority: "high" }).map((t) => t.id)).toEqual([
      "c",
    ])
  })
})

describe("createTaskStore", () => {
  const fixedClock = () => "2026-06-10T12:00:00.000Z"

  it("seeds a demo board by default", () => {
    const store = createTaskStore()
    expect(store.list().length).toBeGreaterThan(0)
    expect(store.board().counts.total).toBe(store.list().length)
  })

  it("creates a todo task with the injected clock and a fresh id", () => {
    const store = createTaskStore({ seed: [], now: fixedClock })
    const created = store.create({ title: "  Write the README  ", priority: "high" })

    expect(created).toMatchObject({
      title: "Write the README", // trimmed
      status: "todo",
      priority: "high",
      createdAt: "2026-06-10T12:00:00.000Z",
      completedAt: null,
    })
    expect(store.list()).toHaveLength(1)
    expect(created.id).toMatch(/^t-\d+$/)
  })

  it("defaults a created task's priority to medium", () => {
    const store = createTaskStore({ seed: [] })
    expect(store.create({ title: "No priority" }).priority).toBe("medium")
  })

  it("rejects a blank title", () => {
    const store = createTaskStore({ seed: [] })
    expect(() => store.create({ title: "   " })).toThrow(/non-empty title/)
  })

  it("completes a task and stamps completedAt", () => {
    const store = createTaskStore({ seed: [], now: fixedClock })
    const { id } = store.create({ title: "Finish" })

    const done = store.complete(id)
    expect(done.status).toBe("done")
    expect(done.completedAt).toBe("2026-06-10T12:00:00.000Z")
  })

  it("is idempotent: re-completing keeps the original completedAt", () => {
    let tick = 0
    const store = createTaskStore({ seed: [], now: () => `t${(tick += 1)}` })
    const { id } = store.create({ title: "Finish" })

    const first = store.complete(id)
    const second = store.complete(id)
    expect(second.completedAt).toBe(first.completedAt)
  })

  it("throws on an unknown id", () => {
    const store = createTaskStore({ seed: [] })
    expect(() => store.complete("nope")).toThrow(/Unknown task id/)
  })

  it("board() reflects created and completed tasks", () => {
    const store = createTaskStore({ seed: [] })
    const { id } = store.create({ title: "One" })
    store.create({ title: "Two" })
    store.complete(id)

    const board = store.board()
    expect(board.counts).toEqual({ total: 2, todo: 1, doing: 0, done: 1 })
    expect(board.tasks).toHaveLength(2)
  })
})
