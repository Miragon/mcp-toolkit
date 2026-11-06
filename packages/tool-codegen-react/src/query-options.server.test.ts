// @vitest-environment node
/**
 * On the server, as in a server render or a prefetch before it: no `window`, so TanStack's
 * `environmentManager` reads a server, and TanStack retries a query that sets no retry not at all.
 */
import type { ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { environmentManager, QueryClient, type DefaultOptions } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
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
  afterEach(() => {
    environmentManager.setIsServer(() => true)
  })

  // Through the query itself: fetchQuery sets `retry: false` of its own, in a browser too, so it
  // would show nothing about the server. In a browser, this query runs 4 times.
  it("runs where TanStack sees a server, which retries no query by default (the control)", async () => {
    expect(environmentManager.isServer()).toBe(true)
    const queryClient = serverClient()
    const queryFn = vi.fn(() => Promise.reject(new Error("socket hang up")))
    const query = queryClient.getQueryCache().build(queryClient, { queryKey: ["plain"], queryFn })
    await expect(query.fetch()).rejects.toThrow()
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

  it("reads an override through TanStack's environmentManager", async () => {
    environmentManager.setIsServer(() => false)
    const queryClient = serverClient()
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(new Error("socket hang up")))

    await expect(queryClient.fetchQuery(getTask(callTool, queryClient))).rejects.toThrow(
      "socket hang up",
    )
    expect(callTool).toHaveBeenCalledTimes(4)
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
