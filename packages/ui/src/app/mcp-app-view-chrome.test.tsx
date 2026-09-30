import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DEFAULT_LABELS, ViewPlaceholder } from "./mcp-app-view-chrome.js"

describe("ViewPlaceholder", () => {
  it("shows the loading skeleton while the rendering call is still open", () => {
    const html = renderToStaticMarkup(<ViewPlaceholder cancelled={false} labels={DEFAULT_LABELS} />)
    expect(html).toContain('data-slot="skeleton"')
    expect(html).toContain(DEFAULT_LABELS.loading)
    expect(html).not.toContain(DEFAULT_LABELS.cancelled)
  })

  it("replaces the skeleton with the cancellation notice once the host cancelled the call", () => {
    const html = renderToStaticMarkup(<ViewPlaceholder cancelled labels={DEFAULT_LABELS} />)
    expect(html).toContain(DEFAULT_LABELS.cancelled)
    expect(html).not.toContain('data-slot="skeleton"')
    expect(html).not.toContain(DEFAULT_LABELS.loading)
  })

  it("renders the consumer's label override", () => {
    const labels = { ...DEFAULT_LABELS, cancelled: "Abgebrochen." }
    const html = renderToStaticMarkup(<ViewPlaceholder cancelled labels={labels} />)
    expect(html).toContain("Abgebrochen.")
  })
})
