import {
  ToolCallError,
  type ToolCaller,
  type ToolCallResult,
} from "@miragon/mcp-toolkit-tool-codegen-core"
import type { QueryClient } from "@tanstack/react-query"
import { act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NoToolCallerError } from "./provider.js"
import { toolQueryKey } from "./query-key.js"
import {
  createQueryClient,
  renderToolHook,
  structured,
  toolError,
  type Task,
  type TestToolMap,
} from "./test-support/harness.js"
import { useToolMutation, type UseToolMutationOptions } from "./use-tool-mutation.js"
import { useToolQuery } from "./use-tool-query.js"

const created: Task = { id: "3", title: "Ship it" }

/** Lists one task; create_task answers `createResult`, by default the created task. */
function tasksServer(createResult?: ToolCallResult) {
  return vi.fn<ToolCaller>((name, args) =>
    Promise.resolve(
      name === "create_task"
        ? (createResult ?? structured({ id: "3", title: args.title }))
        : structured([{ id: "1", title: "Write the README" }]),
    ),
  )
}

type CreateOptions = UseToolMutationOptions<TestToolMap, "create_task">

function useCreateTask(options?: CreateOptions) {
  return useToolMutation<TestToolMap, "create_task">("tasks", "create_task", options)
}

/** A screen with a list of the "tasks" namespace, one of the "other" namespace and the mutation. */
function useTasksScreen(options?: CreateOptions) {
  return {
    tasks: useToolQuery<TestToolMap, "list_tasks">("tasks", "list_tasks", {}),
    other: useToolQuery<TestToolMap, "list_tasks">("other", "list_tasks", {}),
    create: useCreateTask(options),
  }
}

function listState(queryClient: QueryClient, namespace: string) {
  return queryClient.getQueryState(
    toolQueryKey<TestToolMap, "list_tasks">(namespace, "list_tasks", {}),
  )
}

async function renderTasksScreen({
  options,
  queryClient = createQueryClient(),
  createResult,
}: { options?: CreateOptions; queryClient?: QueryClient; createResult?: ToolCallResult } = {}) {
  const callTool = tasksServer(createResult)
  const view = renderToolHook(() => useTasksScreen(options), { callTool, queryClient })
  await waitFor(() => {
    expect(view.result.current.tasks.isSuccess).toBe(true)
    expect(view.result.current.other.isSuccess).toBe(true)
  })
  return { ...view, callTool }
}

