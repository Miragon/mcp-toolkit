import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "../locale/locale-provider.js"
import { attribute, openingTags } from "../render-scan.js"
import { FOCUS_RING } from "../lib/focus-ring.js"
import { ListFooter, type ListFooterProps } from "./ListFooter.js"

const noop = (): void => {}

function render(props: Partial<ListFooterProps> = {}, locale = "en") {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <ListFooter shown={8} total={42} hasMore onLoadMore={noop} noun="tasks" {...props} />
    </LocaleProvider>,
  )
}

/** The text of the live region (the one `role="status"` element). */
function statusText(html: string): string | undefined {
  const match = /<p role="status"[^>]*>([\s\S]*?)<\/p>/.exec(html)
  return match?.[1]
    ?.replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

describe("ListFooter: an honest count in a polite live region", () => {
  it("puts the count in ONE status region and Load more outside it", () => {
    const html = render()
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(statusText(html)).toBe("Showing 8 of 42 tasks")
    const [button] = openingTags(html, "button")
    expect(attribute(button ?? "", "type")).toBe("button")
    expect(attribute(button ?? "", "class")).toContain(FOCUS_RING)
    expect(html.indexOf("<button")).toBeGreaterThan(html.indexOf("</p>"))
    expect(html).toContain("text-small")
    expect(html).not.toContain("text-xs")
  })

  it("says Updating… next to the count while a same-filter refetch runs", () => {
    expect(statusText(render({ refreshing: true }))).toBe("Showing 8 of 42 tasks Updating…")
    expect(statusText(render({ refreshing: true }, "de"))).toBe(
      "Zeigt 8 von 42 tasks Wird aktualisiert…",
    )
  })

  it("hides the count and Load more while the rows are the previous result", () => {
    const inFlight = render({ stale: true, refreshing: true })
    expect(statusText(inFlight)).toBe("Updating…")
    expect(inFlight).not.toContain("<button")
    expect(render({ stale: true })).toBe("")
  })

  it("renders nothing with nothing to count and nothing in flight, but says Updating… while it is", () => {
    expect(render({ total: 0 })).toBe("")
    expect(statusText(render({ total: 0, refreshing: true }))).toBe("Updating…")
  })

  it("disables Load more while a page is in flight, and takes label overrides", () => {
    const html = render({ loadingMore: true, labels: { loadingMore: "Fetching…" } })
    const [button] = openingTags(html, "button")
    expect(attribute(button ?? "", "disabled")).toBe("")
    expect(html).toContain("Fetching…</button>")
    expect(render({ hasMore: false })).not.toContain("<button")
  })
})
