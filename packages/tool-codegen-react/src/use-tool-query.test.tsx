import { ToolCallError, type ToolCaller } from "@miragon/mcp-toolkit-tool-codegen-core"
import { act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NoToolCallerError } from "./provider.js"
import { toolQueryKey } from "./query-key.js"
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
import { useToolQuery, type UseToolQueryOptions } from "./use-tool-query.js"

const readme: Task = { id: "1", title: "Write the README" }
const ship: Task = { id: "2", title: "Ship it" }
const tasks: Record<string, Task> = { "1": readme, "2": ship }

function taskCaller() {
  return vi.fn<ToolCaller>((_name, args) => Promise.resolve(structured(tasks[String(args.id)])))
}

function useGetTask(id: string, options?: UseToolQueryOptions<Task>) {
  return useToolQuery<TestToolMap, "get_task">("tasks", "get_task", { id }, options)
}

describe("useToolQuery", () => {
  it("calls the tool through the provider's caller and yields its parsed output", async () => {
    const callTool = vi.fn<ToolCaller>(() =>
      Promise.resolve({ content: [{ type: "text", text: JSON.stringify(readme) }] }),
    )
    const { result, queryClient } = renderToolHook(() => useGetTask("1"), { callTool })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(readme)
    expect(callTool).toHaveBeenCalledExactlyOnceWith(
      "get_task",
      { id: "1" },
      { signal: expect.any(AbortSignal) as unknown },
    )
    expect(
      queryClient.getQueryData(
        toolQueryKey<TestToolMap, "get_task">("tasks", "get_task", { id: "1" }),
      ),
    ).toEqual(readme)
  })

  it("calls again under a new key when the args change", async () => {
    const callTool = taskCaller()
    const { result, rerender, queryClient } = renderToolHook((id: string) => useGetTask(id), {
      callTool,
      initialProps: "1",
    })
    await waitFor(() => expect(result.current.data).toEqual(readme))

    rerender("2")

    await waitFor(() => expect(result.current.data).toEqual(ship))
    expect(callTool.mock.calls.map(([, args]) => args)).toEqual([{ id: "1" }, { id: "2" }])
    expect(
      queryClient.getQueryData(
        toolQueryKey<TestToolMap, "get_task">("tasks", "get_task", { id: "1" }),
      ),
    ).toEqual(readme)
  })

  it("keeps the cached call when equal args arrive as a new object", async () => {
    const callTool = taskCaller()
    const { result, rerender } = renderToolHook(
      (args: TestToolMap["get_task"]["input"]) =>
        useToolQuery<TestToolMap, "get_task">("tasks", "get_task", args),
      { callTool, initialProps: { id: "1" } },
    )
    await waitFor(() => expect(result.current.data).toEqual(readme))

    rerender({ id: "1" })

    expect(result.current.data).toEqual(readme)
    expect(callTool).toHaveBeenCalledOnce()
  })

  it("waits while the provider has no caller and starts once one arrives", async () => {
    const callTool = taskCaller()
    const { result, setCaller } = renderToolHook(() => useGetTask("1", { enabled: true }), {
      callTool: null,
    })

    expect(result.current).toMatchObject({ status: "pending", fetchStatus: "idle" })

    setCaller(callTool)

    await waitFor(() => expect(result.current.data).toEqual(readme))
    expect(callTool).toHaveBeenCalledOnce()
  })

  it("fails a forced refetch without a caller with a NoToolCallerError", async () => {
    const { result } = renderToolHook(() => useGetTask("1"), { callTool: null })
    // Read before the refetch: TanStack re-renders only for the result fields a render read.
    expect(result.current.error).toBeNull()

    const refetched = await act(() => result.current.refetch())

    expect(refetched.error).toBeInstanceOf(NoToolCallerError)
    await waitFor(() => expect(result.current.error).toBeInstanceOf(NoToolCallerError))
    expect(result.current.error).toMatchObject({ toolName: "get_task" })
  })

  it.each([
    ["false", false],
    ["a function returning false", () => false],
  ])("does not call the tool while enabled is %s", async (_label, enabled) => {
    const callTool = taskCaller()
    const { result, rerender } = renderToolHook(
      (enabledNow: UseToolQueryOptions<Task>["enabled"]) =>
        useGetTask("1", { enabled: enabledNow }),
      { callTool, initialProps: enabled },
    )

    expect(result.current.fetchStatus).toBe("idle")
    expect(callTool).not.toHaveBeenCalled()

    rerender(true)

    await waitFor(() => expect(result.current.data).toEqual(readme))
  })

  it("hands TanStack's signal to the caller, so unmounting aborts the call", async () => {
    const callTool = vi.fn<ToolCaller>(() => new Promise(() => {}))
    const { unmount } = renderToolHook(() => useGetTask("1"), { callTool })
    await waitFor(() => expect(callTool).toHaveBeenCalledOnce())
    const signal = callTool.mock.calls[0]?.[2]?.signal

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)

    unmount()

    expect(signal?.aborted).toBe(true)
  })

  it("hands callOptions to the caller next to TanStack's signal, and keeps them out of the key", async () => {
    const callTool = taskCaller()
    const onprogress = vi.fn()
    const { result, queryClient } = renderToolHook(
      () => useGetTask("1", { callOptions: { timeout: 120_000, onprogress } }),
      { callTool },
    )

    await waitFor(() => expect(result.current.data).toEqual(readme))

    expect(callTool).toHaveBeenCalledExactlyOnceWith(
      "get_task",
      { id: "1" },
      { timeout: 120_000, onprogress, signal: expect.any(AbortSignal) as unknown },
    )
    const [cached] = queryClient.getQueryCache().getAll()
    expect(cached?.queryKey).toEqual(
      toolQueryKey<TestToolMap, "get_task">("tasks", "get_task", { id: "1" }),
    )
    expect(cached?.options).not.toHaveProperty("callOptions")
  })

  it("keeps TanStack's signal when callOptions carry one anyway", async () => {
    const foreign = new AbortController().signal
    const callTool = taskCaller()
    const { result } = renderToolHook(
      () =>
        useGetTask("1", {
          callOptions: { signal: foreign } as UseToolQueryOptions<Task>["callOptions"],
        }),
      { callTool },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const signal = callTool.mock.calls[0]?.[2]?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal).not.toBe(foreign)
  })

  it("maps the output with select and caches the output itself", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(structured([readme, ship])))
    const { result, queryClient } = renderToolHook(
      () =>
        useToolQuery<TestToolMap, "list_tasks", string[]>(
          "tasks",
          "list_tasks",
          {},
          { select: (list) => list.map((task) => task.title) },
        ),
      { callTool },
    )

    await waitFor(() => expect(result.current.data).toEqual(["Write the README", "Ship it"]))
    expect(
      queryClient.getQueryData(toolQueryKey<TestToolMap, "list_tasks">("tasks", "list_tasks", {})),
    ).toEqual([readme, ship])
  })
})

