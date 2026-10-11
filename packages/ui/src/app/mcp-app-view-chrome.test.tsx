import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "../locale/locale-provider.js"
import { TOOLKIT_MESSAGES } from "../locale/toolkit-messages.js"
import { attribute, decodeEntities, openingTags } from "../render-scan.js"
import {
  applyBuilderCommit,
  DEFAULT_LABELS,
  fullscreenAvailable,
  StepErrors,
  toolbarControls,
  ViewToolbar,
  type ViewData,
  type ViewToolbarProps,
} from "./mcp-app-view-chrome.js"
import { ViewPlaceholder } from "./mcp-app-view-states.js"
import { resolveViewLifecycle, RETRY_IDLE, type ViewLifecycleInput } from "./view-lifecycle.js"

const en = TOOLKIT_MESSAGES.en.view
const de = TOOLKIT_MESSAGES.de.view
const noop = (): void => {}
const asyncNoop = (): Promise<void> => Promise.resolve()

const placeholder = (lifecycle: Parameters<typeof ViewPlaceholder>[0]["lifecycle"], labels = en) =>
  renderToStaticMarkup(<ViewPlaceholder lifecycle={lifecycle} labels={labels} onRetry={noop} />)

describe("ViewPlaceholder — one rendering per lifecycle phase (toolkit#176)", () => {
  it("waiting: skeleton plus a status line, no error, no retry", () => {
    const html = placeholder({ phase: "waiting", slow: false })
    expect(html).toContain('data-slot="skeleton"')
    expect(html).toMatch(/role="status"[^>]*>.*Loading view…/)
    expect(html).not.toContain(en.slowHint)
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain("<button")
  })

  it("waiting too long: the slow hint joins the status line", () => {
    const html = placeholder({ phase: "waiting", slow: true })
    expect(html).toContain(en.slowHint)
    expect(html).toContain('data-slot="slow-hint"')
    expect(html).toContain('data-slot="skeleton"')
  })

  it("error: icon, title, what to do, the raw reason under Details, a retry — and NO skeleton (K14)", () => {
    // The exact input McpAppView feeds for an isError rendering result.
    const lifecycle = resolveViewLifecycle({
      hasViewData: false,
      callStatus: "error",
      cancelled: false,
      callErrorReason: "[503 ProcessEngineException] Engine is shutting down",
      recoveryFailed: false,
      retryState: RETRY_IDLE,
      slow: true,
      canRetry: true,
    } satisfies ViewLifecycleInput)
    const html = placeholder(lifecycle)
    expect(html).not.toContain('data-slot="skeleton"')
    expect(html).not.toContain(en.loading)
    expect(html).toContain('role="alert"')
    expect(html).toContain("<svg")
    expect(decodeEntities(html)).toContain(en.errorTitle)
    expect(html).toContain(en.errorHint)
    expect(html).toMatch(/<summary[^>]*>Details<\/summary>/)
    expect(html).toContain("[503 ProcessEngineException] Engine is shutting down")
    expect(html).toContain(`${en.retry}</button>`)
  })

  it("error without a known originating tool: no retry button, the hint still says what to do", () => {
    const html = placeholder({ phase: "error", reason: undefined, canRetry: false })
    expect(decodeEntities(html)).toContain(en.errorTitle)
    expect(html).toContain(en.errorHint)
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<details")
  })

  it("error copy maps through describeError while the raw reason stays under Details", () => {
    const html = renderToStaticMarkup(
      <ViewPlaceholder
        lifecycle={{ phase: "error", reason: "HTTP 503", canRetry: true }}
        labels={en}
        onRetry={noop}
        describeError={(reason) =>
          reason?.includes("503") ? { title: "The engine is down" } : undefined
        }
      />,
    )
    expect(html).toContain("The engine is down")
    expect(html).not.toContain(en.errorTitle)
    expect(html).toContain(en.errorHint)
    expect(html).toContain("HTTP 503")
  })

  it("cancelled: the cancellation notice, no skeleton, no retry", () => {
    const html = placeholder({ phase: "cancelled" })
    expect(html).toContain(en.cancelled)
    expect(html).toContain('role="status"')
    expect(html).not.toContain('data-slot="skeleton"')
    expect(html).not.toContain("<button")
  })

  it("result: renders nothing (the view takes over)", () => {
    expect(placeholder({ phase: "result" })).toBe("")
  })

  it("renders the German catalog and consumer overrides", () => {
    expect(placeholder({ phase: "waiting", slow: true }, de)).toContain(de.slowHint)
    expect(placeholder({ phase: "cancelled" }, { ...de, cancelled: "Abgebrochen." })).toContain(
      "Abgebrochen.",
    )
  })

  it("keeps the deprecated English DEFAULT_LABELS alias", () => {
    expect(DEFAULT_LABELS).toBe(en)
  })
})

