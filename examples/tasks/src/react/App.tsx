import { ToolCallerProvider, useToolCaller } from "@miragon/mcp-toolkit-tool-codegen-react"
import { useState, type FormEvent } from "react"
import {
  useTasksAddTaskMutation,
  useTasksCompleteTaskMutation,
  useTasksListTasksQuery,
} from "../generated/hooks.js"
import { useMcpConnection } from "./mcp.js"

/** The app below its QueryClientProvider: one MCP connection, its caller for the hooks. */
export function App({ mcpUrl }: { mcpUrl: string }) {
  const connection = useMcpConnection(mcpUrl)
  return (
    <main>
      <h1>Tasks</h1>
      {connection.state === "failed" ? (
        <p role="alert">
          {/* The SDK ends its message with the response body, which a failed proxy leaves empty. */}
          Cannot reach the MCP server at {mcpUrl}: {connection.error.message.replace(/[\s:]+$/, "")}
          . Is <code>pnpm serve</code> running, on the PORT the dev server proxies to?
        </p>
      ) : (
        // Until the handshake is done the caller is null, and the hooks wait for it.
        <ToolCallerProvider
          callTool={connection.state === "connected" ? connection.callTool : null}
        >
          <AddTaskForm />
          <TaskList />
        </ToolCallerProvider>
      )}
    </main>
  )
}

function AddTaskForm() {
  const [title, setTitle] = useState("")
  const connected = useToolCaller() !== null
  // On success the hook invalidates every "tasks" query, so the list refetches by itself.
  const addTask = useTasksAddTaskMutation({ onSuccess: () => setTitle("") })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    addTask.mutate({ title: title.trim() })
  }

  return (
    <form onSubmit={submit}>
      <label>
        New task
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <button type="submit" disabled={!connected || addTask.isPending || title.trim() === ""}>
        Add task
      </button>
      {addTask.isError && <p role="alert">Could not add the task: {addTask.error.message}</p>}
    </form>
  )
}

function TaskList() {
  const list = useTasksListTasksQuery()
  const completeTask = useTasksCompleteTaskMutation()

  if (list.isPending) return <p>Loading tasks…</p>
  if (list.isError) return <p role="alert">Could not load the tasks: {list.error.message}</p>
  if (list.data.tasks.length === 0) return <p>No tasks yet.</p>
  return (
    <>
      <ul>
        {list.data.tasks.map((task) => (
          <li key={task.id}>
            <label className={task.done ? "done" : undefined}>
              <input
                type="checkbox"
                checked={task.done}
                // There is no tool to reopen a task.
                disabled={task.done || completeTask.isPending}
                onChange={() => completeTask.mutate({ id: task.id })}
              />
              {task.title}
            </label>
          </li>
        ))}
      </ul>
      {completeTask.isError && (
        <p role="alert">Could not complete the task: {completeTask.error.message}</p>
      )}
    </>
  )
}
