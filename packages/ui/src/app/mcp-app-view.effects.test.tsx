// @vitest-environment happy-dom
import { ToolError } from "mcp-use/react"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { createToolResultObserver, type ToolResultObserver } from "../lib/tool-result-observer.js"
import { TOOLKIT_MESSAGES } from "../locale/toolkit-messages.js"
import { advanceTimers, inAct, renderWithEffects, type EffectRender } from "../render-effects.js"
import { createStandaloneHostBridge, HostBridgeProvider } from "./host-bridge.js"
import { McpAppView } from "./mcp-app-view.js"
import type { BuilderCommit, ViewData } from "./mcp-app-view-chrome.js"

/**
 * McpAppView's lifecycle with its effects running (toolkit#176 K13, N23): the
 * view takes the document's tool-result observer by default, so a slow tool
 * on a compliant host is never re-run and a stripped result re-runs from the
 * observer's notification alone; and a payload the view re-loaded itself (a
 * recovery, a retry after a result the chat got, a refresh, an Apply from
 * the view builder) carries the data-as-of stamp and its model-context line.
 * The SSR suite
 * (`mcp-app-view.test.tsx`) pins every state's markup.
 */

const host = vi.hoisted(
  (): { tool: Record<string, unknown>; observer: ToolResultObserver | null } => ({
    tool: {},
    observer: null,
  }),
)

/** The commit the stubbed builder hands back on Apply (`toExitCommit` in the real one). */
const builder = vi.hoisted((): { commit: BuilderCommit | undefined } => ({ commit: undefined }))

// The builder's own UI is not this suite's subject: a stub hands McpAppView
// the commit Apply would, so the test drives only the view's wiring of it.
vi.mock(import("./layout-builder.js"), async (importOriginal) => {
  const actual = await importOriginal()
  const { createElement } = await import("react")
  const LayoutBuilder: typeof actual.LayoutBuilder = ({ onExit }) =>
    createElement("button", { type: "button", onClick: () => onExit?.(builder.commit) }, "Apply")
  return { ...actual, LayoutBuilder }
})

vi.mock(import("../lib/tool-result-observer.js"), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, installToolResultObserver: () => host.observer }
})

vi.mock(import("mcp-use/react"), async (importOriginal) => {
  const actual = await importOriginal()
  const context = {
    locale: "en-US",
    timeZone: "UTC",
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    hostContext: { toolInfo: { tool: { name: "render-view" } } },
  }
  const displayMode = {
    displayMode: "inline",
    availableDisplayModes: ["inline"],
    requestDisplayMode: () => Promise.resolve(),
  }
  return {
    ...actual,
    useToolContext: (() => host.tool) as unknown as typeof actual.useToolContext,
    useHostContext: (() => context) as unknown as typeof actual.useHostContext,
    useDisplayMode: (() => displayMode) as unknown as typeof actual.useDisplayMode,
  }
})

const en = TOOLKIT_MESSAGES.en.view
const NOW = Date.UTC(2026, 9, 11, 14, 32)

const VIEW: ViewData = {
  title: "Process definitions",
  context: { keys: {}, stepIds: ["kpi"], stepData: {}, errors: [] },
  layout: { rows: [{ row: [{ widget: "demo:probe" }] }] },
  _refreshParams: { layout: { rows: [] }, steps: [{ id: "kpi", step: "demo:kpis" }] },
}

/** A host channel the observer listens on, with the SEP-1865 messages a host sends. */
function fakeHost() {
  const channel = new EventTarget()
  host.observer = createToolResultObserver(channel)
  const send = (data: unknown) =>
    inAct(() => channel.dispatchEvent(new MessageEvent("message", { data })))
  const notify = (method: string, params: Record<string, unknown>) =>
    send({ jsonrpc: "2.0", method, params })
  return {
    handshake: () =>
      send({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: "2026-01-26", hostCapabilities: {} },
      }),
    toolInput: (args: Record<string, unknown>) =>
      notify("ui/notifications/tool-input", { arguments: args }),
    strippedResult: () =>
      notify("ui/notifications/tool-result", { content: [{ type: "text", text: "Rendered." }] }),
    structuredResult: (structuredContent: unknown) =>
      notify("ui/notifications/tool-result", { content: [], structuredContent }),
  }
}

