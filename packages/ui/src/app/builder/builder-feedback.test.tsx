import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "../../locale/locale-provider.js"
import { TOOLKIT_MESSAGES } from "../../locale/toolkit-messages.js"
import { attribute, decodeEntities, openingTags } from "../../render-scan.js"
import { BuilderBanners } from "./BuilderBanners.js"
import { EmptyHint } from "./EmptyHint.js"

/**
 * The builder's feedback states on their SSR markup: a failure says what
 * happened and what to do in catalog words, keeps the raw reason under
 * "Details", and offers the next step; the empty state leads with the blue
 * primary button (CI §9).
 */

const de = TOOLKIT_MESSAGES.de
const inGerman = (node: ReactNode) =>
  renderToStaticMarkup(<LocaleProvider locale="de-DE">{node}</LocaleProvider>)
const noop = (): void => {}
const RAW = "MCP error -32602: Tool get-builder-catalogue not found"

describe("BuilderBanners: catalogue failure", () => {
  const html = inGerman(
    <BuilderBanners
      L={de.builder}
      catalogueToolName="get-builder-catalogue"
      refreshError={RAW}
      validationIssues={[]}
      onRetry={noop}
    />,
  )

  it("is the kit's inline error state, announced as an alert", () => {
    const root = openingTags(html, "div").find((t) => /data-slot="error-state"/.test(t)) ?? ""
    expect(attribute(root, "role")).toBe("alert")
    expect(attribute(root, "data-variant")).toBe("inline")
  })

  it("says what happened and what to do in German, with a retry", () => {
    const text = decodeEntities(html)
    expect(text).toContain(de.builder.catalogueError)
    expect(text).toContain(de.builder.catalogueErrorHint)
    expect(text).toContain(`${de.common.retry}</button>`)
  })

  it("keeps the raw reason under Details only, never in a sentence the user reads", () => {
    const details = /<details[^>]*>([\s\S]*?)<\/details>/.exec(html)?.[1] ?? ""
    expect(decodeEntities(details)).toContain(`get-builder-catalogue: ${RAW}`)
    const outside = decodeEntities(html.replace(/<details[\s\S]*?<\/details>/g, ""))
    expect(outside).not.toContain(RAW)
  })

  it("has no retry without a handler", () => {
    const bare = inGerman(
      <BuilderBanners
        L={de.builder}
        catalogueToolName="get-builder-catalogue"
        refreshError={RAW}
        validationIssues={[]}
      />,
    )
    expect(bare).not.toContain("<button")
  })
})

describe("EmptyHint", () => {
  it("offers its one next step as the primary (blue) button", () => {
    const html = inGerman(<EmptyHint L={de.builder} onGotoPipeline={noop} />)
    const buttons = openingTags(html, "button")
    expect(buttons).toHaveLength(1)
    expect(attribute(buttons[0] ?? "", "data-variant")).toBe("default")
    expect(decodeEntities(html)).toContain(`${de.builder.openDataSources}</button>`)
  })
})
