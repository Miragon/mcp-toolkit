import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  HostModelContext,
  McpUseViewContext,
  ModelContextLines,
  modelContextLine,
  useIsInsideMcpUseView,
  withModelContextLine,
} from "./model-context.js"

// The native node, made visible (it throws outside a bootstrapView mount).
vi.mock(import("mcp-use/react"), async (importOriginal) => {
  const actual = await importOriginal()
  const { createElement, Fragment } = await import("react")
  const ModelContext = ({ content, children }: { content: string; children?: ReactNode }) =>
    createElement(
      Fragment,
      null,
      createElement("meta", { "data-model-context": content }),
      children,
    )
  return { ...actual, ModelContext: ModelContext as unknown as typeof actual.ModelContext }
})

/**
 * The view's ONE model-context channel (toolkit#176 K20, N29): every line
 * the view reports joins the native mcp-use tree inside a view; outside one
 * it falls back to the bridge.
 */
describe("withModelContextLine", () => {
  it("sets, replaces and removes a line, keeping the order of first registration", () => {
    const one = withModelContextLine(new Map(), "a", "Viewing 3 incidents")
    const two = withModelContextLine(one, "b", "Filter: open")
    const replaced = withModelContextLine(two, "a", "Viewing 2 incidents")
    expect([...replaced]).toEqual([
      ["a", "Viewing 2 incidents"],
      ["b", "Filter: open"],
    ])
    expect([...withModelContextLine(replaced, "a", null)]).toEqual([["b", "Filter: open"]])
  })

  it("returns the same map when nothing changes (no re-render)", () => {
    const lines = withModelContextLine(new Map(), "a", "x")
    expect(withModelContextLine(lines, "a", "x")).toBe(lines)
    expect(withModelContextLine(lines, "missing", null)).toBe(lines)
  })
})

describe("modelContextLine", () => {
  it("a blank line is nothing to report", () => {
    expect(modelContextLine("Viewing 3 incidents")).toBe("Viewing 3 incidents")
    expect(modelContextLine("  ")).toBeNull()
    expect(modelContextLine("")).toBeNull()
    expect(modelContextLine(null)).toBeNull()
    expect(modelContextLine(undefined)).toBeNull()
  })
})

describe("HostModelContext", () => {
  it("inside a view: the native node, its children nested below it", () => {
    const html = renderToStaticMarkup(
      <McpUseViewContext.Provider value={true}>
        <HostModelContext content="Viewing 3 incidents">
          <span>board</span>
        </HostModelContext>
      </McpUseViewContext.Provider>,
    )
    expect(html).toBe('<meta data-model-context="Viewing 3 incidents"/><span>board</span>')
  })

  it("reports one line without children", () => {
    const html = renderToStaticMarkup(
      <McpUseViewContext.Provider value={true}>
        <HostModelContext content="The view could not be shown." />
      </McpUseViewContext.Provider>,
    )
    expect(html).toBe('<meta data-model-context="The view could not be shown."/>')
  })

  it("outside a view: no native node, the children render (the bridge gets the line)", () => {
    const html = renderToStaticMarkup(
      <HostModelContext content="Viewing 3 incidents">
        <span>board</span>
      </HostModelContext>,
    )
    expect(html).toBe("<span>board</span>")
  })
})

describe("ModelContextLines / useIsInsideMcpUseView", () => {
  it("renders one native node per channel line", () => {
    const lines = new Map([
      ["a", "Viewing 3 incidents"],
      ["host-bridge", "Selected: INC-7"],
    ])
    expect(renderToStaticMarkup(<ModelContextLines lines={lines} />)).toBe(
      '<meta data-model-context="Viewing 3 incidents"/><meta data-model-context="Selected: INC-7"/>',
    )
  })

  it("reports the view scope", () => {
    function Probe() {
      return <i>{String(useIsInsideMcpUseView())}</i>
    }
    expect(renderToStaticMarkup(<Probe />)).toBe("<i>false</i>")
    expect(
      renderToStaticMarkup(
        <McpUseViewContext.Provider value={true}>
          <Probe />
        </McpUseViewContext.Provider>,
      ),
    ).toBe("<i>true</i>")
  })
})
