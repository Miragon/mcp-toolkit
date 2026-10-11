import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, useQueryClient } from "@tanstack/react-query"
import { ToolCancelledError, ToolError } from "mcp-use/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useToolQueryKey } from "../hooks/use-tool-query.js"
import { AppQueryProvider, queryClient } from "../providers/query-provider.js"
import type {
  ToolResultRecoveryOptions,
  ToolResultRecoveryState,
} from "../hooks/use-tool-result-recovery.js"
import { LocaleProvider, useLocale } from "../locale/locale-provider.js"
import { TOOLKIT_MESSAGES, type ToolkitMessages } from "../locale/toolkit-messages.js"
import { attribute, decodeEntities, openingTags, userFacingTexts } from "../render-scan.js"
import { createStandaloneHostBridge, HostBridgeProvider } from "./host-bridge.js"
import { McpAppView } from "./mcp-app-view.js"
import type { ViewData } from "./mcp-app-view-chrome.js"
import { McpUseViewContext } from "./model-context.js"

/**
 * McpAppView's wiring, rendered through its real hooks (SSR, the house path):
 * `useToolContext().status` → `useViewLifecycle` → the placeholder, the
 * locale fallback, and the provider order behind the Lucide stroke. The
 * mcp-use view hooks are the only mock; every phase here resolves on the
 * first render, so no effect has to run. Guards toolkit#176 K14: an isError
 * result must never fall back to the endless skeleton.
 */

/** What the mocked mcp-use view hooks return on the next render. */
interface HostState {
  tool: Record<string, unknown>
  locale: string
  hostContext: Record<string, unknown> | undefined
  /** Replaces the recovery's state (it settles in effects, which SSR never runs). */
  recovery: ToolResultRecoveryState<unknown> | null
}

const host: HostState = vi.hoisted(() => ({
  tool: {},
  locale: "en-US",
  hostContext: undefined,
  recovery: null,
}))

// The real hook always runs (hook order stays fixed); a fixture state stands
// in for what its controller decides once the stripped result arrived.
vi.mock(import("../hooks/use-tool-result-recovery.js"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useToolResultRecovery: <T,>(options: ToolResultRecoveryOptions) => {
      const state = actual.useToolResultRecovery<T>(options)
      return (host.recovery as ToolResultRecoveryState<T> | null) ?? state
    },
  }
})

// Only the fields McpAppView reads; the casts narrow the fixtures to the hook types.
vi.mock(import("mcp-use/react"), async (importOriginal) => {
  const actual = await importOriginal()
  const useToolContext = () => host.tool
  const useHostContext = () => ({
    locale: host.locale,
    timeZone: "UTC",
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    hostContext: host.hostContext,
  })
  // The view's model-context node, made visible: a <meta> whose `content`
  // the scans below never read as user-facing text.
  const { createElement } = await import("react")
  const ModelContext = ({ content }: { content: string }) =>
    createElement("meta", { "data-model-context": content })
  return {
    ...actual,
    ModelContext: ModelContext as unknown as typeof actual.ModelContext,
    useToolContext: useToolContext as unknown as typeof actual.useToolContext,
    useHostContext: useHostContext as unknown as typeof actual.useHostContext,
    useDisplayMode: () => ({
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
      requestDisplayMode: () => Promise.resolve(),
    }),
  }
})

// No toast can be raised during SSR, so the provider renders one fixture
// toast where McpAppView mounts it: the stroke its icons inherit is the
// stroke a real toast stack gets.
vi.mock(import("../components/Toast.js"), async (importOriginal) => {
  const actual = await importOriginal()
  const { createElement, Fragment } = await import("react")
  const { createToast } = await import("../lib/toast-model.js")
  const fixture = [createToast(1, { tone: "danger", title: "Fixture toast" })]
  return {
    ...actual,
    ToastProvider: ({ children }: { children: ReactNode }) =>
      createElement(
        Fragment,
        null,
        children,
        createElement(actual.ToastViewport, { toasts: fixture, onDismiss: () => {} }),
      ),
  }
})

