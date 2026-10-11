import {
  environmentManager,
  hashKey,
  keepPreviousData,
  MutationObserver,
  QueryClient,
  QueryObserver,
  type QueryObserverOptions,
} from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isToolError, ToolResultError } from "./parse-tool-result.js"
import {
  claimToolQueryKey,
  invalidateToolQueries,
  NoToolTransportError,
  seedToolQuery,
  settleEachCall,
  shouldRetryToolCall,
  TOOL_QUERY_RETRIES,
  toolKeyCollisionMessage,
  toolQueryKey,
  toolQueryOptions,
  type ToolCaller,
} from "./tool-query.js"

/**
 * The query layer of the toolkit's data hooks (toolkit#176 K18), against a
 * real TanStack `QueryClient` and its observers — what `useToolQuery`,
 * `useViewToolQuery` and `useViewData` run, without a renderer.
 */

const ok = (structuredContent: unknown) => ({ content: [], structuredContent })
const isErrorResult = (text: string) => ({ isError: true, content: [{ type: "text", text }] })
/** How mcp-use's `useDynamicTool` rejects an `isError` answer inside a view. */
class ToolError extends Error {
  readonly result: unknown
  constructor(result: unknown) {
    super("tool failed")
    this.name = "ToolError"
    this.result = result
  }
}

let client: QueryClient

beforeEach(() => {
  vi.useFakeTimers()
  client = new QueryClient()
})

afterEach(() => {
  client.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Subscribe an observer for `options`; returns it and its latest result. */
function observe<T>(options: QueryObserverOptions<T, Error, T>) {
  const observer = new QueryObserver<T, Error, T>(client, options)
  const unsubscribe = observer.subscribe(() => {})
  return { observer, unsubscribe }
}

describe("toolQueryKey", () => {
  it("is the caller's key, then the args — the 2.x key, unchanged", () => {
    expect(toolQueryKey(["orders", 7], "orders_list", { page: 1 })).toEqual([
      "orders",
      7,
      { page: 1 },
    ])
    expect(toolQueryOptions(["orders"], "orders_list", { page: 1 }, undefined).queryKey).toEqual(
      toolQueryKey(["orders"], "orders_list", { page: 1 }),
    )
  })

  it("invalidating by the caller's key or by [...key, args] still matches", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(ok({ n: 1 })))
    observe(toolQueryOptions(["orders"], "orders_list", { page: 1 }, callTool))
    observe(toolQueryOptions(["orders"], "orders_list", { page: 2 }, callTool))
    await vi.advanceTimersByTimeAsync(0)
    expect(client.getQueryCache().findAll({ queryKey: ["orders"] })).toHaveLength(2)
    expect(client.getQueryCache().findAll({ queryKey: ["orders", { page: 1 }] })).toHaveLength(1)
  })
})

