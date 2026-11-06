import { isToolCallError, type ToolCallError } from "@miragon/mcp-toolkit-tool-codegen-core"
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest"
import {
  createTasksClient,
  type TasksClient,
  type TasksGetTaskOutput,
  type TasksListTasksInput,
  type TasksListTasksOutput,
  type TasksToolName,
} from "../src/generated/tools.js"
import { connectMcp, type McpConnection } from "../src/mcp-connection.js"
import { demo } from "../src/node-client.js"
import { startTasksServer, type RunningServer } from "./support/tasks-server.js"

/** What `promise` rejects with; fails unless that is a ToolCallError. */
async function toolError(promise: Promise<unknown>): Promise<ToolCallError> {
  const reason = await promise.then(
    (value) => expect.fail(`expected a rejection, got ${JSON.stringify(value)}`),
    (error: unknown) => error,
  )
  if (!isToolCallError(reason)) expect.fail(`expected a ToolCallError, got ${String(reason)}`)
  return reason
}

/** The generated client over a real MCP SDK client, against the example server in this process. */
describe("the typed tasks client", () => {
  let server: RunningServer
  let connection: McpConnection
  let tasks: TasksClient

  beforeEach(async () => {
    server = await startTasksServer()
    connection = await connectMcp(server.url, "node-client-test")
    tasks = createTasksClient(connection.callTool)
  })

  afterEach(async () => {
    await connection?.close()
    await server?.close()
  })

  it("adds, completes, lists and reads tasks with the server's structured results", async () => {
    expect(await tasks.addTask({ title: "Write the release notes" })).toEqual({
      id: "task-1",
      title: "Write the release notes",
      done: false,
    })
    await tasks.addTask({ title: "Tag the release" })
    expect(await tasks.completeTask({ id: "task-1" })).toMatchObject({ id: "task-1", done: true })

    expect(await tasks.listTasks()).toEqual({
      tasks: [
        { id: "task-1", title: "Write the release notes", done: true },
        { id: "task-2", title: "Tag the release", done: false },
      ],
    })
    expect(await tasks.listTasks({ done: false })).toEqual({
      tasks: [{ id: "task-2", title: "Tag the release", done: false }],
    })
    expect(await tasks.getTask({ id: "task-2" })).toEqual({
      id: "task-2",
      title: "Tag the release",
      done: false,
    })
  })

  it("rejects with a ToolCallError carrying the tool's text when the tool reports an error", async () => {
    const error = await toolError(tasks.getTask({ id: "task-404" }))
    expect(error.toolName).toBe("get-task")
    expect(error.message).toBe('No task with id "task-404".')
  })

  it("reports what the types cannot check, the server's input validation, as a tool error", async () => {
    // minLength: 1 has no TypeScript type, so the empty title compiles; the server rejects it.
    const error = await toolError(tasks.addTask({ title: "" }))
    expect(error.toolName).toBe("add-task")
    expect(error.message).toMatch(/title/)
  })

  it("runs the walk-through of pnpm node-client", async () => {
    const lines: string[] = []
    await demo(tasks, (line) => lines.push(line))
    expect(lines).toEqual([
      "added task-1 and task-2",
      "completed task-1: Write the release notes",
      "open: Tag the release",
      "task-2 is open",
      'get-task failed: No task with id "task-404".',
    ])
  })

  it("does not compile an unknown tool name or wrong arguments", () => {
    // Never called: tsc (pnpm typecheck) checks the lines, the test runner only sees the types.
    function misuse(client: TasksClient) {
      // @ts-expect-error: the server lists no delete-task
      void client.call("delete-task", { id: "task-1" })
      // @ts-expect-error: the map holds the server's names, not the client's method names
      void client.call("addTask", { title: "Write the release notes" })
      // @ts-expect-error: add-task takes a title
      void client.addTask({ name: "Write the release notes" })
      // @ts-expect-error: no property beyond the input schema's
      void client.addTask({ title: "Write the release notes", done: true })
      // @ts-expect-error: an id is a string
      void client.getTask({ id: 1 })
      // @ts-expect-error: get-task needs an id
      void client.getTask()
      // @ts-expect-error: get-task takes an id, not add-task's title
      void client.call("get-task", { title: "Write the release notes" })
    }

    expectTypeOf(misuse).toBeFunction()
    expectTypeOf<TasksToolName>().toEqualTypeOf<
      "add-task" | "complete-task" | "get-task" | "list-tasks"
    >()
    expectTypeOf(tasks.getTask).returns.resolves.toEqualTypeOf<TasksGetTaskOutput>()
    expectTypeOf(tasks.listTasks).parameter(0).toEqualTypeOf<TasksListTasksInput | undefined>()
    expectTypeOf(tasks.call<"list-tasks">).returns.resolves.toEqualTypeOf<TasksListTasksOutput>()
  })
})
