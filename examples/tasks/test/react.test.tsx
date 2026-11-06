// @vitest-environment happy-dom
import nodeConsole from "node:console"
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { ToolCallerProvider } from "@miragon/mcp-toolkit-tool-codegen-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import type { Window as HappyDOMWindow } from "happy-dom"
import { StrictMode, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTasksAddTaskMutation, useTasksListTasksQuery } from "../src/generated/hooks.js"
import { connectMcp } from "../src/mcp-connection.js"
import { App } from "../src/react/App.js"
import { spawnTasksServer, type ServerProcess } from "./support/server-process.js"

/**
 * The generated hooks and the app in a DOM, over a real MCP SDK client, against the example
 * server (a fresh one per test). The page has the server's origin, as the app has behind the
 * Vite proxy, so the browser client talks same-origin.
 */
let server: ServerProcess
let queryClient: QueryClient

/**
 * happy-dom prints every failed or aborted fetch on Node's own console, not vitest's: here the
 * requests to the unreachable server, and the one StrictMode's first connection aborts when it
 * closes at once. Those are expected; anything else still prints.
 */
function quietExpectedNetworkErrors() {
  const print = nodeConsole.error.bind(nodeConsole)
  vi.spyOn(nodeConsole, "error").mockImplementation((...data: unknown[]) => {
    const code = (data[0] as { code?: unknown } | undefined)?.code
    if (code !== "ECONNREFUSED" && code !== "ECONNRESET") print(...data)
  })
}

beforeEach(async () => {
  quietExpectedNetworkErrors()
  server = await spawnTasksServer()
  ;(window as unknown as HappyDOMWindow).happyDOM.setURL(`${server.origin}/`)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(async () => {
  cleanup()
  queryClient.clear()
  await server.close()
})

const mcpUrl = () => new URL("/mcp", location.origin)

function withCaller(callTool: ToolCaller) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToolCallerProvider callTool={callTool}>{children}</ToolCallerProvider>
      </QueryClientProvider>
    )
  }
}

describe("the generated hooks", () => {
  it("query the server's tasks, and an add refetches the list", async () => {
    const connection = await connectMcp(mcpUrl(), "react-hooks-test")
    try {
      const { result } = renderHook(
        () => ({ list: useTasksListTasksQuery(), add: useTasksAddTaskMutation() }),
        { wrapper: withCaller(connection.callTool) },
      )
      await waitFor(() => expect(result.current.list.data).toEqual({ tasks: [] }))

      await act(() => result.current.add.mutateAsync({ title: "Write the release notes" }))
      // No refetch call here: the mutation invalidates every query of the "tasks" namespace.
      await waitFor(() =>
        expect(result.current.list.data).toEqual({
          tasks: [{ id: "task-1", title: "Write the release notes", done: false }],
        }),
      )
    } finally {
      cleanup()
      await connection.close()
    }
  })
})

describe("the app", () => {
  function renderApp() {
    // The tree main.tsx renders.
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App mcpUrl={mcpUrl().href} />
        </QueryClientProvider>
      </StrictMode>,
    )
  }

  it("waits for the connection, then adds a task through the form and completes it", async () => {
    renderApp()
    // No caller before the handshake: the query waits and the form cannot submit.
    expect(screen.getByText("Loading tasks…")).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add task" }).disabled).toBe(true)
    await screen.findByText("No tasks yet.")

    fireEvent.change(screen.getByLabelText("New task"), {
      target: { value: "Write the release notes" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add task" }))
    const added = await screen.findByRole<HTMLInputElement>("checkbox", {
      name: "Write the release notes",
    })
    expect(added.checked).toBe(false)
    expect(screen.getByLabelText<HTMLInputElement>("New task").value).toBe("")

    fireEvent.click(added)
    await waitFor(() => {
      const completed = screen.getByRole<HTMLInputElement>("checkbox", {
        name: "Write the release notes",
      })
      expect([completed.checked, completed.disabled]).toEqual([true, true])
    })
  })

  it("says so when the MCP server cannot be reached", async () => {
    await server.close()
    renderApp()
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain(`Cannot reach the MCP server at ${mcpUrl().href}`)
    expect(alert.textContent).toContain("Is pnpm serve running")
  })
})