describe("toolQueryKey with the tool name (toolNameInQueryKey, K18)", () => {
  it("is the caller's key, the tool name, then the args", () => {
    expect(toolQueryKey(["orders", 7], "orders_list", { page: 1 }, true)).toEqual([
      "orders",
      7,
      "orders_list",
      { page: 1 },
    ])
    expect(toolQueryKey(["orders"], "orders_list", { page: 1 }, false)).toEqual([
      "orders",
      { page: 1 },
    ])
    expect(
      toolQueryOptions(["orders"], "orders_list", { page: 1 }, undefined, undefined, {
        toolNameInKey: true,
      }).queryKey,
    ).toEqual(["orders", "orders_list", { page: 1 }])
  })

  it("two tools behind one key and args get an entry each; the caller's key still invalidates both", async () => {
    const callTool = vi.fn<ToolCaller>((name) => Promise.resolve(ok({ from: name })))
    const build = { toolNameInKey: true }
    const a = observe(toolQueryOptions(["feed"], "a_data", { id: 1 }, callTool, undefined, build))
    const b = observe(toolQueryOptions(["feed"], "b_data", { id: 1 }, callTool, undefined, build))
    await vi.advanceTimersByTimeAsync(0)
    expect(a.observer.getCurrentResult().data).toEqual({ from: "a_data" })
    expect(b.observer.getCurrentResult().data).toEqual({ from: "b_data" })
    expect(client.getQueryCache().findAll({ queryKey: ["feed"] })).toHaveLength(2)
    expect(client.getQueryCache().findAll({ queryKey: ["feed", "a_data"] })).toHaveLength(1)
    expect(hashKey(toolQueryKey(["feed"], "a_data", { id: 1 }, true))).not.toBe(
      hashKey(toolQueryKey(["feed"], "b_data", { id: 1 }, true)),
    )
    callTool.mockClear()
    await client.invalidateQueries({ queryKey: ["feed"] })
    expect(callTool.mock.calls.map(([name]) => name).sort()).toEqual(["a_data", "b_data"])
  })

  it("with the 2.x key the same two tools share one entry: the collision the guard reports", async () => {
    const callTool = vi.fn<ToolCaller>((name) => Promise.resolve(ok({ from: name })))
    observe(toolQueryOptions(["feed"], "a_data", { id: 1 }, callTool))
    observe(toolQueryOptions(["feed"], "b_data", { id: 1 }, callTool))
    await vi.advanceTimersByTimeAsync(0)
    expect(client.getQueryCache().findAll({ queryKey: ["feed"] })).toHaveLength(1)
  })
})

describe("claimToolQueryKey (the guard of a key two tools share)", () => {
  const keyId = hashKey(toolQueryKey(["feed"], "a_data", { id: 1 }))

  it("reports the other tool when a second one claims the same key, once per switch", () => {
    expect(claimToolQueryKey(client, keyId, "a_data")).toBeNull()
    expect(claimToolQueryKey(client, keyId, "a_data"), "the same tool again").toBeNull()
    expect(claimToolQueryKey(client, keyId, "b_data")).toBe("a_data")
    expect(claimToolQueryKey(client, keyId, "b_data")).toBeNull()
    expect(claimToolQueryKey(client, keyId, "a_data")).toBe("b_data")
  })

  it("keeps the claims per client and per key", () => {
    claimToolQueryKey(client, keyId, "a_data")
    expect(claimToolQueryKey(new QueryClient(), keyId, "b_data")).toBeNull()
    expect(claimToolQueryKey(client, hashKey(["other"]), "b_data")).toBeNull()
  })

  it("names the key and both tools in its warning", () => {
    expect(toolKeyCollisionMessage('["feed",{"id":1}]', "b_data", "a_data")).toBe(
      '[mcp-toolkit] the query key ["feed",{"id":1}] is used by "a_data" and "b_data": both ' +
        "share one cache entry and overwrite each other's answer. Give each tool its own queryKey.",
    )
  })
})

