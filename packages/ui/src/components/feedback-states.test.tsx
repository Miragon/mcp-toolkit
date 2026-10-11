import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CircleCheck } from "lucide-react"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "../locale/locale-provider.js"
import { TOOLKIT_MESSAGES } from "../locale/toolkit-messages.js"
import { createToast } from "../lib/toast-model.js"
import { attribute, openingTags } from "../render-scan.js"
import { EmptyState } from "./EmptyState.js"
import { ErrorState } from "./ErrorState.js"
import { ToastProvider, ToastViewport, useToast, type ToastApi } from "./Toast.js"

/**
 * Accessibility contract of the feedback primitives, pinned on their SSR
 * markup (the house render path — no jsdom): roles, live regions, accessible
 * names in the active locale, native focusable controls, nothing that steals
 * focus.
 */

const de = TOOLKIT_MESSAGES.de
const inGerman = (node: ReactNode) =>
  renderToStaticMarkup(<LocaleProvider locale="de-DE">{node}</LocaleProvider>)
const noop = (): void => {}

/** No positive tabindex and no autofocus anywhere — feedback never steals focus. */
function expectNoFocusTheft(html: string) {
  expect(html).not.toMatch(/autofocus/i)
  for (const value of html.match(/tabindex="(-?\d+)"/gi) ?? []) {
    expect(Number(/"(-?\d+)"/.exec(value)?.[1])).toBeLessThanOrEqual(0)
  }
}

describe("Toast", () => {
  const toasts = [
    createToast(1, { tone: "success", title: "Job retried." }),
    createToast(2, { tone: "danger", title: "Retry failed.", description: "Engine down (503)" }),
  ]

  it("renders ONE persistent live region: role=status, aria-live=polite, a localized name", () => {
    const html = inGerman(<ToastViewport toasts={toasts} onDismiss={noop} />)
    const [region, ...others] = openingTags(html, "div").filter((t) => /role="status"/.test(t))
    expect(others).toHaveLength(0)
    expect(attribute(region ?? "", "aria-live")).toBe("polite")
    expect(attribute(region ?? "", "aria-label")).toBe(de.common.notifications)
    // An empty stack keeps the region mounted, so the first toast is announced.
    const empty = inGerman(<ToastViewport toasts={[]} onDismiss={noop} />)
    expect(empty).toContain('role="status"')
    expect(empty).toContain('aria-live="polite"')
  })

  it("shows the status as edge + icon next to plain text, never as coloured text", () => {
    const html = inGerman(<ToastViewport toasts={toasts} onDismiss={noop} />)
    const cards = openingTags(html, "div").filter((t) => /data-slot="toast"/.test(t))
    expect(cards.map((t) => attribute(t, "data-tone"))).toEqual(["success", "danger"])
    expect(cards[0]).toMatch(/border-l-success/)
    expect(cards[1]).toMatch(/border-l-danger/)
    for (const card of cards) expect(card).not.toMatch(/\btext-(success|danger|warning|info)\b/)
    // Icons are decorative; the text carries the message.
    for (const svg of openingTags(html, "svg")) expect(attribute(svg, "aria-hidden")).toBe("true")
    expect(html).toContain("Job retried.")
    expect(html).toContain("Engine down (503)")
  })

  it("gives every toast a native close button named in the locale, and steals no focus", () => {
    const html = inGerman(<ToastViewport toasts={toasts} onDismiss={noop} />)
    const buttons = openingTags(html, "button")
    expect(buttons).toHaveLength(2)
    for (const b of buttons) {
      expect(attribute(b, "type")).toBe("button")
      expect(attribute(b, "aria-label")).toBe(de.common.dismiss)
    }
    expectNoFocusTheft(html)
  })

  it("nests idempotently: one provider, one viewport", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <ToastProvider>
          <p>body</p>
        </ToastProvider>
      </ToastProvider>,
    )
    expect(html.match(/data-slot="toast-viewport"/g)).toHaveLength(1)
    expect(html).toContain("<p>body</p>")
  })

  it("useToast outside a provider is a safe no-op", () => {
    let api: ToastApi | undefined
    function Probe() {
      api = useToast()
      return null
    }
    renderToStaticMarkup(<Probe />)
    expect(api?.show({ title: "x" })).toBe(-1)
    expect(() => api?.dismiss(1)).not.toThrow()
  })
})

