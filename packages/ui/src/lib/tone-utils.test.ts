import { describe, expect, it } from "vitest"
import { TONE_DOT, TONE_SOFT, TONE_TEXT, type ToneVariant } from "./tone-utils.js"

const ALL_TONES: ToneVariant[] = ["neutral", "info", "success", "warning", "danger"]

describe("tone-utils", () => {
  it("covers every ToneVariant in each map (no missing tones)", () => {
    for (const map of [TONE_SOFT, TONE_DOT, TONE_TEXT]) {
      expect(Object.keys(map).sort()).toEqual([...ALL_TONES].sort())
    }
  })

  it("maps each tone to a non-empty class string in every map", () => {
    for (const tone of ALL_TONES) {
      expect(TONE_SOFT[tone], `soft:${tone}`).toBeTruthy()
      expect(TONE_DOT[tone], `dot:${tone}`).toBeTruthy()
      expect(TONE_TEXT[tone], `text:${tone}`).toBeTruthy()
    }
  })

  it("routes each status tone to its matching design token", () => {
    expect(TONE_SOFT.danger).toBe("bg-danger-soft text-danger")
    expect(TONE_SOFT.warning).toBe("bg-warning-soft text-warning")
    expect(TONE_SOFT.success).toBe("bg-success-soft text-success")
    expect(TONE_SOFT.info).toBe("bg-info-soft text-info")
    expect(TONE_DOT.danger).toBe("bg-danger")
    expect(TONE_TEXT.success).toBe("text-success")
  })

  it("routes the neutral tone to the shadcn muted ramp", () => {
    expect(TONE_SOFT.neutral).toBe("bg-muted text-muted-foreground")
    expect(TONE_DOT.neutral).toBe("bg-muted-foreground")
    expect(TONE_TEXT.neutral).toBe("text-foreground")
  })
})