describe("toolQueryOptions", () => {
  it("passes TanStack's query options through", () => {
    const select = (d: number) => d * 2
    const retryDelay = () => 5
    const options = toolQueryOptions<number>(["k"], "t", {}, vi.fn<ToolCaller>(), {
      retry: 1,
      retryDelay,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
      initialData: 3,
      initialDataUpdatedAt: 123,
      enabled: false,
      select,
      gcTime: 50,
    })
    expect(options).toMatchObject({
      queryKey: ["k", {}],
      retry: 1,
      retryDelay,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
      initialData: 3,
      initialDataUpdatedAt: 123,
      enabled: false,
      select,
      gcTime: 50,
    })
  })

  it("leaves retry to the caller, else to the client's default (an omitted key stays omitted)", () => {
    const callTool = vi.fn<ToolCaller>()
    expect("retry" in toolQueryOptions(["k"], "t", {}, callTool)).toBe(false)
    expect(toolQueryOptions(["k"], "t", {}, callTool, { retry: 1 }).retry).toBe(1)
    expect(toolQueryOptions(["k"], "t", {}, callTool, { retry: shouldRetryToolCall }).retry).toBe(
      shouldRetryToolCall,
    )
  })

  it("never retries a missing transport: nothing changes until the mount does", () => {
    expect(toolQueryOptions(["k"], "t", {}, undefined).retry).toBe(false)
    expect(toolQueryOptions(["k"], "t", {}, undefined, { retry: 3 }).retry).toBe(false)
  })

  it("calls the tool with its args and decodes the result (structured-first, or a custom decoder)", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(ok({ n: 1 })))
    const { queryFn } = toolQueryOptions(["k"], "orders_list", { page: 2 }, callTool)
    await expect(Promise.resolve((queryFn as () => Promise<unknown>)())).resolves.toEqual({ n: 1 })
    expect(callTool).toHaveBeenCalledWith("orders_list", { page: 2 })
    const custom = toolQueryOptions(["k"], "t", {}, callTool, undefined, {
      decode: () => "decoded",
    })
    await expect(Promise.resolve((custom.queryFn as () => Promise<unknown>)())).resolves.toBe(
      "decoded",
    )
  })

  it("without a transport the query fails loudly instead of idling (N25)", async () => {
    const { queryFn } = toolQueryOptions(["k"], "orders_list", {}, undefined)
    await expect(Promise.resolve((queryFn as () => Promise<unknown>)())).rejects.toBeInstanceOf(
      NoToolTransportError,
    )
    const { observer } = observe(toolQueryOptions(["k"], "orders_list", {}, undefined))
    await vi.advanceTimersByTimeAsync(0)
    expect(observer.getCurrentResult()).toMatchObject({ status: "error", failureCount: 1 })
    expect(observer.getCurrentResult().error).toMatchObject({
      name: "NoToolTransportError",
      message:
        '[mcp-toolkit] cannot call "orders_list": no tool transport. Mount the widget under ' +
        "AppQueryProvider with callTool, or a HostBridgeProvider.",
    })
  })
})

describe("shouldRetryToolCall (the opt-in retry policy for tool errors)", () => {
  it("never retries a tool's own isError answer or a missing transport", () => {
    expect(
      shouldRetryToolCall(0, new ToolResultError("[404] gone", isErrorResult("[404] gone"))),
    ).toBe(false)
    expect(shouldRetryToolCall(0, new ToolError(isErrorResult("x")))).toBe(false)
    expect(shouldRetryToolCall(0, new NoToolTransportError("t"))).toBe(false)
  })

  it("retries a failed transport up to TanStack's default count", () => {
    const lost = new Error("connection lost")
    expect(TOOL_QUERY_RETRIES).toBe(3)
    expect(shouldRetryToolCall(0, lost)).toBe(true)
    expect(shouldRetryToolCall(2, lost)).toBe(true)
    expect(shouldRetryToolCall(3, lost)).toBe(false)
    expect(shouldRetryToolCall(0, "not an error")).toBe(true)
  })
})

