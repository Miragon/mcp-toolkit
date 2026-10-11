// @vitest-environment happy-dom
import type { ReactNode } from "react"
import { QueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi, type Mock } from "vitest"
import { NoToolTransportError } from "../lib/tool-query.js"
import { AppQueryProvider } from "../providers/query-provider.js"
import { flushEffects, hookProbe, renderWithEffects } from "../render-effects.js"
import { useToolMutation, useToolQuery } from "./use-tool-query.js"
import { useViewData } from "./use-view-data.js"
import { useViewToolQuery } from "./use-view-tool-query.js"

/**
 * The data hooks' wiring with their effects running (toolkit#176 K18, N25):
 * the key the REAL query uses, that a seeded feed does not fetch on mount,
 * that a late transport fetches, and `useToolMutation`'s per-call callbacks
 * and invalidation. The pure parts are pinned in `lib/tool-query.test.ts`.
 */

type CallTool = (name: string, args: object) => Promise<unknown>

const ARGS = { id: 1 }
const answer = (data: unknown) => ({ structuredContent: data })

/**
 * A client per test that keeps its cache (no garbage collection). The probes
 * read the result after the render, so every change re-renders them (a widget
 * reads its fields during the render, which TanStack tracks).
 */
function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, notifyOnChangeProps: "all" } },
  })
}

function under(
  client: QueryClient,
  callTool: CallTool | undefined,
  toolNameInQueryKey: boolean | undefined,
  node: ReactNode,
) {
  return (
    <AppQueryProvider client={client} callTool={callTool} toolNameInQueryKey={toolNameInQueryKey}>
      {node}
    </AppQueryProvider>
  )
}

/** The keys of every query in the client's cache. */
const cachedKeys = (client: QueryClient) =>
  client
    .getQueryCache()
    .findAll()
    .map((query) => query.queryKey)

let unmount: (() => Promise<void>) | null = null

afterEach(async () => {
  await unmount?.()
  unmount = null
})

async function render(node: ReactNode) {
  const view = await renderWithEffects(node)
  unmount = view.unmount
  return view
}

describe("the query hooks' real cache keys (K18)", () => {
  it("useToolQuery fetches under [...key, tool, args] with toolNameInQueryKey, else the 2.x key", async () => {
    for (const [flag, key] of [
      [true, ["feed", "feed_data", ARGS]],
      [undefined, ["feed", ARGS]],
    ] as const) {
      const client = testClient()
      const callTool = vi.fn<CallTool>(() => Promise.resolve(answer({ n: 1 })))
      const probe = hookProbe(() => useToolQuery(["feed"], "feed_data", ARGS))
      await render(under(client, callTool, flag, <probe.Probe />))
      await flushEffects()
      expect(cachedKeys(client)).toEqual([key])
      expect(client.getQueryData(key)).toEqual({ n: 1 })
      expect(probe.current().data).toEqual({ n: 1 })
      await unmount?.()
    }
  })

  it("useViewToolQuery fetches under the same keys", async () => {
    for (const [flag, key] of [
      [true, ["view", "show_list", ARGS]],
      [false, ["view", ARGS]],
    ] as const) {
      const client = testClient()
      const callTool = vi.fn<CallTool>(() => Promise.resolve(answer({ rows: [] })))
      const probe = hookProbe(() => useViewToolQuery(["view"], "show_list", ARGS))
      await render(under(client, callTool, flag, <probe.Probe />))
      await flushEffects()
      expect(cachedKeys(client)).toEqual([key])
      expect(callTool).toHaveBeenCalledWith("show_list", ARGS)
      await unmount?.()
    }
  })

  it('a seeded feed ("seed" mode) is read from the key the seed wrote: no call on mount', async () => {
    for (const flag of [true, false]) {
      const client = testClient()
      const callTool = vi.fn<CallTool>(() => Promise.resolve(answer({ n: 2 })))
      const probe = hookProbe(() =>
        useViewData<{ n: number }>({ n: 1 }, ["feed"], "feed_data", ARGS, true, {
          initialDataMode: "seed",
          staleTime: 60_000,
        }),
      )
      await render(under(client, callTool, flag, <probe.Probe />))
      await flushEffects()
      expect(callTool, "the seed answers the mount").not.toHaveBeenCalled()
      expect(cachedKeys(client)).toHaveLength(1)
      expect(probe.current()).toMatchObject({ data: { n: 1 }, loading: false })
      await unmount?.()
    }
  })
})

