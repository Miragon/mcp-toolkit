import { describe, expect, it } from "vitest"
import { DENSE_ICON_STROKE, ICON_STROKE } from "./icon-stroke.js"

/**
 * ONE mechanism for the Lucide stroke (CI §11): `LucideProvider` with the two
 * constants of `icon-stroke.ts` — 2.5 for the view (`McpAppView`), 2 in dense
 * chrome bars. No CSS rule (`svg.lucide { stroke-width }`) in the theme, and no
 * per-icon `strokeWidth` in kit code, so the two can never disagree.
 */

declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>
  }
}

const STYLESHEETS = import.meta.glob(["../*.css", "../theme/*.css"], {
  query: "?raw",
  import: "default",
  eager: true,
})

const SOURCES = import.meta.glob(["../**/*.tsx", "!../**/*.test.tsx", "!../render-cases*.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
})

describe("Lucide stroke: one mechanism", () => {
  it("is 2.5 for the view and 2 in dense bars (CI §11)", () => {
    expect(ICON_STROKE).toBe(2.5)
    expect(DENSE_ICON_STROKE).toBe(2)
  })

  it("is never set in CSS (theme.css, globals.css, fonts.css, the vendored tokens)", () => {
    expect(Object.keys(STYLESHEETS)).toEqual(
      expect.arrayContaining(["../theme.css", "../globals.css"]),
    )
    for (const [file, css] of Object.entries(STYLESHEETS)) {
      expect(css, file).not.toMatch(/stroke-width/)
    }
  })

  it("is set only on a LucideProvider, from the icon-stroke constants", () => {
    const uses: string[] = []
    for (const [file, source] of Object.entries(SOURCES)) {
      for (const m of source.matchAll(/<(\w+)[^<>]*\bstrokeWidth=\{?([^}\s>]+)\}?/g)) {
        uses.push(`${file}: <${m[1]} strokeWidth=${m[2]}>`)
        expect(m[1], file).toBe("LucideProvider")
        expect(["ICON_STROKE", "DENSE_ICON_STROKE"], file).toContain(m[2])
      }
    }
    // The view and the three dense bars (view toolbar, builder toolbar, pipeline strip).
    expect(uses.length).toBeGreaterThanOrEqual(4)
  })
})
