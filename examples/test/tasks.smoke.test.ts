import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "mcp-use/client"
import type { McpServerInstance } from "mcp-use/server"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"
import type { Task, TasksBoardData } from "../modules/tasks/store.js"

/**
 * In-process smoke test for the self-owned `tasks` module. Boots a real MCP
 * server via `createFrameworkApp` with `createTasksPlugin()` over a loopback
 * socket and drives it with an MCP client — proving the module's *own* tools
 * (registered through `createToolRegistrar`, not federated from an upstream)
 * appear in `tools/list` and round-trip through real calls.
 *
 * Runs in CI through the root `pnpm -r --if-present run test`.
 */

const FIXTURE_HTML = path.join(import.meta.dirname, "fixtures", "mcp-app.html")

/** Reserve a free TCP port by binding to port 0 and releasing it again. */
async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

describe("tasks module smoke", () => {
  let app: McpServerInstance<false>
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    app = await createFrameworkApp({
      name: "tasks-smoke-host",
      version: "0.0.0",
      host: "127.0.0.1",
      plugins: [createTasksPlugin()],
      proxies: [],
      app: {
        resourceUri: "ui://tasks-smoke/mcp-app.html",
        htmlPath: FIXTURE_HTML,
      },
    })
    const port = await getFreePort()
    await app.listen(port)

    client = MCPClient.fromDict({
      mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("host")
  })

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
  })

  it("advertises the module's own tools in tools/list", async () => {
    const names = (await session.listTools()).map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(["list_tasks", "create_task", "complete_task", "show_tasks_board"]),
    )
  })

  it("list_tasks returns the seeded board as structuredContent", async () => {
    const result = await session.callTool("list_tasks", {})
    expect(result.isError).toBeFalsy()

    // A bare array output is auto-wrapped to `{ data: [...] }`.
    const sc = result.structuredContent as { data?: Task[] } | undefined
    expect(Array.isArray(sc?.data)).toBe(true)
    expect(sc!.data!.length).toBeGreaterThan(0)
    const first = sc!.data![0]!
    expect(typeof first.id).toBe("string")
    expect(typeof first.title).toBe("string")
    expect(["todo", "doing", "done"]).toContain(first.status)
  })

  it("filters list_tasks by status", async () => {
    const result = await session.callTool("list_tasks", { status: "done" })
    const sc = result.structuredContent as { data: Task[] }
    expect(sc.data.every((t) => t.status === "done")).toBe(true)
  })

  it("create_task → complete_task round-trips and is reflected in the board", async () => {
    const created = await session.callTool("create_task", {
      title: "Wire up the smoke test",
      priority: "high",
    })
    expect(created.isError).toBeFalsy()
    const task = created.structuredContent as unknown as Task
    expect(task).toMatchObject({
      title: "Wire up the smoke test",
      status: "todo",
      priority: "high",
    })

    const done = await session.callTool("complete_task", { taskId: task.id })
    const completed = done.structuredContent as unknown as Task
    expect(completed.status).toBe("done")
    expect(typeof completed.completedAt).toBe("string")

    // The widget feed sees the same store: the created+completed task is counted.
    const board = (await session.callTool("tasks_board_data", {}))
      .structuredContent as unknown as TasksBoardData
    expect(board.tasks.some((t) => t.id === task.id && t.status === "done")).toBe(true)
    expect(board.counts.total).toBe(board.tasks.length)
  })

  it("show_tasks_board returns a single-widget view envelope", async () => {
    const result = await session.callTool("show_tasks_board", {})
    expect(result.isError).toBeFalsy()

    const sc = result.structuredContent as
      | {
          layout?: unknown
          context?: {
            stepData: Record<string, { data: unknown; _app?: string; _dataType?: string }>
          }
        }
      | undefined
    expect(sc?.layout).toEqual([{ row: [{ widget: "tasks:board" }] }])

    const step = sc!.context!.stepData.result
    expect(step?._app).toBe("tasks")
    expect(step?._dataType).toBe("tasks:board")
    const data = step!.data as TasksBoardData
    expect(Array.isArray(data.tasks)).toBe(true)
    expect(data.counts.total).toBe(data.tasks.length)
  })

  it("complete_task on an unknown id surfaces a tool error", async () => {
    const result = await session.callTool("complete_task", { taskId: "does-not-exist" })
    expect(result.isError).toBe(true)
  })
})