describe("a tool transport that arrives after the first render (N25)", () => {
  it("the query fetches once it arrives instead of keeping NoToolTransportError", async () => {
    for (const useHook of [
      () => useToolQuery<{ n: number }>(["late"], "late_data", ARGS),
      () => useViewToolQuery<{ n: number }>(["late-view"], "late_view", ARGS),
    ]) {
      const client = testClient()
      const probe = hookProbe(useHook)
      const view = await render(under(client, undefined, undefined, <probe.Probe />))
      await flushEffects()
      expect(probe.current().error).toBeInstanceOf(NoToolTransportError)
      const callTool = vi.fn<CallTool>(() => Promise.resolve(answer({ n: 3 })))
      await view.rerender(under(client, callTool, undefined, <probe.Probe />))
      await flushEffects()
      expect(callTool).toHaveBeenCalledTimes(1)
      expect(probe.current()).toMatchObject({ data: { n: 3 }, error: null })
      await unmount?.()
    }
  })
})

describe("useToolMutation with its effects", () => {
  type Mutation = ReturnType<typeof useToolMutation>

  async function mountMutation(
    client: QueryClient,
    callTool: CallTool,
    invalidateKeys?: unknown[][],
  ) {
    const probe = hookProbe(() => useToolMutation("retry_incident", { invalidateKeys }))
    const view = await render(under(client, callTool, undefined, <probe.Probe />))
    return { view, mutation: (): Mutation => probe.current() }
  }

  it("fires the per-call callbacks of EVERY call, not only the latest one", async () => {
    const client = testClient()
    const pending: ((value: unknown) => void)[] = []
    const callTool = vi.fn<CallTool>(() => new Promise((resolve) => pending.push(resolve)))
    const { mutation } = await mountMutation(client, callTool)
    const first: Mock = vi.fn()
    const second: Mock = vi.fn()
    mutation().mutate({ id: "a" }, { onSuccess: first })
    mutation().mutate({ id: "b" }, { onSuccess: second })
    await flushEffects()
    for (const resolve of pending) resolve(answer({ done: true }))
    await flushEffects()
    expect(first).toHaveBeenCalledTimes(1)
    expect(first.mock.calls[0]?.slice(0, 2)).toEqual([{ done: true }, { id: "a" }])
    expect(second).toHaveBeenCalledTimes(1)
    expect(second.mock.calls[0]?.slice(0, 2)).toEqual([{ done: true }, { id: "b" }])
  })

  it("invalidates an inactive page under invalidateKeys without fetching it", async () => {
    const client = testClient()
    const pageFetch = vi.fn(() => Promise.resolve(["page 2"]))
    await client.prefetchQuery({ queryKey: ["incidents", { page: 2 }], queryFn: pageFetch })
    expect(pageFetch).toHaveBeenCalledTimes(1)
    const callTool = vi.fn<CallTool>(() => Promise.resolve(answer({ done: true })))
    const { mutation } = await mountMutation(client, callTool, [["incidents"]])
    const onSuccess = vi.fn()
    mutation().mutate({ id: "a" }, { onSuccess })
    await flushEffects()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(client.getQueryState(["incidents", { page: 2 }])?.isInvalidated).toBe(true)
    expect(pageFetch, "an inactive page waits for its next use").toHaveBeenCalledTimes(1)
  })

  it("fires no per-call callback once the component unmounted", async () => {
    const client = testClient()
    let resolve: (value: unknown) => void = () => {}
    const callTool = vi.fn<CallTool>(() => new Promise((r) => (resolve = r)))
    const { view, mutation } = await mountMutation(client, callTool)
    const onSuccess = vi.fn()
    const onSettled = vi.fn()
    mutation().mutate({ id: "a" }, { onSuccess, onSettled })
    await flushEffects()
    await view.unmount()
    resolve(answer({ done: true }))
    await flushEffects()
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  })
})
