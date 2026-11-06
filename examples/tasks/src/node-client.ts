/**
 * The generated client without React: an MCP SDK client in Node, adapted to a `ToolCaller` and
 * wrapped by the generated `createTasksClient`. Every call is typed by the server's own schemas.
 *
 * Run it with `pnpm node-client` while `pnpm serve` runs (TASKS_MCP_URL overrides the URL).
 */
import { isToolCallError } from "@miragon/mcp-toolkit-tool-codegen-core"
import { createTasksClient, type TasksClient } from "./generated/tools.js"
import { connectMcp } from "./mcp-connection.js"

/** Adds, lists, completes and reads tasks, then shows how a tool error arrives. */
export async function demo(tasks: TasksClient, print: (line: string) => void): Promise<void> {
  const notes = await tasks.addTask({ title: "Write the release notes" })
  const tag = await tasks.addTask({ title: "Tag the release" })
  print(`added ${notes.id} and ${tag.id}`)

  const done = await tasks.completeTask({ id: notes.id })
  print(`completed ${done.id}: ${done.title}`)

  const { tasks: open } = await tasks.listTasks({ done: false })
  print(`open: ${open.map((task) => task.title).join(", ")}`)

  const fetched = await tasks.getTask({ id: tag.id })
  print(`${fetched.id} is ${fetched.done ? "done" : "open"}`)

  try {
    await tasks.getTask({ id: "task-404" })
  } catch (error) {
    // The tool answered with isError: the client rejects with a ToolCallError carrying its text.
    if (!isToolCallError(error)) throw error
    print(`${error.toolName} failed: ${error.message}`)
  }
}

if (import.meta.main) {
  const url = new URL(process.env.TASKS_MCP_URL ?? "http://localhost:4000/mcp")
  const connection = await connectMcp(url, "tasks-node-client")
  try {
    await demo(createTasksClient(connection.callTool), (line) => process.stdout.write(`${line}\n`))
  } finally {
    await connection.close()
  }
}
