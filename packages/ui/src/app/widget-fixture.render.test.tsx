import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Check } from "lucide-react"
import { ListFooter } from "../components/ListFooter.js"
import { ICON_STROKE } from "../lib/icon-stroke.js"
import { LocaleProvider, useLocale } from "../locale/locale-provider.js"
import { TOOLKIT_MESSAGES } from "../locale/toolkit-messages.js"
import { useHostBridge } from "./host-bridge.js"
import { WidgetFixtureHost } from "./widget-fixture.js"

/**
 * The harness gives a widget what `McpAppView` gives it in a host, so a
 * preview in the widget playground shows what a user sees: the toolkit's
 * strings in the host locale (`globals.locale`), the host theme on the
 * bridge (`globals.theme`), the CI icon stroke and a toast stack.
 */

/** A widget made of toolkit chrome: the list footer's text follows the toolkit locale. */
function Footer() {
  return <ListFooter shown={8} total={1234} hasMore onLoadMore={() => {}} noun="Aufgaben" />
}

const render = (globals?: Record<string, unknown>, widget = Footer) =>
  renderToStaticMarkup(<WidgetFixtureHost widget={widget} globals={globals} />)

describe("WidgetFixtureHost host scope", () => {
  it("renders the toolkit's strings and number format in globals.locale", () => {
    const html = render({ locale: "de-DE" })
    expect(html).toContain("Zeigt 8 von 1.234 Aufgaben")
    expect(html).toContain("Mehr laden")
  })

  it("defaults to English and falls back to it for a blank locale", () => {
    for (const globals of [undefined, { locale: "" }, { locale: 42 }]) {
      const html = render(globals)
      expect(html).toContain("Showing 8 of 1,234 Aufgaben")
      expect(html).toContain("Load more")
    }
  })

  it("lets a LocaleProvider around the harness win over globals.locale", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="de">
        <WidgetFixtureHost widget={Footer} globals={{ locale: "en-US" }} />
      </LocaleProvider>,
    )
    expect(html).toContain("Mehr laden")
  })

  it("leaves useLocale() of the widget alone, like McpAppView does", () => {
    function ShowsLocale() {
      return <p>{useLocale()}</p>
    }
    expect(render({ locale: "de-DE" }, ShowsLocale)).toContain("<p>en</p>")
  })

  it("reports globals.theme on the bridge", () => {
    function ShowsTheme() {
      return <p>{useHostBridge().theme}</p>
    }
    expect(render({ theme: "dark" }, ShowsTheme)).toContain("<p>dark</p>")
    expect(render(undefined, ShowsTheme)).toContain("<p>light</p>")
  })

  it("draws Lucide icons at the view's stroke", () => {
    expect(render(undefined, () => <Check />)).toContain(`stroke-width="${ICON_STROKE}"`)
  })

  it("mounts a toast stack, labelled in the host locale", () => {
    const html = render({ locale: "de" })
    expect(html).toContain('data-slot="toast-viewport"')
    expect(html).toContain(`aria-label="${TOOLKIT_MESSAGES.de.common.notifications}"`)
  })
})
