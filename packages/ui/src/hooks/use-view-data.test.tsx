import { QueryClient } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { toolQueryKey } from "../lib/tool-query.js"
import { AppQueryProvider } from "../providers/query-provider.js"
import { useViewData, type UseViewDataOptions, type ViewDataResult } from "./use-view-data.js"

type Demo = { n: number }
type CallTool = (name: string, args: object) => Promise<unknown>

const KEY = ["use-view-data.test"] as const
const ARGS = { id: 1 }

/** Renders a probe once (SSR, the house path) and hands back the hook's result. */
function probe(
  initialData: Demo | null,
  ready: boolean,
  callTool: CallTool,
  key: string,
  options?: UseViewDataOptions<Demo> & { client?: QueryClient },
): ViewDataResult<Demo> {
  let result: ViewDataResult<Demo> | undefined
  const { client, ...hookOptions } = options ?? {}
  function Probe() {
    result = useViewData<Demo>(initialData, [...KEY, key], "demo_data", ARGS, ready, hookOptions)
    return null
  }
  renderToStaticMarkup(
    <AppQueryProvider callTool={callTool} client={client}>
      <Probe />
    </AppQueryProvider>,
  )
  if (!result) throw new Error("probe did not render")
  return result
}

describe("useViewData", () => {
  it("returns host-pushed data verbatim without fetching", () => {
    const callTool = vi.fn<CallTool>(() => Promise.resolve({}))
    const result = probe({ n: 1 }, true, callTool, "pushed")
    expect(result.data).toEqual({ n: 1 })
    expect(result.loading).toBe(false)
    expect(result.error).toBeNull()
    expect(callTool).not.toHaveBeenCalled()
  })

  it("is not loading before it is ready", () => {
    const result = probe(null, false, vi.fn<CallTool>(), "not-ready")
    expect(result).toMatchObject({ data: null, loading: false, error: null })
  })

  it("exposes the query's progress: failureCount, failureReason, isFetching, isPlaceholderData", () => {
    const result = probe(null, false, vi.fn<CallTool>(), "progress")
    expect(result).toMatchObject({
      failureCount: 0,
      failureReason: null,
      isFetching: false,
      isPlaceholderData: false,
    })
  })

  it("refetch calls the tool again: the retry an error state offers", async () => {
    const callTool = vi.fn<CallTool>(() => Promise.resolve({ structuredContent: { n: 2 } }))
    const result = probe(null, false, callTool, "refetch")
    expect(callTool).not.toHaveBeenCalled()
    result.refetch()
    await vi.waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("demo_data", { id: 1 })
    })
  })

  it("enabled: false gates the feed next to ready; a ready feed without data is loading", () => {
    const client = new QueryClient()
    expect(probe(null, true, vi.fn<CallTool>(), "gated", { client, enabled: false }).loading).toBe(
      false,
    )
    expect(probe(null, true, vi.fn<CallTool>(), "open", { client }).loading).toBe(true)
  })

  it("passes TanStack's options through: initialData-free placeholderData shows meanwhile", () => {
    const client = new QueryClient()
    const result = probe(null, true, vi.fn<CallTool>(), "placeholder", {
      client,
      placeholderData: { n: 0 },
    })
    expect(result).toMatchObject({ data: { n: 0 }, isPlaceholderData: true, loading: false })
  })
})

describe('useViewData initialDataMode: "seed" (the live standalone view)', () => {
  const cacheKey = (key: string) => toolQueryKey([...KEY, key], "demo_data", ARGS)

  it("seeds the feed's cache entry with the host's payload and returns it", () => {
    const client = new QueryClient()
    const result = probe({ n: 1 }, true, vi.fn<CallTool>(), "seeded", {
      client,
      initialDataMode: "seed",
      initialDataUpdatedAt: 1234,
    })
    expect(result).toMatchObject({ data: { n: 1 }, loading: false })
    expect(client.getQueryData(cacheKey("seeded"))).toEqual({ n: 1 })
    expect(client.getQueryState(cacheKey("seeded"))?.dataUpdatedAt).toBe(1234)
  })

  it("static mode never writes the cache", () => {
    const client = new QueryClient()
    probe({ n: 1 }, true, vi.fn<CallTool>(), "static", { client })
    expect(client.getQueryData(cacheKey("static"))).toBeUndefined()
  })

  it("the cached answer wins over the seed it came from once the feed answered anew", () => {
    const client = new QueryClient()
    probe({ n: 1 }, true, vi.fn<CallTool>(), "refetched", { client, initialDataMode: "seed" })
    client.setQueryData(cacheKey("refetched"), { n: 2 })
    const remounted = probe({ n: 1 }, true, vi.fn<CallTool>(), "refetched", {
      client,
      initialDataMode: "seed",
      initialDataUpdatedAt: () => 99,
    })
    expect(remounted.data, "an old payload never rolls the answer back").toEqual({ n: 2 })
    const delivered = probe({ n: 3 }, true, vi.fn<CallTool>(), "refetched", {
      client,
      initialDataMode: "seed",
    })
    expect(delivered.data, "a new delivery wins").toEqual({ n: 3 })
  })

  it("refetch over a seeded entry reads the feed again", async () => {
    const client = new QueryClient()
    const callTool = vi.fn<CallTool>(() => Promise.resolve({ structuredContent: { n: 2 } }))
    const result = probe({ n: 1 }, true, callTool, "seed-refetch", {
      client,
      initialDataMode: "seed",
    })
    result.refetch()
    await vi.waitFor(() => {
      expect(client.getQueryData(cacheKey("seed-refetch"))).toEqual({ n: 2 })
    })
    expect(callTool).toHaveBeenCalledWith("demo_data", ARGS)
  })
})