describe("useToolMutation", () => {
  it("calls the tool with the variables and resolves with its parsed output", async () => {
    const callTool = vi.fn<ToolCaller>(() =>
      Promise.resolve({ content: [{ type: "text", text: JSON.stringify(created) }] }),
    )
    const { result } = renderToolHook(() => useCreateTask(), { callTool })

    const output = await act(() => result.current.mutateAsync({ title: "Ship it" }))

    expect(output).toEqual(created)
    await waitFor(() => expect(result.current.data).toEqual(created))
    expect(callTool).toHaveBeenCalledExactlyOnceWith("create_task", { title: "Ship it" }, undefined)
  })

  it("hands callOptions to every call mutate makes, a signal included", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(structured(created)))
    const callOptions = {
      signal: new AbortController().signal,
      timeout: 300_000,
      onprogress: vi.fn(),
      maxTotalTimeout: 600_000,
    }
    const { result } = renderToolHook(() => useCreateTask({ callOptions, invalidates: false }), {
      callTool,
    })

    await act(() => result.current.mutateAsync({ title: "Ship it" }))
    await act(() => result.current.mutateAsync({ title: "Tag it" }))

    expect(callTool.mock.calls).toEqual([
      ["create_task", { title: "Ship it" }, callOptions],
      ["create_task", { title: "Tag it" }, callOptions],
    ])
  })

  it("invalidates every query of its namespace by default", async () => {
    const { result, queryClient } = await renderTasksScreen()

    await act(() => result.current.create.mutateAsync({ title: "Ship it" }))

    await waitFor(() =>
      expect(listState(queryClient, "tasks")).toMatchObject({
        dataUpdateCount: 2,
        isInvalidated: false,
      }),
    )
    expect(listState(queryClient, "other")).toMatchObject({
      dataUpdateCount: 1,
      isInvalidated: false,
    })
  })

  it("settles without waiting for the default invalidation's refetches", async () => {
    // A query of the namespace that never answers again, as one failing at the transport
    // through its retries would: the mutation must not wait for it.
    const { result, callTool, queryClient } = await renderTasksScreen()
    callTool.mockImplementation((name, args) =>
      name === "create_task"
        ? Promise.resolve(structured({ id: "3", title: args.title }))
        : new Promise(() => {}),
    )

    const output = await act(() => result.current.create.mutateAsync({ title: "Ship it" }))

    expect(output).toEqual(created)
    expect(listState(queryClient, "tasks")).toMatchObject({
      isInvalidated: true,
      fetchStatus: "fetching",
    })
  })

  it("stays pending until the queries of an explicit invalidates have refetched", async () => {
    const { result, callTool } = await renderTasksScreen({ options: { invalidates: [["tasks"]] } })
    let answerRefetch: (result: ToolCallResult) => void = () => {}
    callTool.mockImplementation((name, args) =>
      name === "create_task"
        ? Promise.resolve(structured({ id: "3", title: args.title }))
        : new Promise((resolve) => (answerRefetch = resolve)),
    )

    act(() => result.current.create.mutate({ title: "Ship it" }))
    await waitFor(() =>
      expect(callTool).toHaveBeenLastCalledWith("list_tasks", {}, expect.anything()),
    )

    expect(result.current.create.isPending).toBe(true)

    answerRefetch(structured([created]))

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true))
    expect(result.current.tasks.data).toEqual([created])
  })

  it("invalidates nothing with invalidates: false", async () => {
    const { result, queryClient, callTool } = await renderTasksScreen({
      options: { invalidates: false },
    })

    await act(() => result.current.create.mutateAsync({ title: "Ship it" }))

    expect(listState(queryClient, "tasks")).toMatchObject({
      dataUpdateCount: 1,
      isInvalidated: false,
    })
    expect(callTool).toHaveBeenCalledTimes(3)
  })

  it("invalidates exactly the key prefixes given", async () => {
    const { result, queryClient } = await renderTasksScreen({
      options: { invalidates: [["other"], ["tasks", "get_task"]] },
    })

    await act(() => result.current.create.mutateAsync({ title: "Ship it" }))

    expect(listState(queryClient, "other")?.dataUpdateCount).toBe(2)
    expect(listState(queryClient, "tasks")).toMatchObject({
      dataUpdateCount: 1,
      isInvalidated: false,
    })
  })

  it("runs the caller's onSuccess once the invalidation is under way", async () => {
    const queryClient = createQueryClient()
    let tasksListWhenCalled: unknown
    const onSuccess = vi.fn<NonNullable<CreateOptions["onSuccess"]>>(() => {
      tasksListWhenCalled = { ...listState(queryClient, "tasks") }
    })
    const { result } = await renderTasksScreen({ options: { onSuccess }, queryClient })

    await act(() => result.current.create.mutateAsync({ title: "Ship it" }))

    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(
      created,
      { title: "Ship it" },
      undefined,
      expect.objectContaining({ client: queryClient }),
    )
    expect(tasksListWhenCalled).toMatchObject({ isInvalidated: true, fetchStatus: "fetching" })
  })

  it("rejects with the ToolCallError and invalidates nothing when the tool fails", async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result, queryClient } = await renderTasksScreen({
      options: { onSuccess, onError },
      createResult: toolError("Title must not be empty"),
    })

    const failure = await act(() =>
      result.current.create.mutateAsync({ title: "" }).catch((error: unknown) => error),
    )

    expect(failure).toBeInstanceOf(ToolCallError)
    expect(failure).toMatchObject({ message: "Title must not be empty" })
    expect(onError).toHaveBeenCalledOnce()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(listState(queryClient, "tasks")).toMatchObject({
      dataUpdateCount: 1,
      isInvalidated: false,
    })
  })

  it("rejects with a NoToolCallerError while the provider has no caller", async () => {
    const { result } = renderToolHook(() => useCreateTask(), { callTool: null })

    act(() => result.current.mutate({ title: "Ship it" }))

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NoToolCallerError))
    expect(result.current.error).toMatchObject({ toolName: "create_task" })
  })

  it("sends {} when mutate() leaves out the args of a tool without required input", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(structured([])))
    const { result } = renderToolHook(
      () => useToolMutation<TestToolMap, "list_tasks">("tasks", "list_tasks"),
      { callTool },
    )

    await act(() => result.current.mutateAsync())

    expect(callTool).toHaveBeenCalledExactlyOnceWith("list_tasks", {}, undefined)
  })

  it("calls through a caller that arrived after the first render", async () => {
    const callTool = tasksServer()
    const { result, setCaller } = renderToolHook(() => useCreateTask(), { callTool: null })

    setCaller(callTool)
    const output = await act(() => result.current.mutateAsync({ title: "Ship it" }))

    expect(output).toEqual(created)
  })
})
