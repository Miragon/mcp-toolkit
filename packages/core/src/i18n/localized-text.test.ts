import { describe, expect, it } from "vitest"
import { resolveLocalizedText } from "./localized-text.js"

describe("resolveLocalizedText", () => {
  it("has nothing for nothing", () => {
    expect(resolveLocalizedText(undefined, "de")).toBeUndefined()
    // A JS caller may hand in null for an absent field.
    expect(resolveLocalizedText(null as unknown as undefined, "de")).toBeUndefined()
  })

  it("has nothing for a value that is neither a string nor a per-locale map", () => {
    for (const malformed of [42, true, ["Orders"], () => "Orders"]) {
      expect(resolveLocalizedText(malformed as unknown as string, "en")).toBeUndefined()
    }
  })

  it("returns a plain string for every locale, trimmed", () => {
    expect(resolveLocalizedText("Orders", "de")).toBe("Orders")
    expect(resolveLocalizedText("  Orders ", undefined)).toBe("Orders")
  })

  it("treats a blank string as no text", () => {
    expect(resolveLocalizedText("", "en")).toBeUndefined()
    expect(resolveLocalizedText("   ", "en")).toBeUndefined()
  })

  it("picks the exact tag of a per-locale map, case- and separator-insensitive", () => {
    const text = { en: "Orders", de: "Bestellungen", "de-AT": "Bestellungen (AT)" }
    expect(resolveLocalizedText(text, "de-AT")).toBe("Bestellungen (AT)")
    expect(resolveLocalizedText(text, "de_at")).toBe("Bestellungen (AT)")
    expect(resolveLocalizedText(text, " DE-at ")).toBe("Bestellungen (AT)")
    expect(
      resolveLocalizedText({ "DE-ch": "Bestellungen (CH)", de: "Bestellungen" }, "de-CH"),
    ).toBe("Bestellungen (CH)")
  })

  it("falls back to the language: its bare tag first, then any regional tag", () => {
    expect(resolveLocalizedText({ en: "Orders", de: "Bestellungen" }, "de-DE")).toBe("Bestellungen")
    expect(
      resolveLocalizedText({ "de-CH": "Bestellungen (CH)", de: "Bestellungen" }, "de-AT"),
    ).toBe("Bestellungen")
    expect(resolveLocalizedText({ en: "Orders", "de-DE": "Bestellungen" }, "de")).toBe(
      "Bestellungen",
    )
  })

  it("falls back to English (bare, then regional), then to the first entry", () => {
    expect(resolveLocalizedText({ de: "Bestellungen", en: "Orders" }, "fr")).toBe("Orders")
    expect(resolveLocalizedText({ de: "Bestellungen", "en-GB": "Orders (GB)" }, "fr")).toBe(
      "Orders (GB)",
    )
    expect(resolveLocalizedText({ de: "Bestellungen", fr: "Commandes" }, "it")).toBe("Bestellungen")
    expect(resolveLocalizedText({ de: "Bestellungen" }, undefined)).toBe("Bestellungen")
  })

  it("skips blank and non-string entries on every fallback step", () => {
    expect(resolveLocalizedText({ de: "  ", en: "Orders" }, "de")).toBe("Orders")
    expect(resolveLocalizedText({ en: "", fr: "Commandes" }, "de")).toBe("Commandes")
    expect(resolveLocalizedText({ de: 7 as unknown as string, en: "Orders" }, "de")).toBe("Orders")
    expect(resolveLocalizedText({ de: " Bestellungen " }, "de")).toBe("Bestellungen")
    expect(resolveLocalizedText({ de: " ", en: "" }, "de")).toBeUndefined()
    expect(resolveLocalizedText({}, "de")).toBeUndefined()
  })
})