describe("a tool query against a real client", () => {
  it("by default an isError answer is retried like any failure (TanStack's 3, the 2.x behaviour)", async () => {
    // TanStack retries 3 times in a browser, never on a server: test the browser.
    const wasServer = environmentManager.isServer()
    environmentManager.setIsServer(() => false)
    try {
      const callTool = vi.fn<ToolCaller>(() => Promise.resolve(isErrorResult("[503] busy")))
      const { observer } = observe(toolQueryOptions(["incident"], "incident_data", {}, callTool))
      await vi.advanceTimersByTimeAsync(0)
      expect(observer.getCurrentResult()).toMatchObject({ status: "pending", failureCount: 1 })
      await vi.advanceTimersByTimeAsync(10_000)
      expect(callTool).toHaveBeenCalledTimes(4)
      expect(observer.getCurrentResult().error).toBeInstanceOf(ToolResultError)
    } finally {
      environmentManager.setIsServer(() => wasServer)
    }
  })

  it("a client's default retry applies to the tool queries", async () => {
    client.setDefaultOptions({ queries: { retry: false } })
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(new Error("connection lost")))
    const { observer } = observe(toolQueryOptions(["feed"], "feed_data", {}, callTool))
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledOnce()
    expect(observer.getCurrentResult().status).toBe("error")
  })

  it("with shouldRetryToolCall an isError answer fails at once: one call, no ~7 s backoff", async () => {
    const callTool = vi.fn<ToolCaller>(() =>
      Promise.resolve(isErrorResult("[404] no such incident")),
    )
    const { observer } = observe(
      toolQueryOptions(["incident"], "incident_data", { id: 9 }, callTool, {
        retry: shouldRetryToolCall,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    const result = observer.getCurrentResult()
    expect(callTool).toHaveBeenCalledOnce()
    expect(result.status).toBe("error")
    expect(result.error).toBeInstanceOf(ToolResultError)
    expect(result.failureCount).toBe(1)
    expect(result.failureReason).toBe(result.error)
  })

  it("with shouldRetryToolCall a failed transport is retried, exposing failureCount/failureReason meanwhile", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(new Error("connection lost")))
    const { observer } = observe(
      toolQueryOptions(["feed"], "feed_data", {}, callTool, { retry: shouldRetryToolCall }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(observer.getCurrentResult()).toMatchObject({ status: "pending", failureCount: 1 })
    expect(observer.getCurrentResult().failureReason?.message).toBe("connection lost")
    await vi.advanceTimersByTimeAsync(10_000)
    expect(callTool).toHaveBeenCalledTimes(1 + TOOL_QUERY_RETRIES)
    expect(observer.getCurrentResult()).toMatchObject({ status: "error", failureCount: 4 })
  })

  it("retry and retryDelay are the caller's to set — a ToolError can be retried on request", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.reject(new ToolError(isErrorResult("busy"))))
    observe(
      toolQueryOptions(["feed"], "feed_data", {}, callTool, {
        retry: (count, error) => isToolError(error) && count < 2,
        retryDelay: 100,
      }),
    )
    await vi.advanceTimersByTimeAsync(99)
    expect(callTool).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(callTool).toHaveBeenCalledTimes(3)
  })

  it("enabled: false keeps the tool uncalled", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(ok({})))
    observe(toolQueryOptions(["feed"], "feed_data", {}, callTool, { enabled: false }))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(callTool).not.toHaveBeenCalled()
  })

  it("initialData + initialDataUpdatedAt within staleTime is not refetched on mount", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(ok({ n: 2 })))
    const { observer } = observe(
      toolQueryOptions<{ n: number }>(["feed"], "feed_data", {}, callTool, {
        initialData: { n: 1 },
        initialDataUpdatedAt: Date.now(),
        staleTime: 30_000,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).not.toHaveBeenCalled()
    expect(observer.getCurrentResult().data).toEqual({ n: 1 })
  })

  it("an old initialDataUpdatedAt is stale and refetched", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(ok({ n: 2 })))
    const { observer } = observe(
      toolQueryOptions<{ n: number }>(["feed"], "feed_data", {}, callTool, {
        initialData: { n: 1 },
        initialDataUpdatedAt: Date.now() - 60_000,
        staleTime: 30_000,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledOnce()
    expect(observer.getCurrentResult().data).toEqual({ n: 2 })
  })

  it("placeholderData: keepPreviousData keeps the previous args' answer while the next loads", async () => {
    let resolveNext: (v: unknown) => void = () => {}
    const callTool = vi.fn<ToolCaller>((_name, args) =>
      (args as { q: string }).q === "a"
        ? Promise.resolve(ok({ rows: ["a"] }))
        : new Promise((resolve) => (resolveNext = resolve)),
    )
    const options = (q: string) =>
      toolQueryOptions<{ rows: string[] }>(["search"], "search_data", { q }, callTool, {
        placeholderData: keepPreviousData,
      })
    const { observer } = observe(options("a"))
    await vi.advanceTimersByTimeAsync(0)
    observer.setOptions(options("b"))
    await vi.advanceTimersByTimeAsync(0)
    expect(observer.getCurrentResult()).toMatchObject({
      data: { rows: ["a"] },
      isPlaceholderData: true,
      isFetching: true,
    })
    resolveNext(ok({ rows: ["b"] }))
    await vi.advanceTimersByTimeAsync(0)
    expect(observer.getCurrentResult()).toMatchObject({
      data: { rows: ["b"] },
      isPlaceholderData: false,
    })
  })

  it("refetch reads the tool again", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(ok({ n: 1 })))
    const { observer } = observe(toolQueryOptions(["feed"], "feed_data", {}, callTool))
    await vi.advanceTimersByTimeAsync(0)
    await observer.refetch()
    expect(callTool).toHaveBeenCalledTimes(2)
  })
})