const view: ViewData = {
  title: "Process definitions",
  context: { keys: {}, stepIds: [], stepData: {}, errors: [] },
  layout: { rows: [] },
  _refreshParams: { layout: { rows: [] } },
}

function toolbar(over: Partial<ViewToolbarProps> = {}, wrap = (n: ReactNode) => n) {
  return renderToStaticMarkup(
    wrap(
      <ViewToolbar
        hidden={false}
        viewData={view}
        builderAvailable={false}
        isFullscreen={false}
        canFullscreen
        isRefreshing={false}
        labels={en}
        titleMode="show"
        titleLevel={2}
        onRefresh={asyncNoop}
        onEnterBuildMode={noop}
        onToggleFullscreen={asyncNoop}
        {...over}
      />,
    ),
  )
}

describe("ViewToolbar", () => {
  it("renders Refresh and Fullscreen as 32 px icon buttons named by aria-label", () => {
    const html = toolbar()
    const buttons = openingTags(html, "button")
    expect(buttons.map((b) => attribute(b, "aria-label"))).toEqual([en.refresh, en.enterFullscreen])
    for (const b of buttons) {
      expect(attribute(b, "data-size")).toBe("icon-sm")
      expect(attribute(b, "type")).toBe("button")
    }
    // Icons are decorative (the name is on the button) and use the dense stroke.
    for (const svg of openingTags(html, "svg")) {
      expect(attribute(svg, "aria-hidden")).toBe("true")
      expect(attribute(svg, "stroke-width")).toBe("2")
    }
    expect(html).toMatch(/data-slot="view-toolbar"[^>]*px-4/)
  })

  it("gates Fullscreen on the host's offer (toolkit#178 K22)", () => {
    expect(toolbar({ canFullscreen: false })).not.toContain(en.enterFullscreen)
    const exit = toolbar({ isFullscreen: true })
    expect(exit).toContain(`aria-label="${en.exitFullscreen}"`)
    expect(exit).toContain("lucide-minimize-2")
  })

  it("names the refresh button for its running state and disables it", () => {
    const html = toolbar({ isRefreshing: true })
    const refresh = openingTags(html, "button")[0] ?? ""
    expect(attribute(refresh, "aria-label")).toBe(en.refreshing)
    expect(refresh).toMatch(/\sdisabled=""/)
    expect(html).toContain("motion-safe:animate-spin")
  })

  it("shows the edit button with its label and a decorative pencil", () => {
    const html = toolbar({ builderAvailable: true })
    expect(html).toContain(`${en.build}</button>`)
    expect(html).toContain("lucide-pencil")
  })

  it("titles the view once: show (configurable level), hide, or slot", () => {
    expect(toolbar()).toMatch(/<h2[^>]*>Process definitions<\/h2>/)
    expect(toolbar({ titleLevel: 3 })).toMatch(/<h3[^>]*>Process definitions<\/h3>/)
    expect(toolbar({ titleMode: "hide" })).not.toMatch(/<h\d/)
    const slot = toolbar({
      titleMode: "slot",
      renderTitle: (t) => <span data-testid="slot">{`${t} (slot)`}</span>,
    })
    expect(slot).toContain("Process definitions (slot)")
    expect(slot).not.toMatch(/<h\d/)
  })

  it("renders nothing in build mode or when it would be an empty bar", () => {
    expect(toolbar({ hidden: true })).toBe("")
    expect(
      toolbar({
        canFullscreen: false,
        titleMode: "hide",
        viewData: { ...view, _refreshParams: undefined },
      }),
    ).toBe("")
  })

  it("follows the German catalog", () => {
    const html = toolbar({ labels: de })
    expect(html).toContain(`aria-label="${de.refresh}"`)
    expect(html).toContain(`aria-label="${de.enterFullscreen}"`)
  })
})