const en = TOOLKIT_MESSAGES.en.view
const de = TOOLKIT_MESSAGES.de.view
const KNOWN_TOOL = { toolInfo: { tool: { name: "render-view" } } }
const REASON = "[503 ProcessEngineException] Engine is shutting down"

const bridge = createStandaloneHostBridge({ callTool: () => Promise.resolve({}) })

/** A consumer widget that prints the locale it reads. */
function LocaleProbe() {
  return <span data-testid="probe">widget-locale:{useLocale()}</span>
}

const VIEW: ViewData = {
  title: "Process definitions",
  context: {
    keys: {},
    stepIds: ["kpi"],
    stepData: {},
    errors: [{ stepId: "kpi", reason: "timeout" }],
  },
  layout: { rows: [{ row: [{ widget: "demo:probe" }] }] },
  _refreshParams: { layout: { rows: [] }, steps: [{ id: "kpi", step: "demo:kpis" }] },
}

/** Render McpAppView; `view` is the shell, `toasts` the toast stack after it. */
function render(wrap: (node: ReactNode) => ReactNode = (node) => node) {
  const html = renderToStaticMarkup(
    <HostBridgeProvider bridge={bridge}>
      {wrap(<McpAppView widgets={{ "demo:probe": LocaleProbe }} />)}
    </HostBridgeProvider>,
  )
  const at = html.indexOf('<div data-slot="toast-viewport"')
  expect(at, "the fixture toast stack renders").toBeGreaterThan(0)
  return { html, view: html.slice(0, at), toasts: html.slice(at) }
}

const strokes = (html: string) => openingTags(html, "svg").map((t) => attribute(t, "stroke-width"))

const toolError = (text: string) =>
  new ToolError({ isError: true, content: [{ type: "text", text }] })

beforeEach(() => {
  host.tool = { status: "pending", toolInput: undefined, toolOutput: undefined }
  host.locale = "en-US"
  host.hostContext = KNOWN_TOOL
  host.recovery = null
})

/** A tool the host names, with its annotations (SEP-1865 `toolInfo.tool`). */
const toolInfo = (name: string, annotations: Record<string, unknown>) => ({
  toolInfo: { tool: { name, annotations } },
})

/** The recovery's state when a needed recovery did not run. */
const blockedBy = (reason: "policy" | "no-tool"): ToolResultRecoveryState<unknown> => ({
  data: null,
  failed: false,
  blocked: reason,
  recoveredAt: null,
  args: null,
})

