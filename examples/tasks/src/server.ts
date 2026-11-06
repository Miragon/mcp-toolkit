/**
 * The example's MCP server: four task tools over an in-memory store. Every tool declares an
 * input and an output schema and answers with `structuredContent`, so the generated client is
 * typed on both sides; the annotations decide which tools get a query hook.
 *
 * Run it with `pnpm serve` (port from PORT, default 4000).
 */
import { MCPServer } from "mcp-use"
import { z } from "zod"
import { createTaskStore } from "./store.js"

const task = z.object({
  id: z.string().describe('The task\'s id, for example "task-1".'),
  title: z.string().describe("What there is to do."),
  done: z.boolean().describe("Whether the task is completed."),
})

const taskId = z.object({ id: z.string().describe('The task\'s id, for example "task-1".') })

/** A successful result: the data as `structuredContent` and, for clients that read text, as JSON. */
function ok<T extends object>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  }
}

/** A tool error the caller can show: MCP reports it as a result with `isError`, not a failure. */
function noSuchTask(id: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `No task with id ${JSON.stringify(id)}.` }],
  }
}

/** A server over a fresh, empty store: every call starts from no tasks (the tests rely on it). */
export function createTasksServer(): MCPServer {
  const store = createTaskStore()
  const server = new MCPServer({
    name: "tasks",
    version: "0.0.0",
    description: "Example MCP server for @miragon/mcp-toolkit-tool-codegen: a small task list.",
  })

  server.tool(
    {
      name: "list-tasks",
      description: "Lists the tasks in the order they were added.",
      inputSchema: z.object({
        done: z
          .boolean()
          .optional()
          .describe("Only completed (true) or only open (false) tasks; all tasks when omitted."),
      }),
      outputSchema: z.object({ tasks: z.array(task) }),
      annotations: { readOnlyHint: true },
    },
    ({ done }) => ok({ tasks: store.list({ done }) }),
  )

  server.tool(
    {
      name: "get-task",
      description: "Returns one task.",
      inputSchema: taskId,
      outputSchema: task,
      annotations: { readOnlyHint: true },
    },
    ({ id }) => {
      const found = store.get(id)
      return found ? ok(found) : noSuchTask(id)
    },
  )

  server.tool(
    {
      name: "add-task",
      description: "Adds an open task and returns it.",
      inputSchema: z.object({ title: z.string().min(1).describe("What there is to do.") }),
      outputSchema: task,
      annotations: { destructiveHint: false },
    },
    ({ title }) => ok(store.add(title)),
  )

  server.tool(
    {
      name: "complete-task",
      description: "Marks a task as done and returns it. Completing a done task changes nothing.",
      inputSchema: taskId,
      outputSchema: task,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ id }) => {
      const completed = store.complete(id)
      return completed ? ok(completed) : noSuchTask(id)
    },
  )

  return server
}

if (import.meta.main) {
  const { url } = await createTasksServer().listen(Number(process.env.PORT ?? 4000))
  process.stdout.write(`Tasks MCP server listening on ${url}\n`)
}