describe("seedToolQuery (useViewData's seed mode)", () => {
  const key = toolQueryKey(["incident"], "incident_data", { id: 1 })

  it("writes an empty entry, with the given updatedAt", () => {
    expect(seedToolQuery(client, key, { n: 1 }, 1234)).toBe(true)
    expect(client.getQueryData(key)).toEqual({ n: 1 })
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(1234)
  })

  it("never rolls a refetched answer back with the OLD payload (a remount or re-render)", () => {
    seedToolQuery(client, key, { n: 1 })
    client.setQueryData(key, { n: 2 })
    expect(seedToolQuery(client, key, { n: 1 })).toBe(false)
    expect(client.getQueryData(key)).toEqual({ n: 2 })
  })

  it("a payload not seeded before is a new delivery and wins", () => {
    seedToolQuery(client, key, { n: 1 })
    client.setQueryData(key, { n: 2 })
    expect(seedToolQuery(client, key, { n: 3 })).toBe(true)
    expect(client.getQueryData(key)).toEqual({ n: 3 })
  })

  it("re-seeds an entry that was dropped, and keeps seeds per client and key", () => {
    seedToolQuery(client, key, { n: 1 })
    client.removeQueries({ queryKey: key })
    expect(seedToolQuery(client, key, { n: 1 })).toBe(true)
    const other = new QueryClient()
    expect(seedToolQuery(other, key, { n: 1 })).toBe(true)
    const otherKey = toolQueryKey(["incident"], "incident_data", { id: 2 })
    expect(seedToolQuery(client, otherKey, { n: 1 })).toBe(true)
  })

  it("a payload that cannot be serialised is always a new delivery", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(seedToolQuery(client, key, circular)).toBe(true)
    client.setQueryData(key, { n: 2 })
    expect(seedToolQuery(client, key, circular)).toBe(true)
  })
})

