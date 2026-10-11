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
import { ViewPlaceholder, type DescribeViewError } from "./mcp-app-view-states.js"
import { VIEW_FOCUS_TARGET } from "./use-build-mode-focus.js"
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

  it("waiting: the live region sits in no aria-busy subtree (AT may hold back the slow hint)", () => {
    expect(placeholder({ phase: "waiting", slow: true })).not.toMatch(/aria-busy="true"/)
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

  it("error without a known originating tool: no retry button, and a hint that promises none", () => {
    const html = placeholder({ phase: "error", reason: undefined, canRetry: false })
    expect(decodeEntities(html)).toContain(en.errorTitle)
    expect(html).toContain(en.errorHintNoRetry)
    expect(html).not.toContain(en.errorHint)
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<details")
    const de = placeholder(
      { phase: "error", reason: undefined, canRetry: false },
      TOOLKIT_MESSAGES.de.view,
    )
    expect(de).toContain(TOOLKIT_MESSAGES.de.view.errorHintNoRetry)
    expect(de).not.toContain(TOOLKIT_MESSAGES.de.view.errorHint)
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

  it("blocked, writing tool: a notice that the action ran, no button that would run it again (CI §9)", () => {
    // The exact input McpAppView feeds when the policy keeps a stripped
    // result of a tool reported as writing from being re-run.
    const lifecycle = resolveViewLifecycle({
      hasViewData: false,
      callStatus: "pending",
      cancelled: false,
      callErrorReason: undefined,
      recoveryFailed: false,
      recoveryBlocked: true,
      toolWrites: true,
      retryState: RETRY_IDLE,
      slow: false,
      canRetry: true,
    } satisfies ViewLifecycleInput)
    expect(lifecycle).toEqual({
      phase: "error",
      reason: undefined,
      canRetry: false,
      kind: "blocked",
    })
    const html = decodeEntities(placeholder(lifecycle))
    // Nothing failed: the info tone and a polite status, not a danger alert.
    expect(html).toContain('data-tone="info"')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('role="alert"')
    expect(html).toContain("lucide-info")
    expect(html).toContain(en.blockedTitle)
    expect(html).toContain(en.blockedHintNoRetry)
    expect(html).not.toContain(en.errorTitle)
    expect(html).not.toContain(en.errorHint)
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<details")
    const german = decodeEntities(placeholder(lifecycle, de))
    expect(german).toContain(de.blockedTitle)
    expect(german).toContain(de.blockedHintNoRetry)
    expect(german).not.toContain("<button")
  })

  it("blocked, tool not reported as writing: the notice offers to load the view, in its own words", () => {
    const lifecycle = {
      phase: "error",
      reason: undefined,
      canRetry: true,
      kind: "blocked",
    } as const
    const html = decodeEntities(placeholder(lifecycle))
    expect(html).toContain(en.blockedTitle)
    expect(html).toContain(en.blockedHint)
    expect(html).not.toContain(en.blockedHintNoRetry)
    expect(html).toContain(`${en.blockedRetry}</button>`)
    expect(html).not.toContain(`${en.retry}</button>`)
    expect(decodeEntities(placeholder(lifecycle, de))).toContain(`${de.blockedRetry}</button>`)
  })

  it("describeError tells a failure from a block, and can word either", () => {
    const seen: unknown[] = []
    const describeError: DescribeViewError = (reason, info) => {
      seen.push([reason, info])
      return info?.kind === "blocked" ? { description: "Ask the operator." } : undefined
    }
    const render = (lifecycle: Parameters<typeof ViewPlaceholder>[0]["lifecycle"]) =>
      decodeEntities(
        renderToStaticMarkup(
          <ViewPlaceholder
            lifecycle={lifecycle}
            labels={en}
            onRetry={noop}
            describeError={describeError}
          />,
        ),
      )
    const blocked = render({ phase: "error", reason: undefined, canRetry: false, kind: "blocked" })
    expect(blocked).toContain(en.blockedTitle)
    expect(blocked).toContain("Ask the operator.")
    expect(blocked).not.toContain(en.blockedHintNoRetry)
    const failed = render({ phase: "error", reason: "HTTP 503", canRetry: true })
    expect(failed).toContain(en.errorHint)
    expect(seen).toEqual([
      [undefined, { kind: "blocked" }],
      ["HTTP 503", { kind: "failed" }],
    ])
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

/**
 * CI §8 chrome button (Icon-Button, Chrome): surface, `--cd-linie` border,
 * shadow-1, blue on hover. The outline variant carries the surface, border and
 * hover; the shadow is the chrome's own and must render.
 */
function expectChromeButton(tag: string) {
  expect(attribute(tag, "data-variant")).toBe("outline")
  const classes = (attribute(tag, "class") ?? "").split(/\s+/)
  expect(classes).toEqual(
    expect.arrayContaining(["shadow-1", "border", "border-border", "bg-background"]),
  )
  expect(classes).toContain("hover:border-focus")
}

describe("ViewToolbar", () => {
  it("renders Refresh and Fullscreen as 32 px CI chrome icon buttons named by aria-label", () => {
    const html = toolbar()
    const buttons = openingTags(html, "button")
    expect(buttons.map((b) => attribute(b, "aria-label"))).toEqual([en.refresh, en.enterFullscreen])
    for (const b of buttons) {
      expect(attribute(b, "data-size")).toBe("icon-sm")
      expect(attribute(b, "type")).toBe("button")
      expectChromeButton(b)
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
    const edit = openingTags(html, "button")[0] ?? ""
    expectChromeButton(edit)
    // The focus target the builder hands the focus back to when it closes.
    expect(VIEW_FOCUS_TARGET).toBe(`[data-slot="${attribute(edit, "data-slot")}"]`)
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

  it("stamps the time of data the view re-loaded itself, in words that carry its meaning (toolkit#176 N23)", () => {
    expect(toolbar()).not.toContain('data-slot="view-data-as-of"')
    const html = toolbar({ dataAsOf: "2:32 PM" })
    const stamp = openingTags(html, "p").find(
      (t) => attribute(t, "data-slot") === "view-data-as-of",
    )
    expect(stamp).toBeDefined()
    expect(attribute(stamp ?? "", "class")).toContain("text-muted-foreground")
    // Visible text only: no hover-only tooltip, no screen-reader-only extra
    // (touch and keyboard users read exactly what everyone reads, once).
    expect(attribute(stamp ?? "", "title")).toBeUndefined()
    expect(html).not.toContain("sr-only")
    expect(html).toContain(`>${en.dataAsOf("2:32 PM")}</p>`)
    expect(en.dataAsOf("2:32 PM")).toBe("Reloaded at 2:32 PM")
    expect(toolbar({ dataAsOf: "14:32", labels: de })).toContain(`>${de.dataAsOf("14:32")}</p>`)
  })

  it("puts the stamp under the title, never beside the controls, and the controls never shrink", () => {
    const html = toolbar({ dataAsOf: "14:32", builderAvailable: true })
    const bar = openingTags(html, "div")
    // [toolbar, heading column, controls]: the stamp is the column's second line.
    expect(bar.map((t) => attribute(t, "data-slot") ?? "")).toEqual([
      "view-toolbar",
      "view-heading",
      "",
    ])
    expect(attribute(bar[1] ?? "", "class")).toBe("min-w-0 flex-1")
    expect(html).toMatch(
      /data-slot="view-heading"[^>]*><h2[^>]*>Process definitions<\/h2><p data-slot="view-data-as-of"/,
    )
    expect((attribute(bar[2] ?? "", "class") ?? "").split(" ")).toEqual(
      expect.arrayContaining(["ml-auto", "shrink-0"]),
    )
    expect(attribute(bar[2] ?? "", "class")).not.toContain("min-w-0")
    // Without a stamp the title sits straight in the row, as before.
    const plain = toolbar({ builderAvailable: true })
    expect(plain).not.toContain('data-slot="view-heading"')
    expect(plain).toMatch(/data-slot="view-toolbar"[^>]*><h2/)
    // The slot title takes the stamp under it as well.
    const slot = toolbar({ titleMode: "slot", renderTitle: (t) => t, dataAsOf: "14:32" })
    expect(slot).toMatch(/data-slot="view-heading"[^>]*><div[^>]*>Process definitions<\/div><p/)
  })

  it("keeps the bar for the stamp alone", () => {
    const bare = {
      canFullscreen: false,
      titleMode: "hide" as const,
      viewData: { ...view, _refreshParams: undefined },
    }
    expect(toolbar(bare)).toBe("")
    expect(toolbar({ ...bare, dataAsOf: "14:32" })).toContain('data-slot="view-data-as-of"')
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

  it("lists each failed step by its human title, else its step id, plus what to do", () => {
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
    expect(html).toContain(de.stepErrorsHint)
    expect(html).toContain(`${de.retry}</button>`)
  })

  it("keeps the raw step reasons under Details, never in the alert text", () => {
    const html = renderToStaticMarkup(
      <StepErrors hidden={false} errors={errors} steps={steps} labels={en} onRetry={noop} />,
    )
    const [body, details = ""] = html.split("<details")
    expect(body).not.toContain("Engine is shutting down")
    expect(body).not.toContain("timeout")
    expect(details).toMatch(/<summary[^>]*>Details<\/summary>/)
    expect(details).toContain("camunda7:incidents: [503] Engine is shutting down")
    expect(details).toContain("camunda7:kpis: timeout")
  })

  it("falls back to the step ref id and, without a refresh, offers no retry nor promises one", () => {
    const html = renderToStaticMarkup(
      <StepErrors hidden={false} errors={[{ stepId: "x", reason: "boom" }]} labels={en} />,
    )
    expect(html).toMatch(/font-mono[^"]*">x<\/span>/)
    expect(html).not.toContain("<button")
    expect(html).toContain(en.errorHintNoRetry)
    expect(html).not.toContain(en.stepErrorsHint)
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