describe("McpAppView lifecycle wiring (toolkit#176)", () => {
  it("an isError rendering result shows the error state with a retry, never the skeleton (K14)", () => {
    host.tool = { status: "error", error: toolError(REASON), toolInput: {} }
    const { view } = render()
    expect(view).not.toContain('data-slot="skeleton"')
    expect(view).not.toContain(en.loading)
    expect(view).toContain('role="alert"')
    expect(decodeEntities(view)).toContain(en.errorTitle)
    expect(view).toContain(en.errorHint)
    expect(view).toContain(`${en.retry}</button>`)
    // The raw reason informs under Details; it is not the message.
    expect(view).toMatch(/<details[^>]*><summary[^>]*>Details<\/summary><pre[^>]*>\[503/)
  })

  it("without the originating tool the error offers no retry and promises none", () => {
    host.tool = { status: "error", error: toolError(REASON), toolInput: {} }
    host.hostContext = undefined
    const { view } = render()
    expect(view).toContain('role="alert"')
    expect(view).not.toContain("<button")
    expect(view).toContain(en.errorHintNoRetry)
    expect(view).not.toContain(en.errorHint)
  })

  it("a latched result without a view on such a host is an error, not an endless wait", () => {
    host.tool = { status: "ready", toolOutput: { notAView: true }, toolInput: {} }
    host.hostContext = undefined
    const { view } = render()
    expect(view).not.toContain('data-slot="skeleton"')
    expect(view).toContain('role="alert"')
    expect(view).toContain(en.errorHintNoRetry)
  })

  it("a stripped result of a writing tool the policy kept: the notice, never a button that writes again", () => {
    // claude.ai strips the result of a "start and show" tool; "auto" never
    // re-runs a tool reported as writing (readOnlyHint: false).
    host.hostContext = toolInfo("start_and_show", { readOnlyHint: false })
    host.recovery = blockedBy("policy")
    const view = decodeEntities(render().view)
    expect(view).not.toContain('data-slot="skeleton"')
    expect(view).toContain('data-tone="info"')
    expect(view).toContain(en.blockedTitle)
    expect(view).toContain(en.blockedHintNoRetry)
    expect(view).not.toContain(en.errorTitle)
    expect(view).not.toContain("<button")
    // The same for destructiveHint: true.
    host.hostContext = toolInfo("start_and_show", { readOnlyHint: true, destructiveHint: true })
    expect(render().view).not.toContain("<button")
  })

  it("a tool not reported as writing that a stricter policy kept: the notice offers to load the view", () => {
    host.hostContext = toolInfo("show_list", {})
    host.recovery = blockedBy("policy")
    const view = decodeEntities(render().view)
    expect(view).toContain(en.blockedTitle)
    expect(view).toContain(en.blockedHint)
    expect(view).toContain(`${en.blockedRetry}</button>`)
  })

  it("a recovery blocked for want of a tool name stays the plain error without retry", () => {
    host.hostContext = undefined
    host.recovery = blockedBy("no-tool")
    const view = decodeEntities(render().view)
    expect(view).toContain(en.errorTitle)
    expect(view).toContain(en.errorHintNoRetry)
    expect(view).not.toContain(en.blockedTitle)
    expect(view).not.toContain("<button")
  })

  it("a failed recovery stays the plain error with its retry", () => {
    host.recovery = { ...blockedBy("policy"), blocked: null, failed: true }
    const view = decodeEntities(render().view)
    expect(view).toContain(en.errorTitle)
    expect(view).toContain(`${en.retry}</button>`)
  })

  it("a payload the view re-loaded itself carries the stamp under its title, in the host's words (N23)", () => {
    const recoveredAt = Date.UTC(2026, 9, 11, 14, 32)
    host.recovery = { data: VIEW, failed: false, blocked: null, recoveredAt, args: {} }
    const view = decodeEntities(render().view)
    expect(view).toContain(
      `<p data-slot="view-data-as-of" class="text-muted-foreground truncate text-sm">Reloaded at 2:32 PM</p>`,
    )
    host.locale = "de-DE"
    expect(decodeEntities(render().view)).toContain(">Neu geladen um 14:32 Uhr</p>")
    // A host-delivered payload carries none.
    host.recovery = null
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    expect(render().view).not.toContain('data-slot="view-data-as-of"')
  })

  it("the stamp's time speaks the language of its words, not the host's other one", () => {
    const recoveredAt = Date.UTC(2026, 9, 11, 14, 32)
    host.recovery = { data: VIEW, failed: false, blocked: null, recoveredAt, args: {} }
    // A German profile (LocaleProvider) on an en-US host: never "4:32 PM Uhr".
    host.locale = "en-US"
    const german = render((node) => <LocaleProvider locale="de">{node}</LocaleProvider>)
    expect(decodeEntities(german.view)).toContain(">Neu geladen um 14:32 Uhr</p>")
    // The host's region of the same language stays: en-GB keeps its 24-hour clock.
    host.locale = "en-GB"
    const british = render((node) => <LocaleProvider locale="en">{node}</LocaleProvider>)
    expect(decodeEntities(british.view)).toContain(">Reloaded at 14:32</p>")
  })

  it("a host cancellation shows the cancelled notice, no skeleton and no retry", () => {
    host.tool = { status: "error", error: new ToolCancelledError("user"), toolInput: {} }
    const { view } = render()
    expect(view).toContain(en.cancelled)
    expect(view).not.toContain('role="alert"')
    expect(view).not.toContain('data-slot="skeleton"')
    expect(view).not.toContain("<button")
  })

  it("an open call waits: skeleton and status line in a stable, focusable frame", () => {
    const { view } = render()
    expect(view).toContain('data-slot="skeleton"')
    expect(view).toMatch(/role="status"[^>]*>.*Loading view…/)
    const frame = openingTags(view, "div")[0] ?? ""
    expect(attribute(frame, "data-slot")).toBe("mcp-app-view")
    expect(attribute(frame, "tabindex")).toBe("-1")
  })

  it("a complete payload renders the view: toolbar, step alert, widgets", () => {
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    const { view } = render()
    expect(view).not.toContain('data-slot="skeleton"')
    expect(view).toContain('data-slot="view-toolbar"')
    expect(view).toContain(`aria-label="${en.refresh}"`)
    expect(decodeEntities(view)).toContain(en.stepErrorsTitle)
    expect(view).toContain("widget-locale:")
    // The frame stays the same element across placeholder and view.
    expect(attribute(openingTags(view, "div")[0] ?? "", "data-slot")).toBe("mcp-app-view")
  })
})

describe("McpAppView toolNameInQueryKey (toolkit#176 K18)", () => {
  /** A widget that prints the cache key its data hooks would use. */
  function KeyProbe() {
    return <output>{JSON.stringify(useToolQueryKey(["feed"], "feed_data", { id: 1 }))}</output>
  }
  const keyIn = (props: { toolNameInQueryKey?: boolean }) =>
    decodeEntities(
      renderToStaticMarkup(
        <HostBridgeProvider bridge={bridge}>
          <McpAppView widgets={{ "demo:probe": KeyProbe }} {...props} />
        </HostBridgeProvider>,
      ),
    ).match(/<output>(.*?)<\/output>/)?.[1]

  it("hands the setting to the widgets' data hooks; omitted, the 2.x key stays", () => {
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    expect(keyIn({ toolNameInQueryKey: true })).toBe('["feed","feed_data",{"id":1}]')
    expect(keyIn({})).toBe('["feed",{"id":1}]')
  })
})

describe("McpAppView query client", () => {
  /** A widget that tells which client its data hooks use. */
  function clientIn(wrap: (node: ReactNode) => ReactNode) {
    const clients: QueryClient[] = []
    function ClientProbe() {
      clients.push(useQueryClient())
      return null
    }
    renderToStaticMarkup(
      <HostBridgeProvider bridge={bridge}>
        {wrap(<McpAppView widgets={{ "demo:probe": ClientProbe }} />)}
      </HostBridgeProvider>,
    )
    expect(clients.length, "the widget rendered").toBeGreaterThan(0)
    return clients[0]
  }

  it("its widgets fetch through an enclosing AppQueryProvider's client", () => {
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    const perMount = new QueryClient()
    expect(clientIn((node) => <AppQueryProvider client={perMount}>{node}</AppQueryProvider>)).toBe(
      perMount,
    )
    expect(
      clientIn((node) => node),
      "else the toolkit's shared client",
    ).toBe(queryClient)
  })
})

describe("McpAppView model context (toolkit#176 K20)", () => {
  /** Inside an mcp-use view, where the view's line joins the native tree. */
  const inView = (node: ReactNode) => (
    <McpUseViewContext.Provider value={true}>{node}</McpUseViewContext.Provider>
  )
  const contexts = (html: string) =>
    openingTags(html, "meta").map((tag) =>
      decodeEntities(attribute(tag, "data-model-context") ?? ""),
    )

  it("an error the user sees instead of the view reaches the model: what failed, and that it is an error", () => {
    host.tool = { status: "error", error: toolError(REASON), toolInput: {} }
    const { view } = render(inView)
    expect(contexts(view)).toEqual([
      `The view of render-view could not be shown (reason: ${REASON}). ` +
        "The user sees an error message with a retry button instead of the view.",
    ])
  })

  it("a blocked recovery tells the model the tool ran and must not be re-run to show the view", () => {
    host.hostContext = toolInfo("start_and_show", { readOnlyHint: false })
    host.recovery = blockedBy("policy")
    expect(contexts(render(inView).view)).toEqual([
      "The view of start_and_show is not shown: start_and_show ran, but the host did not pass its " +
        "result to the view, and the view did not re-run it. The user sees a note to ask in the chat " +
        "for the current state instead of the view. Do not re-run start_and_show just to show the view.",
    ])
  })

  it("a cancelled call says so", () => {
    host.tool = { status: "error", error: new ToolCancelledError("user"), toolInput: {} }
    expect(contexts(render(inView).view)).toEqual([
      "The view of render-view was cancelled before it rendered. The user sees a note that the call was cancelled.",
    ])
  })

  it("failed data steps of a shown view are reported; a waiting view reports nothing", () => {
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    expect(contexts(render(inView).view)).toEqual([
      "The view of render-view is shown, but some of its data could not be loaded (kpi: timeout). " +
        "The user sees an alert with a retry button.",
    ])
    host.tool = { status: "pending", toolInput: undefined, toolOutput: undefined }
    expect(contexts(render(inView).view)).toEqual([])
  })
})

describe("McpAppView locale", () => {
  it("speaks the host's language in its own chrome", () => {
    host.locale = "de-DE"
    host.tool = { status: "error", error: toolError(REASON), toolInput: {} }
    const { view, toasts } = render()
    expect(decodeEntities(view)).toContain(de.errorTitle)
    expect(view).toContain(`${de.retry}</button>`)
    // The toast stack below the view speaks it too (its close buttons).
    expect(toasts).toContain(`aria-label="${TOOLKIT_MESSAGES.de.common.dismiss}"`)
  })

  it("leaves useLocale() of consumer widgets alone (no LocaleProvider of its own)", () => {
    host.locale = "de-DE"
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    const { view } = render()
    expect(view).toContain(`aria-label="${de.refresh}"`)
    expect(view).toContain("widget-locale:en<")
  })

  it("follows a consumer LocaleProvider over the host's locale", () => {
    host.locale = "de-DE"
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    const { view } = render((node) => <LocaleProvider locale="en">{node}</LocaleProvider>)
    expect(view).toContain(`aria-label="${en.refresh}"`)
    expect(view).toContain("widget-locale:en<")
  })

  it("renders no English and no raw reason as message text under a German host", () => {
    host.locale = "de-DE"
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    const catalog = catalogStrings(TOOLKIT_MESSAGES.de)
    const fixtures = [
      VIEW.title ?? "",
      "demo:kpis",
      "kpi",
      "timeout",
      "Fixture toast",
      "widget-locale:en",
    ]
    const { html } = render()
    const leaks = userFacingTexts(html)
      .map(({ source, value }) => {
        let rest = value
        for (const known of [...catalog, ...fixtures]) rest = rest.split(known).join(" ")
        return { source, value, rest: rest.trim() }
      })
      .filter(({ rest }) => /\p{L}/u.test(rest))
    expect(leaks).toEqual([])
  })
})

describe("McpAppView icon stroke (CI §11)", () => {
  it("draws the view's icons and its toast stack at 2.5", () => {
    host.tool = { status: "error", error: toolError(REASON), toolInput: {} }
    const { view, toasts } = render()
    expect(strokes(view).length).toBeGreaterThan(0)
    expect(new Set(strokes(view))).toEqual(new Set(["2.5"]))
    expect(strokes(toasts).length).toBeGreaterThan(0)
    expect(new Set(strokes(toasts))).toEqual(new Set(["2.5"]))
  })

  it("narrows the dense toolbar to 2", () => {
    host.tool = { status: "ready", toolOutput: VIEW, toolInput: {} }
    const { view } = render()
    const [toolbar] = view.split('data-slot="view-toolbar"').slice(1)
    const bar = (toolbar ?? "").split("</div></div>")[0] ?? ""
    expect(strokes(bar).length).toBeGreaterThan(0)
    expect(new Set(strokes(bar))).toEqual(new Set(["2"]))
  })
})

/** Every string value of a catalog (parametrised messages are skipped), longest first. */
function catalogStrings(messages: ToolkitMessages): string[] {
  return Object.values(messages)
    .flatMap((section) => Object.values(section as Record<string, unknown>))
    .filter((v): v is string => typeof v === "string")
    .sort((a, b) => b.length - a.length)
}
