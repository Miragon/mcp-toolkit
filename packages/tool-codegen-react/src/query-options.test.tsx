import { ToolCallError, type ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { QueryClientProvider, useSuspenseQuery } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { Suspense, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { NoToolCallerError } from "./provider.js"
import { toolQueryOptions } from "./query-options.js"
import {
  createQueryClient,
  renderToolHook,
  structured,
  toolError,
  type Task,
  type TestToolMap,
} from "./test-support/harness.js"
import { useToolQuery } from "./use-tool-query.js"

const readme: Task = { id: "1", title: "Write the README" }

function getTask(callTool: ToolCaller | null, queryClient = createQueryClient()) {
  return toolQueryOptions<TestToolMap, "get_task">(
    "tasks",
    "get_task",
    { id: "1" },
    {
      callTool,
      queryClient,
    },
  )
}

describe("toolQueryOptions", () => {
  it("keys a call as useToolQuery caches it", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(structured(readme)))
    const { queryClient, result } = renderToolHook(
      () => useToolQuery<TestToolMap, "get_task">("tasks", "get_task", { id: "1" }),
      { callTool },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [cached] = queryClient.getQueryCache().getAll()
    expect(getTask(callTool).queryKey).toEqual(cached?.queryKey)
  })

  it("calls the tool with the query's abort signal and yields its output", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(structured(readme)))
    const queryClient = createQueryClient()

    expect(await queryClient.fetchQuery(getTask(callTool, queryClient))).toEqual(readme)
    expect(callTool).toHaveBeenCalledExactlyOnceWith(
      "get_task",
      { id: "1" },
      { signal: expect.any(AbortSignal) as unknown },
    )
  })

  it("never retries a ToolCallError or a NoToolCallerError, whatever the client's defaults", async () => {
    const queryClient = createQueryClient({ retry: 3, retryDelay: 0 })
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(toolError("No task 1")))

    await expect(queryClient.fetchQuery(getTask(callTool, queryClient))).rejects.toThrow(
      ToolCallError,
    )
    expect(callTool).toHaveBeenCalledOnce()
    queryClient.clear()
    await expect(queryClient.fetchQuery(getTask(null, queryClient))).rejects.toThrow(
      NoToolCallerError,
    )
  })

  it("retries any other failure as the client's defaults say", async () => {
    const queryClient = createQueryClient({ retry: 2, retryDelay: 0 })
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(new Error("socket hang up")))

    await expect(queryClient.fetchQuery(getTask(callTool, queryClient))).rejects.toThrow(
      "socket hang up",
    )
    expect(callTool).toHaveBeenCalledTimes(3)
  })

  it("feeds useSuspenseQuery", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(structured(readme)))
    const queryClient = createQueryClient()
    const { result } = renderHook(() => useSuspenseQuery(getTask(callTool, queryClient)).data, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={null}>{children}</Suspense>
        </QueryClientProvider>
      ),
    })

    await waitFor(() => expect(result.current).toEqual(readme))
  })
})
