import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ToolCancelledError, ToolError } from "mcp-use/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider, useLocale } from "../locale/locale-provider.js"
import { TOOLKIT_MESSAGES, type ToolkitMessages } from "../locale/toolkit-messages.js"
import { attribute, decodeEntities, openingTags, userFacingTexts } from "../render-scan.js"
import { createStandaloneHostBridge, HostBridgeProvider } from "./host-bridge.js"
import { McpAppView } from "./mcp-app-view.js"
import type { ViewData } from "./mcp-app-view-chrome.js"

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
}

const host: HostState = vi.hoisted(() => ({ tool: {}, locale: "en-US", hostContext: undefined }))

// Only the fields McpAppView reads; the casts narrow the fixtures to the hook types.
vi.mock(import("mcp-use/react"), async (importOriginal) => {
  const actual = await importOriginal()
  const useToolContext = () => host.tool
  const useHostContext = () => ({
    locale: host.locale,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    hostContext: host.hostContext,
  })
  return {
    ...actual,
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
