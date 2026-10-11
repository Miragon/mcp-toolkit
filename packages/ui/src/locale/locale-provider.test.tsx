import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ListFooter } from "../components/ListFooter.js"
import {
  LocaleProvider,
  ToolkitLocaleFallback,
  useLocale,
  useToolkitLocale,
  useToolkitMessages,
  useTranslate,
  type LocaleContextValue,
} from "./locale-provider.js"
import { TOOLKIT_MESSAGES } from "./toolkit-messages.js"

/**
 * The locale contract: `LocaleProvider` sets the locale for everyone; the
 * `ToolkitLocaleFallback` McpAppView mounts with the host's locale binds ONLY
 * the toolkit's own strings and number format, so a consumer widget's
 * `useLocale()`/`useTranslate()` keep their outside-a-provider behaviour.
 */

function Probe() {
  const messages = useToolkitMessages()
  return (
    <p>
      {`locale=${useLocale()} toolkit=${useToolkitLocale()} t=${useTranslate()("k")} close=${messages.common.close}`}
    </p>
  )
}

const render = (node: ReactNode) => renderToStaticMarkup(node)

describe("ToolkitLocaleFallback", () => {
  it("binds the toolkit's strings and number locale, not useLocale/useTranslate", () => {
    expect(
      render(
        <ToolkitLocaleFallback locale="de-DE">
          <Probe />
        </ToolkitLocaleFallback>,
      ),
    ).toContain(`locale=en toolkit=de-DE t=k close=${TOOLKIT_MESSAGES.de.common.close}`)
  })

  it("yields to a LocaleProvider above or below it", () => {
    const below = render(
      <ToolkitLocaleFallback locale="de-DE">
        <LocaleProvider locale="en-GB">
          <Probe />
        </LocaleProvider>
      </ToolkitLocaleFallback>,
    )
    expect(below).toContain(
      `locale=en-GB toolkit=en-GB t=k close=${TOOLKIT_MESSAGES.en.common.close}`,
    )
    const above = render(
      <LocaleProvider locale="en">
        <ToolkitLocaleFallback locale="de-DE">
          <Probe />
        </ToolkitLocaleFallback>
      </LocaleProvider>,
    )
    expect(above).toContain(`locale=en toolkit=en t=k close=${TOOLKIT_MESSAGES.en.common.close}`)
  })

  it("keeps the defaults outside any provider", () => {
    expect(render(<Probe />)).toContain(
      `locale=en toolkit=en t=k close=${TOOLKIT_MESSAGES.en.common.close}`,
    )
  })

  it("formats toolkit counts in the language of the sentence around them", () => {
    const html = render(
      <ToolkitLocaleFallback locale="de-DE">
        <ListFooter shown={1200} total={4500} hasMore={false} onLoadMore={() => {}} />
      </ToolkitLocaleFallback>,
    )
    expect(html).toContain("Zeigt 1.200 von 4.500 Zeilen")
  })
})

describe("LocaleContextValue", () => {
  it("accepts a hand-built value without messages (the field is optional)", () => {
    const value: LocaleContextValue = { locale: "en", t: (key) => key }
    expect(value.messages).toBeUndefined()
  })
})