describe("settleEachCall (useToolMutation's per-call callbacks)", () => {
  const ctx = () => ({ client, meta: undefined, mutationKey: undefined })

  it("fires the callbacks of EVERY call, where TanStack's own mutate keeps only the latest", async () => {
    const mutationFn = vi.fn((v: { id: number }) => Promise.resolve(`retried ${String(v.id)}`))
    const observer = new MutationObserver(client, { mutationFn })
    // Mounted, as `useMutation` keeps it: TanStack fires per-call callbacks only then.
    observer.subscribe(() => {})
    const tanstack = [vi.fn(), vi.fn()]
    void observer.mutate({ id: 1 }, { onSuccess: tanstack[0] })
    void observer.mutate({ id: 2 }, { onSuccess: tanstack[1] })
    await vi.advanceTimersByTimeAsync(0)
    expect(tanstack[0]).not.toHaveBeenCalled()
    expect(tanstack[1]).toHaveBeenCalledOnce()

    const ours = [vi.fn(), vi.fn()]
    const settled = [vi.fn(), vi.fn()]
    settleEachCall(
      observer.mutate({ id: 1 }),
      { id: 1 },
      { onSuccess: ours[0], onSettled: settled[0] },
      ctx,
    )
    settleEachCall(
      observer.mutate({ id: 2 }),
      { id: 2 },
      { onSuccess: ours[1], onSettled: settled[1] },
      ctx,
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(ours[0]).toHaveBeenCalledWith("retried 1", { id: 1 }, undefined, ctx())
    expect(ours[1]).toHaveBeenCalledWith("retried 2", { id: 2 }, undefined, ctx())
    expect(settled[0]).toHaveBeenCalledWith("retried 1", null, { id: 1 }, undefined, ctx())
    expect(settled[1]).toHaveBeenCalledOnce()
  })

  it("a failed call fires onError and onSettled with the error, never an unhandled rejection", async () => {
    const error = new Error("[409] already resolved")
    const onError = vi.fn()
    const onSettled = vi.fn()
    const onSuccess = vi.fn()
    settleEachCall(Promise.reject(error), { id: 1 }, { onError, onSettled, onSuccess }, ctx)
    settleEachCall(Promise.reject(error), { id: 2 }, undefined, ctx)
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledWith(error, { id: 1 }, undefined, ctx())
    expect(onSettled).toHaveBeenCalledWith(undefined, error, { id: 1 }, undefined, ctx())
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("skips the callbacks once the component unmounted (context null)", async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    settleEachCall(Promise.resolve(1), {}, { onSuccess }, () => null)
    settleEachCall(Promise.reject(new Error("x")), {}, { onError }, () => null)
    await vi.advanceTimersByTimeAsync(0)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("any subset of callbacks is fine: a missing one is skipped, nothing surfaces", async () => {
    const failedX = Promise.reject(new Error("x"))
    const failedY = Promise.reject(new Error("y"))
    const surfaced = vi.spyOn(Promise, "reject")
    const onSettled = vi.fn()
    const onSuccess = vi.fn()
    settleEachCall(Promise.resolve(1), {}, { onSettled }, ctx)
    settleEachCall(failedX, {}, { onSettled }, ctx)
    settleEachCall(failedY, {}, { onSuccess }, ctx)
    settleEachCall(Promise.resolve(2), {}, {}, ctx)
    await vi.advanceTimersByTimeAsync(0)
    expect(onSettled).toHaveBeenCalledTimes(2)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(surfaced, "no callback threw").not.toHaveBeenCalled()
  })

  it("a throwing callback surfaces as a rejection without skipping the ones after it", async () => {
    const surfaced = vi.spyOn(Promise, "reject").mockImplementation(() => Promise.resolve())
    const onSettled = vi.fn()
    const onSettledAfterError = vi.fn()
    settleEachCall(
      Promise.resolve(1),
      {},
      {
        onSuccess: () => {
          throw new Error("boom")
        },
        onSettled,
      },
      ctx,
    )
    settleEachCall(
      new Promise((_, reject) => reject(new Error("call failed"))),
      {},
      {
        onError: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- a callback may throw a non-Error; settle() must still surface it as an Error
          throw "not an error"
        },
        onSettled: onSettledAfterError,
      },
      ctx,
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(onSettled).toHaveBeenCalledOnce()
    expect(onSettledAfterError).toHaveBeenCalledOnce()
    const reasons = surfaced.mock.calls.map(([reason]) => (reason as Error).message)
    expect(reasons).toEqual(["boom", "not an error"])
  })
})

describe("invalidateToolQueries (useToolMutation's invalidation)", () => {
  it("refetches the active queries under a key, only marks the inactive ones stale", async () => {
    const callTool = vi.fn<ToolCaller>(() => Promise.resolve(ok({ n: 1 })))
    const active = observe(toolQueryOptions(["incidents"], "incidents_data", { page: 1 }, callTool))
    const inactive = observe(
      toolQueryOptions(["incidents"], "incidents_data", { page: 2 }, callTool),
    )
    observe(toolQueryOptions(["tasks"], "tasks_data", {}, callTool))
    await vi.advanceTimersByTimeAsync(0)
    inactive.unsubscribe()
    callTool.mockClear()
    await invalidateToolQueries(client, [["incidents"]])
    expect(callTool).toHaveBeenCalledExactlyOnceWith("incidents_data", { page: 1 })
    const page2 = toolQueryKey(["incidents"], "incidents_data", { page: 2 })
    expect(client.getQueryState(page2)?.isInvalidated).toBe(true)
    expect(active.observer.getCurrentResult().isFetching).toBe(false)
  })

  it("does nothing without keys", async () => {
    const spy = vi.spyOn(client, "invalidateQueries")
    await invalidateToolQueries(client, undefined)
    await invalidateToolQueries(client, [])
    expect(spy).not.toHaveBeenCalled()
  })
})
