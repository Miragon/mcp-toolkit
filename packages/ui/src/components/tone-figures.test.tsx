import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ToneVariant } from "../lib/tone-utils.js"
import { KpiGrid } from "./KpiGrid.js"
import { CountPill, LivePill } from "./Pills.js"

/**
 * Status model (owner decision 2e-f, CI §3.3): coloured digits are retired.
 * A figure — a KPI value, a trend, a count — stays in the foreground; the tone
 * shows as a dot, a border or a tint next to it. These components carry
 * figures, so no tone colour may reach their text (SSR, the house render path).
 */

const STATUS = ["info", "success", "warning", "danger"] as const
const TONES: ToneVariant[] = ["neutral", ...STATUS]
/** Any tone used as a TEXT colour: the raw status colour or its -ink role. */
const TONE_AS_TEXT = /\btext-(?:success|warning|danger|info)(?:-ink)?\b/

describe("figures never take a tone colour", () => {
  it("KpiGrid: trend lines and toned cells keep their text in the foreground", () => {
    const html = renderToStaticMarkup(
      <KpiGrid
        cells={[
          { label: "Up", value: "12", trend: "+12% vs last week", trendDirection: "up" },
          { label: "Down", value: "3", trend: "-4% vs last week", trendDirection: "down" },
          { label: "Flat", value: "7", trend: "±0", trendDirection: "flat" },
          ...STATUS.map((tone) => ({ label: tone, value: "1", tone })),
        ]}
      />,
    )
    expect(html).not.toMatch(TONE_AS_TEXT)
    // The tone is still there — as a dot.
    expect(html).toMatch(/bg-danger\b/)
    expect(html).toMatch(/bg-success\b/)
    // A toned trend reads in the foreground, an untoned one stays quiet.
    expect(html).toMatch(/text-foreground[^"]*"><span aria-hidden="true"[^>]*bg-danger/)
    expect(html).toMatch(/text-muted-foreground">±0/)
  })

  it.each(TONES)(
    "CountPill and LivePill (%s): number and label in the foreground, tone on the rim",
    (tone) => {
      const count = renderToStaticMarkup(<CountPill tone={tone}>42</CountPill>)
      const live = renderToStaticMarkup(<LivePill tone={tone}>Live</LivePill>)
      for (const html of [count, live]) {
        expect(html).not.toMatch(TONE_AS_TEXT)
        if (tone !== "neutral") {
          expect(html).toContain("text-foreground")
          expect(html).toContain(`border-${tone}`)
        }
      }
    },
  )
})