describe("useToolQuery retry", () => {
  const failing = () => vi.fn<ToolCaller>(() => Promise.reject(new Error("socket hang up")))

  it("never retries a ToolCallError, even when the client's defaults retry", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(toolError("No task 9")))
    const { result } = renderToolHook(() => useGetTask("9"), {
      callTool,
      queryClient: createQueryClient({ retry: 3, retryDelay: 0 }),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(callTool).toHaveBeenCalledOnce()
    expect(result.current.error).toBeInstanceOf(ToolCallError)
    expect(result.current.error?.message).toBe("No task 9")
  })

  it.each(REQUEST_TIMEOUTS)(
    "never retries %s, even when the client's defaults retry",
    async (_label, timeout) => {
      const callTool = vi.fn<ToolCaller>(() => Promise.reject(timeout))
      const { result } = renderToolHook(() => useGetTask("1"), {
        callTool,
        queryClient: createQueryClient({ retry: 3, retryDelay: 0 }),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(callTool).toHaveBeenCalledOnce()
      expect(result.current.error).toBe(timeout)
    },
  )

  // The v2 SDK reports any failed POST under one string code, the v1 SDK under the HTTP status.
  it.each([
    ["a closed connection", sdkError("SdkError", "CONNECTION_CLOSED", "Connection closed")],
    [
      "the v2 SDK's HTTP 503",
      sdkError("SdkHttpError", "CLIENT_HTTP_NOT_IMPLEMENTED", "Error POSTing to endpoint: busy"),
    ],
    [
      "the v1 SDK's HTTP 503",
      sdkError("Error", 503, "Streamable HTTP error: Error POSTing to endpoint: busy"),
    ],
  ])("retries %s, which the next attempt may get past", async (_label, transient) => {
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(transient))
    const { result } = renderToolHook(() => useGetTask("1"), {
      callTool,
      queryClient: createQueryClient({ retry: 3, retryDelay: 0 }),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(callTool).toHaveBeenCalledTimes(4)
  })

  it("retries any other failure 3 times in the browser when the client sets no retry", async () => {
    const callTool = failing()
    const { result } = renderToolHook(() => useGetTask("1", { retryDelay: 0 }), {
      callTool,
      queryClient: createQueryClient({}),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(callTool).toHaveBeenCalledTimes(4)
    expect(result.current.error?.message).toBe("socket hang up")
  })

  it.each([
    ["false", false, 1],
    ["1", 1, 2],
    ["a function allowing two", (failureCount: number) => failureCount < 2, 3],
  ])("retries any other failure as the client's retry %s says", async (_label, retry, calls) => {
    const callTool = failing()
    const { result } = renderToolHook(() => useGetTask("1"), {
      callTool,
      queryClient: createQueryClient({ retry, retryDelay: 0 }),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(callTool).toHaveBeenCalledTimes(calls)
  })

  it("follows the query defaults set for the key's prefix over the client's", async () => {
    const callTool = failing()
    const queryClient = createQueryClient({ retry: false, retryDelay: 0 })
    queryClient.setQueryDefaults(["tasks"], { retry: 2 })
    const { result } = renderToolHook(() => useGetTask("1"), { callTool, queryClient })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(callTool).toHaveBeenCalledTimes(3)
  })

  it("never retries a NoToolCallerError: a refetch without a caller fails at once", async () => {
    const { result } = renderToolHook(() => useGetTask("1"), {
      callTool: null,
      queryClient: createQueryClient({ retry: 3, retryDelay: 10 }),
    })
    expect(result.current.error).toBeNull()

    const refetched = await act(() => result.current.refetch())

    expect(refetched.error).toBeInstanceOf(NoToolCallerError)
    expect(refetched.failureCount).toBe(1)
  })

  it("leaves retrying to options.retry when given, a ToolCallError included", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(toolError("Engine busy")))
    const { result } = renderToolHook(() => useGetTask("1", { retry: 1, retryDelay: 0 }), {
      callTool,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(callTool).toHaveBeenCalledTimes(2)
  })

  it("leaves a request timeout to an options.retry function when given", async () => {
    const timeout = sdkError("SdkError", "REQUEST_TIMEOUT", "Request timed out")
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(timeout))
    const retry = vi.fn<(failureCount: number, error: Error) => boolean>((count) => count < 2)
    const { result } = renderToolHook(() => useGetTask("1", { retry, retryDelay: 0 }), {
      callTool,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(callTool).toHaveBeenCalledTimes(3)
    expect(retry).toHaveBeenCalledWith(0, timeout)
  })
})