type CallTool = (name: string, args: Record<string, unknown>) => Promise<unknown>

let callTool: Mock<CallTool>
let modelContext: string[]
let mounted: EffectRender | null = null

async function render() {
  const bridge = createStandaloneHostBridge({
    callTool: (name, args) => callTool(name, args),
    onModelContext: (text) => modelContext.push(text),
  })
  mounted = await renderWithEffects(
    <HostBridgeProvider bridge={bridge}>
      <McpAppView widgets={{ "demo:probe": () => <span>probe</span> }} />
    </HostBridgeProvider>,
  )
  return mounted
}

const stamp = (view: EffectRender) =>
  view.container.querySelector('[data-slot="view-data-as-of"]')?.textContent ?? null

const button = (view: EffectRender, name: string): HTMLElement => {
  const found = [...view.container.querySelectorAll("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  )
  if (!found) throw new Error(`no button "${name}"`)
  return found
}

const click = (target: HTMLElement) => inAct(() => target.click())

const toolCalls = (name: string) => callTool.mock.calls.filter(([called]) => called === name)

beforeEach(() => {
  builder.commit = undefined
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  host.tool = { status: "pending", toolInput: { id: 7 }, toolOutput: undefined }
  host.observer = null
  modelContext = []
  callTool = vi.fn<CallTool>(() => Promise.resolve({ structuredContent: VIEW }))
})

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
  vi.useRealTimers()
})

describe("McpAppView recovery with its effects (K13)", () => {
  it("keep: a delivered view is never re-run", async () => {
    const channel = fakeHost()
    await channel.handshake()
    await channel.toolInput({ id: 7 })
    await channel.structuredResult(VIEW)
    host.tool = { status: "ready", toolInput: { id: 7 }, toolOutput: VIEW }
    const view = await render()
    await advanceTimers(vi.advanceTimersByTime, 10_000)
    expect(callTool).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-slot="view-toolbar"]')).not.toBeNull()
    expect(stamp(view), "the host's own payload").toBeNull()
  })

  it("slow: a compliant host still answering keeps the view waiting, never re-run", async () => {
    const channel = fakeHost()
    await channel.handshake()
    await channel.toolInput({ id: 7 })
    const view = await render()
    await advanceTimers(vi.advanceTimersByTime, 2_501)
    await advanceTimers(vi.advanceTimersByTime, 10_000)
    expect(callTool).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
  })

  it("strip: the observer's notification alone re-runs the call once, with its complete input, and stamps it", async () => {
    const channel = fakeHost()
    await channel.handshake()
    const view = await render()
    await channel.toolInput({ id: 7, page: 2 })
    await channel.strippedResult()
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(callTool).toHaveBeenCalledWith("render-view", { id: 7, page: 2 })
    expect(stamp(view)).toBe("Reloaded at 2:32 PM")
    expect(modelContext.at(-1)).toMatch(
      /^The view of render-view re-ran the tool at 2026-10-11T14:32:00\.000Z because the host did not pass/,
    )
  })
})

