import { QueryClient, useQueryClient } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { createStandaloneHostBridge, HostBridgeProvider } from "../app/host-bridge.js"
import { AppQueryProvider, queryClient, useCallTool } from "./query-provider.js"

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
})