describe("EmptyState", () => {
  it("is static (no live region), titles with h3 by default, hides its icon from AT", () => {
    const html = inGerman(
      <EmptyState
        icon={<CircleCheck />}
        tone="success"
        title="Keine offenen Incidents"
        description="Alles erledigt."
      />,
    )
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/)
    expect(html).toMatch(/<h3[^>]*>Keine offenen Incidents<\/h3>/)
    const iconSlot = openingTags(html, "div").find((t) => /aria-hidden="true"/.test(t))
    expect(iconSlot).toMatch(/success-ink/)
    expect(html).toContain("Alles erledigt.")
  })

  it("takes the heading level of its surface and at most two actions", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        titleAs="h2"
        title="Nothing here"
        action={<button type="button">First</button>}
        secondaryAction={<button type="button">Second</button>}
      />,
    )
    expect(html).toMatch(/<h2[^>]*>Nothing here<\/h2>/)
    expect(openingTags(html, "button")).toHaveLength(2)
    expect(renderToStaticMarkup(<EmptyState title="Bare" />)).not.toContain("<button")
  })
})

describe("ErrorState", () => {
  it("announces itself (role=alert) with a heading, the hint, details and a retry in the locale", () => {
    const html = inGerman(
      <ErrorState
        title="Die Ansicht konnte nicht geladen werden"
        description="Versuch es noch mal."
        details="[503 ProcessEngineException] Engine is shutting down"
        onRetry={noop}
      />,
    )
    const root = openingTags(html, "div")[0] ?? ""
    expect(attribute(root, "role")).toBe("alert")
    expect(attribute(root, "data-variant")).toBe("block")
    expect(html).toMatch(/<h2[^>]*>Die Ansicht konnte nicht geladen werden<\/h2>/)
    // The raw reason sits collapsed in a native disclosure (keyboard-ready).
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Details<\/summary>/)
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    const [retry] = openingTags(html, "button")
    expect(attribute(retry ?? "", "type")).toBe("button")
    expect(html).toContain(`${de.common.retry}</button>`)
    expectNoFocusTheft(html)
  })

  it("supports a quieter status role, no role at all, and the inline alert form", () => {
    const status = renderToStaticMarkup(<ErrorState title="Notice" role="status" tone="info" />)
    expect(attribute(openingTags(status, "div")[0] ?? "", "role")).toBe("status")
    const none = renderToStaticMarkup(<ErrorState title="Static" role="none" />)
    expect(attribute(openingTags(none, "div")[0] ?? "", "role")).toBeUndefined()
    const inline = renderToStaticMarkup(
      <ErrorState variant="inline" title="Partial" tone="warning" />,
    )
    expect(inline).toMatch(/<p[^>]*>Partial<\/p>/)
    expect(attribute(openingTags(inline, "div")[0] ?? "", "data-tone")).toBe("warning")
  })

  it("has no retry without onRetry, and takes custom labels", () => {
    expect(renderToStaticMarkup(<ErrorState title="x" />)).not.toContain("<button")
    const html = renderToStaticMarkup(
      <ErrorState
        title="x"
        details="raw"
        detailsLabel="Technical"
        onRetry={noop}
        retryLabel="Reload"
        actions={<a href="#help">Help</a>}
      />,
    )
    expect(html).toContain("Technical</summary>")
    expect(html).toContain("Reload</button>")
    expect(html).toContain('<a href="#help">Help</a>')
  })
})
