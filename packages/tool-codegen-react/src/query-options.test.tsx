import { ToolCallError, type ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { QueryClientProvider, useSuspenseQuery } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { Suspense, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { NoToolCallerError } from "./provider.js"
import { isRequestTimeout, toolQueryOptions } from "./query-options.js"
import {
  createQueryClient,
  renderToolHook,
  REQUEST_TIMEOUTS,
  sdkError,
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

  it("hands the context's callOptions to the call, next to the query's abort signal", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(structured(readme)))
    const queryClient = createQueryClient()
    const options = toolQueryOptions<TestToolMap, "get_task">(
      "tasks",
      "get_task",
      { id: "1" },
      { callTool, queryClient, callOptions: { timeout: 5_000, resetTimeoutOnProgress: true } },
    )

    expect(await queryClient.fetchQuery(options)).toEqual(readme)
    expect(options.queryKey).toEqual(getTask(callTool).queryKey)
    expect(callTool).toHaveBeenCalledExactlyOnceWith(
      "get_task",
      { id: "1" },
      { timeout: 5_000, resetTimeoutOnProgress: true, signal: expect.any(AbortSignal) as unknown },
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

  it.each(REQUEST_TIMEOUTS)(
    "never retries %s, whatever the client's defaults",
    async (_label, timeout) => {
      const queryClient = createQueryClient({ retry: 3, retryDelay: 0 })
      const callTool = vi.fn<ToolCaller>(() => Promise.reject(timeout))

      await expect(queryClient.fetchQuery(getTask(callTool, queryClient))).rejects.toBe(timeout)
      expect(callTool).toHaveBeenCalledOnce()
    },
  )

  it.each([
    ["the v2 SDK", sdkError("ProtocolError", -32001, "Session not found")],
    ["the v1 SDK", sdkError("McpError", -32001, "MCP error -32001: Session not found")],
  ])(
    "retries a server's error with the code -32001 from %s as the client's defaults say",
    async (_label, error) => {
      const queryClient = createQueryClient({ retry: 2, retryDelay: 0 })
      const callTool = vi.fn<ToolCaller>(() => Promise.reject(error))

      await expect(queryClient.fetchQuery(getTask(callTool, queryClient))).rejects.toBe(error)
      expect(callTool).toHaveBeenCalledTimes(3)
    },
  )

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

describe("isRequestTimeout", () => {
  it.each(REQUEST_TIMEOUTS)("is true for %s", (_label, timeout) => {
    expect(isRequestTimeout(timeout)).toBe(true)
  })

  it.each([
    ["a plain Error with the SDK's message", new Error("Request timed out")],
    ["another SDK code", sdkError("SdkError", "CONNECTION_CLOSED", "Connection closed")],
    [
      "the v2 SDK's HTTP 504",
      sdkError(
        "SdkHttpError",
        "CLIENT_HTTP_NOT_IMPLEMENTED",
        "Error POSTing to endpoint: Gateway Timeout",
      ),
    ],
    ["the v1 SDK's HTTP 504", sdkError("Error", 504, "Streamable HTTP error: Gateway Timeout")],
    // A server's own error with the code -32001, such as v2's "Session not found".
    ["the v2 SDK's server error -32001", sdkError("ProtocolError", -32001, "Session not found")],
    [
      "the v1 SDK's server error -32001",
      sdkError("McpError", -32001, "MCP error -32001: Session not found"),
    ],
    [
      "the v1 SDK's timeout message with another code",
      sdkError("McpError", -32000, "MCP error -32001: Request timed out"),
    ],
    ["the v1 code as a string", { code: "-32001" }],
    ["null", null],
    ["undefined", undefined],
    ["a string", "REQUEST_TIMEOUT"],
  ])("is false for %s", (_label, value) => {
    expect(isRequestTimeout(value)).toBe(false)
  })
})
