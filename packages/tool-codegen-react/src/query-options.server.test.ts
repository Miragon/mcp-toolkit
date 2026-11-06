// @vitest-environment node
/**
 * On the server, as in a server render or a prefetch before it: no `window`, so TanStack's
 * `isServer` holds, and TanStack retries a query that sets no retry not at all.
 */
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { isServer, QueryClient, type DefaultOptions } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { toolQueryOptions } from "./query-options.js"
import type { TestToolMap } from "./test-support/harness.js"

function serverClient(queries: DefaultOptions["queries"] = {}) {
  return new QueryClient({ defaultOptions: { queries: { retryDelay: 0, ...queries } } })
}

function getTask(callTool: ToolCaller, queryClient: QueryClient) {
  return toolQueryOptions<TestToolMap, "get_task">(
    "tasks",
    "get_task",
    { id: "1" },
    { callTool, queryClient },
  )
}

describe("a tool query on the server", () => {
  it("runs where TanStack sees a server, which retries no query by default (the control)", async () => {
    expect(isServer).toBe(true)
    const queryFn = vi.fn(() => Promise.reject(new Error("socket hang up")))
    await expect(serverClient().fetchQuery({ queryKey: ["plain"], queryFn })).rejects.toThrow()
    expect(queryFn).toHaveBeenCalledOnce()
  })

  it("is not retried either when the client sets no retry", async () => {
    const queryClient = serverClient()
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(new Error("socket hang up")))

    await expect(queryClient.fetchQuery(getTask(callTool, queryClient))).rejects.toThrow(
      "socket hang up",
    )
    expect(callTool).toHaveBeenCalledOnce()
  })

  it("is retried as the client's defaults say", async () => {
    const queryClient = serverClient({ retry: 2 })
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(new Error("socket hang up")))

    await expect(queryClient.fetchQuery(getTask(callTool, queryClient))).rejects.toThrow(
      "socket hang up",
    )
    expect(callTool).toHaveBeenCalledTimes(3)
  })
})
