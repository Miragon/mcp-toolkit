import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { LocaleProvider } from "../locale/locale-provider.js"
import { TOOLKIT_MESSAGES } from "../locale/toolkit-messages.js"
import { decodeEntities } from "../render-scan.js"
import {
  buildPipelineContext,
  RenderedWidget,
  resetKeysChanged,
  WidgetCrashFallback,
  WidgetErrorBoundary,
  WidgetRenderer,
} from "./widget-renderer.js"

const de = TOOLKIT_MESSAGES.de.renderer

function Hello({ keys }: WidgetProps) {
  return <p>hello {typeof keys.who === "string" ? keys.who : ""}</p>
}

describe("WidgetRenderer fallbacks (toolkit#176 N24, U19)", () => {
  it("an unknown widget id renders a localized 'not available' note instead of vanishing", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="de">
        <WidgetRenderer
          layout={{ rows: [{ row: [{ widget: "demo:hello" }, { widget: "demo:gone" }] }] }}
          keys={{ who: "ada" }}
          errors={[]}
          widgets={{ "demo:hello": Hello }}
        />
      </LocaleProvider>,
    )
    expect(html).toContain("hello ada")
    expect(decodeEntities(html)).toContain(de.widgetUnavailable)
    expect(html).toContain('data-widget-id="demo:gone"')
  })

  it("the crash fallback names what happened, keeps the raw error under Details, offers a retry", () => {
    const html = decodeEntities(
      renderToStaticMarkup(
        <LocaleProvider locale="de">
          <WidgetCrashFallback widgetId="demo:x" error={new Error("kaputt")} onRetry={() => {}} />
        </LocaleProvider>,
      ),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain(de.widgetCrashed)
    expect(html).toContain("demo:x: kaputt")
    expect(html).toContain(`${TOOLKIT_MESSAGES.de.common.retry}</button>`)
  })

  it("the builder's empty-context hint is localized", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="de">
        <RenderedWidget
          widget={Hello}
          widgetId="demo:hello"
          props={{ keys: {}, context: { steps: {}, keys: {}, errors: [] } }}
          showEmptyHint
        />
      </LocaleProvider>,
    )
    expect(html).toContain(TOOLKIT_MESSAGES.de.renderer.noDataYet)
  })
})

describe("WidgetErrorBoundary reset", () => {
  it("resets a latched crash when its reset keys change, not on an unrelated update", () => {
    const keysA = [{ a: 1 }]
    const boundary = new WidgetErrorBoundary({ widgetId: "w", children: null, resetKeys: keysA })
    const setState = vi.fn()
    boundary.setState = setState
    boundary.state = { error: new Error("boom") }

    // Same keys (identity) → stays failed.
    boundary.componentDidUpdate({ resetKeys: keysA })
    expect(setState).not.toHaveBeenCalled()

    // New data → a fresh render.
    boundary.componentDidUpdate({ resetKeys: [{ a: 1 }] })
    expect(setState).toHaveBeenCalledWith({ error: null })
  })

  it("does nothing while healthy", () => {
    const boundary = new WidgetErrorBoundary({ widgetId: "w", children: null, resetKeys: [1] })
    const setState = vi.fn()
    boundary.setState = setState
    boundary.componentDidUpdate({ resetKeys: [2] })
    expect(setState).not.toHaveBeenCalled()
  })

  it("its retry clears the error", () => {
    const boundary = new WidgetErrorBoundary({ widgetId: "w", children: null })
    const setState = vi.fn()
    boundary.setState = setState
    boundary.reset()
    expect(setState).toHaveBeenCalledWith({ error: null })
  })
})

describe("resetKeysChanged", () => {
  it("compares by length and entry identity", () => {
    const a = { x: 1 }
    expect(resetKeysChanged([a], [a])).toBe(false)
    expect(resetKeysChanged(undefined, undefined)).toBe(false)
    const same = [a]
    expect(resetKeysChanged(same, same)).toBe(false)
    expect(resetKeysChanged([a], [{ x: 1 }])).toBe(true)
    expect(resetKeysChanged([a], [a, a])).toBe(true)
    expect(resetKeysChanged(undefined, [a])).toBe(true)
    expect(resetKeysChanged([a], undefined)).toBe(true)
    expect(resetKeysChanged([Number.NaN], [Number.NaN])).toBe(false)
  })
})

describe("buildPipelineContext", () => {
  it("tags each step with its id and passes keys and errors through", () => {
    const keys = { k: 1 }
    const errors = [{ stepId: "s2", reason: "x" }]
    const ctx = buildPipelineContext(
      keys,
      { s1: { data: 1, keys: {}, _app: "a", _dataType: "a:t" } },
      errors,
    )
    expect(ctx.steps.s1).toEqual({ data: 1, keys: {}, _app: "a", _dataType: "a:t", _step: "s1" })
    expect(ctx.keys).toBe(keys)
    expect(ctx.errors).toBe(errors)
    expect(buildPipelineContext(keys, undefined, []).steps).toEqual({})
  })
})
