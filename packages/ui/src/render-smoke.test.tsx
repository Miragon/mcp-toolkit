import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import catalog from "../ui-catalog.json" with { type: "json" }
import allowlist from "../../../ratchets/render-allowlist.json" with { type: "json" }
import { RENDER_CASES } from "./render-cases.js"

/**
 * Render-coverage ratchet (FITNESS.md phase 5c). jsdom is deliberately
 * renounced in this repo — SSR via `react-dom/server`'s `renderToStaticMarkup`
 * is the house render path, and mutation testing does NOT measure the JSX
 * render surface, so this suite is the compensating control:
 *
 * 1. every case in `render-cases.tsx` must SSR without throwing, produce
 *    non-empty markup, and contain its marker where one is set;
 * 2. every component-like `ui-catalog.json` entry must have a render case OR
 *    a justified entry in `ratchets/render-allowlist.json` (shrink-only).
 */

interface CatalogEntry {
  name: string
  kind: string
}

const catalogEntries = (catalog as unknown as { components: CatalogEntry[] }).components

/** Kinds that render as React elements and therefore need an SSR case. */
const COMPONENT_KINDS = new Set(["primitive", "component"])
/** Kinds that are not renderable on their own (values, hooks, types). */
const NON_RENDER_KINDS = new Set(["hook", "function", "object", "type"])

const componentEntryNames = new Set(
  catalogEntries.filter((entry) => COMPONENT_KINDS.has(entry.kind)).map((entry) => entry.name),
)
const caseNames = new Set(RENDER_CASES.map((renderCase) => renderCase.name))
const allowlistedNames = new Set(allowlist.components.map((entry) => entry.name))

const GATE_HINT =
  "add a RENDER_CASES entry in packages/ui/src/render-cases.tsx (SSR, no jsdom) " +
  "or justify it in ratchets/render-allowlist.json (shrink-only)"

describe("RENDER_CASES (SSR render suite)", () => {
  it("has one case per name — duplicates would mask a missing component", () => {
    expect(caseNames.size).toBe(RENDER_CASES.length)
  })

  for (const renderCase of RENDER_CASES) {
    it(`${renderCase.name} SSR-renders to non-empty markup`, () => {
      const html = renderToStaticMarkup(renderCase.render())
      expect(html.length, `${renderCase.name} rendered empty markup`).toBeGreaterThan(0)
      if (renderCase.marker) {
        expect(html, `${renderCase.name} markup lost its marker`).toContain(renderCase.marker)
      }
    })
  }
})

describe("render coverage (catalog completeness gate)", () => {
  it("classifies every catalog kind — a new kind must be triaged here, not skipped silently", () => {
    for (const entry of catalogEntries) {
      expect(
        COMPONENT_KINDS.has(entry.kind) || NON_RENDER_KINDS.has(entry.kind),
        `Unknown catalog kind "${entry.kind}" on "${entry.name}". Add it to COMPONENT_KINDS ` +
          `(then ${GATE_HINT}) or to NON_RENDER_KINDS in render-smoke.test.tsx.`,
      ).toBe(true)
    }
  })

  it("covers every component-like catalog entry (RENDER_CASES ∪ render-allowlist)", () => {
    const missing = [...componentEntryNames].filter(
      (name) => !caseNames.has(name) && !allowlistedNames.has(name),
    )
    expect(
      missing,
      `Catalogued component(s) [${missing.join(", ")}] have no SSR render case — ${GATE_HINT}.`,
    ).toEqual([])
  })

  it("every RENDER_CASES entry names a component-like catalog entry (no drift)", () => {
    const unknown = RENDER_CASES.map((c) => c.name).filter((name) => !componentEntryNames.has(name))
    expect(
      unknown,
      `RENDER_CASES entr${unknown.length === 1 ? "y" : "ies"} [${unknown.join(", ")}] match(es) no ` +
        "component-like ui-catalog.json entry — rename the case to the catalog name or catalogue the component.",
    ).toEqual([])
  })

  it("allowlist hygiene: reasons present, entries real, none double-listed", () => {
    for (const entry of allowlist.components) {
      expect(entry.reason, `${entry.name} needs a non-empty reason`).toBeTruthy()
      expect(
        componentEntryNames.has(entry.name),
        `${entry.name} is allowlisted but is no component-like ui-catalog.json entry — remove the row (shrink-only)`,
      ).toBe(true)
      expect(
        caseNames.has(entry.name),
        `${entry.name} is BOTH rendered in RENDER_CASES and allowlisted — remove the stale allowlist row`,
      ).toBe(false)
    }
  })
})
