import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { createStandaloneHostBridge, HostBridgeProvider } from "../app/host-bridge.js"
import { useToolQueryKey } from "../hooks/use-tool-query.js"
import {
  AppQueryProvider,
  queryClient,
  useCallTool,
  useToolNameInQueryKey,
} from "./query-provider.js"

/**
 * The tool transport and client of the data hooks (toolkit#176 N25, K18):
 * `AppQueryProvider`'s `callTool`, else the nearest HostBridge — so the
 * documented HostBridgeProvider mount fetches instead of idling.
 */

type Caller = ReturnType<typeof useCallTool>

function probe(tree: (node: React.ReactNode) => React.ReactNode): {
  callTool: Caller
  client: QueryClient
} {
  let callTool: Caller
  let client: QueryClient | undefined
  function Probe() {
    callTool = useCallTool()
    client = useQueryClient()
    return null
  }
  renderToStaticMarkup(tree(<Probe />))
  if (!client) throw new Error("probe did not render")
  return { callTool, client }
}

describe("useCallTool", () => {
  it("AppQueryProvider's callTool wins over a bridge", async () => {
    const explicit = vi.fn(() => Promise.resolve("explicit"))
    const bridgeCall = vi.fn(() => Promise.resolve("bridge"))
    const bridge = createStandaloneHostBridge({ callTool: bridgeCall })
    const { callTool } = probe((node) => (
      <HostBridgeProvider bridge={bridge}>
        <AppQueryProvider callTool={explicit}>{node}</AppQueryProvider>
      </HostBridgeProvider>
    ))
    await expect(callTool?.("t", { a: 1 })).resolves.toBe("explicit")
    expect(explicit).toHaveBeenCalledWith("t", { a: 1 })
    expect(bridgeCall).not.toHaveBeenCalled()
  })

  it("falls back to the nearest HostBridgeProvider's callTool (N25)", async () => {
    const bridgeCall = vi.fn(() => Promise.resolve("bridge"))
    const bridge = createStandaloneHostBridge({ callTool: bridgeCall })
    const { callTool } = probe((node) => (
      <AppQueryProvider>
        <HostBridgeProvider bridge={bridge}>{node}</HostBridgeProvider>
      </AppQueryProvider>
    ))
    await expect(callTool?.("orders_get", { id: 7 })).resolves.toBe("bridge")
    expect(bridgeCall).toHaveBeenCalledWith("orders_get", { id: 7 })
  })

  it("is undefined with neither (the query then fails with NoToolTransportError)", () => {
    const { callTool } = probe((node) => <AppQueryProvider>{node}</AppQueryProvider>)
    expect(callTool).toBeUndefined()
  })
})

describe("AppQueryProvider", () => {
  it("shares the toolkit's client by default", () => {
    expect(probe((node) => <AppQueryProvider>{node}</AppQueryProvider>).client).toBe(queryClient)
  })

  it("takes a client of its own, e.g. one per mount", () => {
    const own = new QueryClient()
    expect(probe((node) => <AppQueryProvider client={own}>{node}</AppQueryProvider>).client).toBe(
      own,
    )
  })

  it("a nested provider without client keeps its parent's, like toolNameInQueryKey", () => {
    const own = new QueryClient()
    const other = new QueryClient()
    const nested = probe((node) => (
      <AppQueryProvider client={own}>
        <AppQueryProvider callTool={vi.fn()}>{node}</AppQueryProvider>
      </AppQueryProvider>
    ))
    expect(nested.client).toBe(own)
    const replaced = probe((node) => (
      <AppQueryProvider client={own}>
        <AppQueryProvider client={other}>{node}</AppQueryProvider>
      </AppQueryProvider>
    ))
    expect(replaced.client).toBe(other)
  })

  it("a plain TanStack QueryClientProvider is not inherited: the shared client stays", () => {
    const foreign = new QueryClient()
    const { client } = probe((node) => (
      <QueryClientProvider client={foreign}>
        <AppQueryProvider>{node}</AppQueryProvider>
      </QueryClientProvider>
    ))
    expect(client).toBe(queryClient)
  })
})

describe("AppQueryProvider toolNameInQueryKey (K18)", () => {
  /** The setting and the key `useToolQueryKey` builds under `tree`. */
  function keyUnder(tree: (node: React.ReactNode) => React.ReactNode) {
    let setting: boolean | undefined
    let key: unknown[] | undefined
    function Probe() {
      setting = useToolNameInQueryKey()
      key = useToolQueryKey(["feed"], "feed_data", { id: 1 })
      return null
    }
    renderToStaticMarkup(tree(<Probe />))
    return { setting, key }
  }

  it("is off by default: the 2.x key, outside a provider too", () => {
    expect(keyUnder((node) => node)).toEqual({ setting: false, key: ["feed", { id: 1 }] })
    expect(keyUnder((node) => <AppQueryProvider>{node}</AppQueryProvider>)).toEqual({
      setting: false,
      key: ["feed", { id: 1 }],
    })
  })

  it("on, the hooks' key carries the tool name", () => {
    expect(
      keyUnder((node) => <AppQueryProvider toolNameInQueryKey>{node}</AppQueryProvider>),
    ).toEqual({ setting: true, key: ["feed", "feed_data", { id: 1 }] })
  })

  it("a nested provider keeps its parent's setting unless it sets its own", () => {
    expect(
      keyUnder((node) => (
        <AppQueryProvider toolNameInQueryKey>
          <AppQueryProvider callTool={vi.fn()}>{node}</AppQueryProvider>
        </AppQueryProvider>
      )).setting,
    ).toBe(true)
    expect(
      keyUnder((node) => (
        <AppQueryProvider toolNameInQueryKey>
          <AppQueryProvider toolNameInQueryKey={false}>{node}</AppQueryProvider>
        </AppQueryProvider>
      )).setting,
    ).toBe(false)
  })
})