describe("toolbarControls / fullscreenAvailable", () => {
  it("derives each control from the payload and the host", () => {
    expect(
      toolbarControls({
        viewData: view,
        builderAvailable: true,
        canFullscreen: true,
        titleMode: "show",
      }),
    ).toEqual({ title: true, refresh: true, edit: true, fullscreen: true, any: true })
    expect(
      toolbarControls({
        viewData: { title: undefined, layout: undefined, _refreshParams: undefined },
        builderAvailable: true,
        canFullscreen: false,
        titleMode: "show",
      }),
    ).toEqual({ title: false, refresh: false, edit: false, fullscreen: false, any: false })
    expect(
      toolbarControls({
        viewData: { title: undefined, layout: { rows: [] }, _refreshParams: undefined },
        builderAvailable: false,
        canFullscreen: false,
        titleMode: "slot",
      }),
    ).toMatchObject({ title: true, refresh: false, any: true })
  })

  it("offers fullscreen only when the host negotiates it, keeping the exit while in it", () => {
    expect(fullscreenAvailable("inline", ["inline", "fullscreen"])).toBe(true)
    expect(fullscreenAvailable("inline", ["inline"])).toBe(false)
    expect(fullscreenAvailable("inline", [])).toBe(false)
    expect(fullscreenAvailable("fullscreen", ["inline"])).toBe(true)
    expect(fullscreenAvailable("pip", ["inline", "pip"])).toBe(false)
  })
})

describe("StepErrors — an alert with step titles and a retry", () => {
  const errors = [
    { stepId: "inc", reason: "[503] Engine is shutting down" },
    { stepId: "kpi", reason: "timeout" },
  ]
  const steps = [
    { id: "inc", step: "camunda7:incidents" },
    { id: "kpi", step: "camunda7:kpis" },
  ]

  it("lists each failed step by its human title, else its step id, with the reason", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="de">
        <StepErrors
          hidden={false}
          errors={errors}
          steps={steps}
          labels={de}
          describeStep={({ step }) => (step === "camunda7:incidents" ? "Incidents" : undefined)}
          onRetry={noop}
        />
      </LocaleProvider>,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain(de.stepErrorsTitle)
    expect(html).toMatch(/font-medium">Incidents<\/span>/)
    expect(html).toMatch(/font-mono[^"]*">camunda7:kpis<\/span>/)
    expect(html).not.toContain(">inc<")
    expect(html).toContain("[503] Engine is shutting down")
    expect(html).toContain(`${de.retry}</button>`)
  })

  it("falls back to the step ref id and offers no retry when the view cannot refresh", () => {
    const html = renderToStaticMarkup(
      <StepErrors hidden={false} errors={[{ stepId: "x", reason: "boom" }]} labels={en} />,
    )
    expect(html).toMatch(/font-mono[^"]*">x<\/span>/)
    expect(html).not.toContain("<button")
  })

  it("renders nothing without errors or in build mode", () => {
    expect(renderToStaticMarkup(<StepErrors hidden={false} errors={[]} labels={en} />)).toBe("")
    expect(renderToStaticMarkup(<StepErrors hidden errors={errors} labels={en} />)).toBe("")
  })
})

describe("applyBuilderCommit", () => {
  it("commits layout, title, context and the refresh params of the builder draft", () => {
    const layout = { rows: [{ row: [{ widget: "a:b" }] }] }
    const steps = [{ id: "s", step: "a:step" }]
    const next = applyBuilderCommit(view, { layout, keys: { k: 1 }, steps, title: "New" })
    expect(next.layout).toBe(layout)
    expect(next.title).toBe("New")
    expect(next.context).toBe(view.context)
    expect(next._refreshParams).toEqual({ keys: { k: 1 }, steps, layout, title: "New" })
  })

  it("keeps the previous title and takes a new context when given", () => {
    const context = { keys: { x: 1 }, stepIds: [], stepData: {}, errors: [] }
    const next = applyBuilderCommit(view, { layout: { rows: [] }, context })
    expect(next.title).toBe("Process definitions")
    expect(next._refreshParams?.title).toBe("Process definitions")
    expect(next.context).toBe(context)
  })
})