describe("McpAppView data-as-of stamp on a user's re-run (N23)", () => {
  it("a retry after a failed recovery is stamped: the chat answered from the original call", async () => {
    const channel = fakeHost()
    await channel.handshake()
    callTool.mockRejectedValueOnce(new Error("503"))
    const view = await render()
    await channel.toolInput({ id: 7 })
    await channel.strippedResult()
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull()
    vi.setSystemTime(NOW + 60_000)
    await click(button(view, en.retry))
    expect(toolCalls("render-view")).toHaveLength(2)
    expect(stamp(view)).toBe("Reloaded at 2:33 PM")
    expect(modelContext.at(-1)).toMatch(/re-ran the tool at 2026-10-11T14:33:00\.000Z/)
  })

  it("a retry after a failed call is not: the model never had figures", async () => {
    host.tool = {
      status: "error",
      error: new ToolError({ isError: true, content: [{ type: "text", text: "[503] down" }] }),
      toolInput: { id: 7 },
    }
    const view = await render()
    await click(button(view, en.retry))
    expect(toolCalls("render-view")).toHaveLength(1)
    expect(view.container.querySelector('[data-slot="view-toolbar"]')).not.toBeNull()
    expect(stamp(view)).toBeNull()
    expect(modelContext.some((line) => line.includes("re-ran the tool"))).toBe(false)
  })

  it("a refresh is stamped and told to the model as the user's refresh", async () => {
    host.tool = { status: "ready", toolInput: { id: 7 }, toolOutput: VIEW }
    const view = await render()
    expect(stamp(view)).toBeNull()
    vi.setSystemTime(NOW + 38 * 60_000)
    await click(button(view, en.refresh))
    expect(toolCalls("refresh-view")).toEqual([["refresh-view", VIEW._refreshParams]])
    expect(stamp(view)).toBe("Reloaded at 3:10 PM")
    expect(modelContext.at(-1)).toBe(
      "The view of render-view was refreshed by the user at 2026-10-11T15:10:00.000Z; its figures " +
        "are live as of then and can differ from the original result.",
    )
  })
})

describe("McpAppView data-as-of stamp on a builder Apply (N23)", () => {
  /** The view as a builder-enabled server delivers it. */
  const EDITABLE: ViewData = { ...VIEW, builderAvailable: true }
  /** The builder's live context: its catalogue call ran the steps again. */
  const LIVE: ViewData["context"] = {
    keys: { region: "north" },
    stepIds: ["kpi"],
    stepData: {
      kpi: { data: { open: 12 }, keys: {}, _app: "demo", _dataType: "demo:kpis" },
    },
    errors: [],
  }
  const edit = async (view: EffectRender, commit: BuilderCommit) => {
    builder.commit = commit
    await click(button(view, en.build))
    await click(button(view, "Apply"))
  }

  it("an Apply with the builder's live figures is stamped and told to the model as the user's edit", async () => {
    host.tool = { status: "ready", toolInput: { id: 7 }, toolOutput: EDITABLE }
    const view = await render()
    expect(stamp(view), "the host's own payload").toBeNull()
    vi.setSystemTime(NOW + 5 * 60_000)
    await edit(view, { layout: EDITABLE.layout!, context: LIVE })
    expect(stamp(view)).toBe("Reloaded at 2:37 PM")
    expect(modelContext.at(-1)).toBe(
      "The view of render-view was edited by the user in the view builder, which loaded its data " +
        "again at 2026-10-11T14:37:00.000Z; its figures are live as of then and can differ from " +
        "the original result.",
    )
  })

  it("an Apply after a refresh moves the stamp to the builder's figures", async () => {
    host.tool = { status: "ready", toolInput: { id: 7 }, toolOutput: EDITABLE }
    callTool.mockResolvedValue({ structuredContent: EDITABLE })
    const view = await render()
    vi.setSystemTime(NOW + 60_000)
    await click(button(view, en.refresh))
    expect(stamp(view)).toBe("Reloaded at 2:33 PM")
    vi.setSystemTime(NOW + 5 * 60_000)
    await edit(view, { layout: EDITABLE.layout!, context: LIVE })
    expect(stamp(view), "the stamp of the refresh above the builder's figures").toBe(
      "Reloaded at 2:37 PM",
    )
  })

  it("an Apply without a context keeps the shown figures, and with them their stamp", async () => {
    host.tool = { status: "ready", toolInput: { id: 7 }, toolOutput: EDITABLE }
    const view = await render()
    vi.setSystemTime(NOW + 5 * 60_000)
    await edit(view, { layout: EDITABLE.layout!, title: "Renamed" })
    expect(view.container.textContent).toContain("Renamed")
    expect(stamp(view)).toBeNull()
    expect(modelContext.some((line) => line.includes("view builder"))).toBe(false)
  })
})
