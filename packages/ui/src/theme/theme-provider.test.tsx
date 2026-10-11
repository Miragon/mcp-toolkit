/// <reference types="node" />
// The colours below are a CUSTOMER brand's values (white-label fixtures).
/* brand-lint-disable */
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { createTheme } from "./create-theme.js"
import { ThemeProvider, useTheme } from "./theme-provider.js"

/**
 * ThemeProvider's scope markup (SSR, the house render path — no jsdom) and the
 * portal-into-scope wiring (#178 N36). Radix renders portal content only after
 * mount, so the overlays themselves cannot be rendered here; the source gate
 * below pins that Dialog, Sheet and Select keep passing the scope's node.
 */

const acme = () =>
  createTheme({ primary: "#0f766e", primaryForeground: "#ffffff" }, { dark: { link: "#5eead4" } })

describe("ThemeProvider scope", () => {
  it("opens the scope with the empty display:contents portal node, before the children", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider mode="dark" theme={acme()} className="space-y-4 divide-y">
        <p>first</p>
        <p>last</p>
      </ThemeProvider>,
    )
    // The real last child stays :last-child, so space-*/divide-*/last: are unaffected.
    expect(html).toMatch(
      /^<div class="dark [^"]*space-y-4 divide-y" style="[^"]*--primary:#0f766e[^"]*" data-theme-mode="dark"><div data-slot="theme-portal" style="display:contents"><\/div><p>first<\/p><p>last<\/p><\/div>$/,
    )
  })

  it("re-applies the enclosing theme in a nested provider's own mode", () => {
    function Probe() {
      const { theme, resolvedMode } = useTheme()
      return (
        <i>
          {resolvedMode}:{theme ? "themed" : "none"}
        </i>
      )
    }
    const html = renderToStaticMarkup(
      <ThemeProvider mode="dark" theme={acme()}>
        <ThemeProvider mode="light">
          <Probe />
        </ThemeProvider>
      </ThemeProvider>,
    )
    const inner = /<div class="[^"]*" style="([^"]*)" data-theme-mode="light">/.exec(html)
    // The light island inside the dark brand scope keeps the brand's LIGHT vars
    // and none of its dark ones.
    expect(inner?.[1]).toContain("--primary:#0f766e")
    expect(inner?.[1]).toContain("--primary-foreground:#ffffff")
    expect(inner?.[1]).not.toContain("#5eead4")
    expect(html).toContain("<i>light:themed</i>")
  })

  it("an explicit theme on a nested provider wins over the enclosing one", () => {
    const other = createTheme({ primary: "#7c2d12" })
    const html = renderToStaticMarkup(
      <ThemeProvider theme={acme()}>
        <ThemeProvider theme={other}>x</ThemeProvider>
      </ThemeProvider>,
    )
    expect(html).toMatch(
      /style="[^"]*--primary:#7c2d12[^"]*" data-theme-mode="light"><div data-slot="theme-portal"[^>]*><\/div>x<\/div>/,
    )
  })
})

describe("overlays portal into the theme scope (source gate, #178 N36)", () => {
  it.each(["dialog", "sheet", "select"])(
    "%s passes the scope's portal node as the container",
    (name) => {
      const src = readFileSync(new URL(`../primitives/${name}.tsx`, import.meta.url), "utf8")
      expect(src).toMatch(/const portalContainer = usePortalContainer\(\)/)
      expect(src).toMatch(/<\w+Primitive\.Portal\b[^>]*container=\{[^}]*\bportalContainer\b[^}]*\}/)
    },
  )
})
/* brand-lint-enable */
