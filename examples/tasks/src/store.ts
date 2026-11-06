/** An in-memory task list: the state behind the example server. */

export interface Task {
  id: string
  title: string
  done: boolean
}

export interface TaskStore {
  /** All tasks in the order they were added; only those with the given state when `done` is set. */
  list(filter?: { done?: boolean }): Task[]
  get(id: string): Task | undefined
  add(title: string): Task
  /** Marks a task done; completing a done task changes nothing. Undefined for an unknown id. */
  complete(id: string): Task | undefined
}

/** A fresh, empty store. Ids count up from `task-1`, so a new store always hands out the same ids. */
export function createTaskStore(): TaskStore {
  const tasks = new Map<string, Task>()
  let lastId = 0
  return {
    list: ({ done } = {}) =>
      [...tasks.values()]
        .filter((task) => done === undefined || task.done === done)
        .map((task) => ({ ...task })),
    get: (id) => {
      const task = tasks.get(id)
      return task && { ...task }
    },
    add: (title) => {
      const task = { id: `task-${++lastId}`, title, done: false }
      tasks.set(task.id, task)
      return { ...task }
    },
    complete: (id) => {
      const task = tasks.get(id)
      if (task === undefined) return undefined
      task.done = true
      return { ...task }
    },
  }
}
