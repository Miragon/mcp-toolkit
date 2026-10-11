// @vitest-environment happy-dom
import { useEffect, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { flushEffects, hookProbe, renderWithEffects, type EffectRender } from "../render-effects.js"
import { useHostBridge, type HostBridge } from "./host-bridge.js"
import { McpUseHostBridgeProvider, useViewResultSink } from "./mcp-use-host-bridge.js"
import { useHostModelContext } from "./model-context.js"

/**
 * `McpUseHostBridgeProvider`'s wiring with its effects running (toolkit#176
 * K15, K20, N29): `getWidgetData()` returns the payload the view reports it
 * shows, the bridge's `setModelContext` is one line of the view's native
 * model-context tree, and `useHostModelContext` lines come and go with their
 * component. The mcp-use view hooks are the only mock.
 */

const host = vi.hoisted(
  (): {
    tool: { status: string; toolOutput?: unknown }
    useViewState: ReturnType<typeof vi.fn> | null
  } => ({ tool: { status: "pending" }, useViewState: null }),
)

vi.mock(import("mcp-use/react"), async (importOriginal) => {
  const actual = await importOriginal()
  const { createElement } = await import("react")
  host.useViewState = vi.fn()
  const ModelContext = ({ content }: { content: string }) =>
    // Not a <meta>: React 19 hoists those into <head>.
    createElement("output", { "data-model-context": content })
  const stable = {
    dynamic: { callTool: () => Promise.resolve({}) },
    followUp: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
  }
  return {
    ...actual,
    ModelContext: ModelContext as unknown as typeof actual.ModelContext,
    useDynamicTool: (() => stable.dynamic) as unknown as typeof actual.useDynamicTool,
    useSendFollowUp: (() => stable.followUp) as unknown as typeof actual.useSendFollowUp,
    useOpenExternal: (() => stable.openExternal) as unknown as typeof actual.useOpenExternal,
    useToolContext: (() => host.tool) as unknown as typeof actual.useToolContext,
    useViewTheme: (() => "light") as unknown as typeof actual.useViewTheme,
    useHostContext: (() => ({ isAvailable: true })) as unknown as typeof actual.useHostContext,
    useViewState: host.useViewState as unknown as typeof actual.useViewState,
  }
})

const PAYLOAD = { title: "Incidents", context: { keys: {} }, layout: { rows: [] } }

/** Reports `payload` the way McpAppView reports what it shows. */
function Reporter({ payload }: { payload: unknown }) {
  const report = useViewResultSink()
  useEffect(() => {
    report?.(payload)
  }, [payload, report])
  return null
}

/** Calls the bridge's setModelContext with `text` on every change. */
function BridgeLine({ text }: { text: string }) {
  const bridge = useHostBridge()
  useEffect(() => {
    bridge.setModelContext?.(text)
  }, [bridge, text])
  return null
}

function Line({ content }: { content: string | null }) {
  useHostModelContext(content)
  return null
}

const lines = (view: EffectRender) =>
  [...view.container.querySelectorAll("[data-model-context]")].map((node) =>
    node.getAttribute("data-model-context"),
  )

let mounted: EffectRender | null = null

async function render(children: ReactNode) {
  mounted = await renderWithEffects(<McpUseHostBridgeProvider>{children}</McpUseHostBridgeProvider>)
  return mounted
}

const rerender = (view: EffectRender, children: ReactNode) =>
  view.rerender(<McpUseHostBridgeProvider>{children}</McpUseHostBridgeProvider>)

beforeEach(() => {
  host.tool = { status: "pending", toolOutput: undefined }
})

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

describe("McpUseHostBridgeProvider getWidgetData (K15)", () => {
  const bridgeProbe = () => hookProbe((): HostBridge => useHostBridge())

  it("returns the payload the view reports while the host's latch is still pending", async () => {
    const probe = bridgeProbe()
    const view = await render(<probe.Probe />)
    expect(probe.current().getWidgetData()).toBeNull()
    await rerender(
      view,
      <>
        <probe.Probe />
        <Reporter payload={PAYLOAD} />
      </>,
    )
    await flushEffects()
    expect(probe.current().getWidgetData()).toEqual(PAYLOAD)
  })

  it("prefers the reported payload over an unusable latched output (structuredContent: null)", async () => {
    host.tool = { status: "ready", toolOutput: null }
    const probe = bridgeProbe()
    const view = await render(<probe.Probe />)
    expect(probe.current().getWidgetData()).toBeNull()
    await rerender(
      view,
      <>
        <probe.Probe />
        <Reporter payload={PAYLOAD} />
      </>,
    )
    await flushEffects()
    expect(probe.current().getWidgetData()).toEqual(PAYLOAD)
  })

  it("without a report, the latched output once ready", async () => {
    host.tool = { status: "ready", toolOutput: PAYLOAD }
    const probe = bridgeProbe()
    await render(<probe.Probe />)
    expect(probe.current().getWidgetData()).toEqual(PAYLOAD)
  })
})

describe("McpUseHostBridgeProvider model context (K20, N29)", () => {
  it("the bridge's setModelContext is one native line: set, replaced, removed when blank", async () => {
    const view = await render(<BridgeLine text="Viewing 3 incidents" />)
    await flushEffects()
    expect(lines(view)).toEqual(["Viewing 3 incidents"])
    await rerender(view, <BridgeLine text="Viewing 2 incidents" />)
    await flushEffects()
    expect(lines(view), "last writer wins: still one line").toEqual(["Viewing 2 incidents"])
    await rerender(view, <BridgeLine text="" />)
    await flushEffects()
    expect(lines(view)).toEqual([])
  })

  it("never seeds the widgets' view state (N29)", async () => {
    await render(<BridgeLine text="Viewing 3 incidents" />)
    await flushEffects()
    expect(host.useViewState).not.toHaveBeenCalled()
  })

  it("useHostModelContext joins the tree on mount and leaves it on unmount or when blank", async () => {
    const view = await render(
      <>
        <Line content="Filter: open" />
        <Line content="Selected: #42" />
      </>,
    )
    expect(lines(view)).toEqual(["Filter: open", "Selected: #42"])
    await rerender(
      view,
      <>
        <Line content="Filter: open" />
        <Line content="  " />
      </>,
    )
    expect(lines(view), "a blank line is removed").toEqual(["Filter: open"])
    await rerender(view, <Line content="Filter: open" />)
    expect(lines(view)).toEqual(["Filter: open"])
    await rerender(view, null)
    expect(lines(view), "unmounted, its line is gone").toEqual([])
  })
})
