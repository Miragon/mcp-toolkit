import { describe, expect, it } from "vitest"
import {
  formatCount,
  resolveToolkitLocale,
  resolveToolkitMessages,
  TOOLKIT_LOCALES,
  TOOLKIT_MESSAGES,
  type ToolkitMessages,
} from "./toolkit-messages.js"

/**
 * The catalog guard: every toolkit string follows the house copy rules in
 * BOTH locales (brand-tone: no dash as a connector, one "…" character, no
 * framework jargon; German with du, AI not KI, "CIB seven"; English in
 * sentence case), and the German catalog is a real translation, not a copy.
 */

/** Sample arguments for the function-valued messages. */
const SAMPLES: Record<string, unknown[]> = {
  showing: [{ shown: "8", total: "42", noun: "tasks" }],
  saved: ["weekly ops"],
  rowLabel: [3],
  elementCount: [2],
  configureElementSet: [2],
  unsupportedType: ["array"],
  valueType: ["num"],
}

/** Every message of a catalog as `[path, rendered text]`. */
function flatten(messages: ToolkitMessages): [string, string][] {
  const out: [string, string][] = []
  for (const [section, entries] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
      const text =
        typeof value === "function"
          ? (value as (...args: unknown[]) => string)(...(SAMPLES[key] ?? []))
          : value
      out.push([`${section}.${key}`, String(text)])
    }
  }
  return out
}

const shape = (messages: ToolkitMessages) =>
  Object.fromEntries(
    Object.entries(messages).map(([section, entries]) => [
      section,
      Object.fromEntries(
        Object.entries(entries as Record<string, unknown>).map(([k, v]) => [k, typeof v]),
      ),
    ]),
  )

describe("toolkit catalogs", () => {
  it("ship en and de with the identical section/key shape and value kinds", () => {
    expect(TOOLKIT_LOCALES).toEqual(["en", "de"])
    expect(shape(TOOLKIT_MESSAGES.de)).toEqual(shape(TOOLKIT_MESSAGES.en))
  })

  for (const locale of TOOLKIT_LOCALES) {
    describe(`${locale} copy rules`, () => {
      const entries = flatten(TOOLKIT_MESSAGES[locale])

      it("has no empty or padded message", () => {
        for (const [path, text] of entries) {
          expect(text.trim().length, path).toBeGreaterThan(0)
          expect(text, path).toBe(text.trim())
        }
      })

      it("uses no dash as a connector (A2) and the ellipsis character, never three dots", () => {
        for (const [path, text] of entries) {
          expect(text, path).not.toMatch(/—| – | - /)
          expect(text, path).not.toContain("...")
        }
      })

      it("speaks no framework jargon to users (no 'pipeline')", () => {
        for (const [path, text] of entries) expect(text, path).not.toMatch(/pipeline/i)
      })

      it("writes the brand spellings (AI, CIB seven)", () => {
        for (const [path, text] of entries) {
          expect(text, path).not.toMatch(/\bKI\b/)
          expect(text, path).not.toMatch(/CIB Seven|CIB SEVEN/)
        }
      })
    })
  }

  it("de addresses the reader with du — never Sie/Ihnen/Ihr or an impersonal 'man'", () => {
    for (const [path, text] of flatten(TOOLKIT_MESSAGES.de)) {
      expect(text, path).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/)
      expect(text, path).not.toMatch(/\bman\b/)
    }
  })

  it("en is in sentence case — no two capitalised words in a row within a sentence", () => {
    const capitalised = (word: string) => /^[A-Z][a-z]/.test(word)
    for (const [path, text] of flatten(TOOLKIT_MESSAGES.en)) {
      const words = text.split(/\s+/)
      for (let i = 1; i < words.length; i++) {
        const prev = words[i - 1] ?? ""
        const word = words[i] ?? ""
        const titleCasePair = capitalised(prev) && !/[.!?:]$/.test(prev) && capitalised(word)
        expect(titleCasePair, `${path}: "${prev} ${word}"`).toBe(false)
      }
    }
  })

  it("de is a translation: only loanwords may equal the English text", () => {
    const en = new Map(flatten(TOOLKIT_MESSAGES.en))
    const identical = flatten(TOOLKIT_MESSAGES.de)
      .filter(([path, text]) => en.get(path) === text)
      .map(([, text]) => text)
    expect([...new Set(identical)].sort()).toEqual([
      "Details",
      "Layout",
      "Live",
      "Name",
      "Optional",
      "Tabs",
    ])
  })

  it("renders counts and names into the parametrised messages", () => {
    const { en, de } = TOOLKIT_MESSAGES
    expect(en.listFooter.showing({ shown: "8", total: "42", noun: "tasks" })).toBe(
      "Showing 8 of 42 tasks",
    )
    expect(de.listFooter.showing({ shown: "8", total: "42", noun: "Aufgaben" })).toBe(
      "Zeigt 8 von 42 Aufgaben",
    )
    // An empty noun leaves no trailing blank.
    expect(en.listFooter.showing({ shown: "1", total: "2", noun: "" })).toBe("Showing 1 of 2")
    expect(de.listFooter.showing({ shown: "1", total: "2", noun: "" })).toBe("Zeigt 1 von 2")
    expect(en.builder.saved("Ops")).toBe("Dashboard “Ops” saved.")
    expect(de.builder.saved("Ops")).toBe("Dashboard „Ops“ gespeichert.")
    expect(en.builder.elementCount(1)).toBe("1 element")
    expect(en.builder.elementCount(3)).toBe("3 elements")
    expect(de.builder.elementCount(1)).toBe("1 Element")
    expect(de.builder.elementCount(0)).toBe("0 Elemente")
    expect(en.builder.rowLabel(2)).toBe("Row 2")
    expect(de.builder.rowLabel(2)).toBe("Zeile 2")
    expect(en.builder.configureElementSet(2)).toBe("Configure element (2 set)")
    expect(de.builder.configureElementSet(2)).toBe("Element konfigurieren (2 gesetzt)")
    expect(en.builder.valueType("bool")).toBe("yes/no")
    expect(de.builder.valueType("bool")).toBe("Ja/Nein")
    expect(de.builder.valueType("arr")).toBe("Liste")
    expect(en.builder.valueType("future")).toBe("future")
    expect(de.builder.valueType("future")).toBe("future")
    expect(en.propsSheet.unsupportedType("array")).toBe(
      "This field type (array) can't be edited here.",
    )
    expect(de.propsSheet.unsupportedType("array")).toBe(
      "Diesen Feldtyp (array) kannst du hier nicht bearbeiten.",
    )
  })
})

describe("resolveToolkitLocale", () => {
  it("maps a BCP 47 tag onto its shipped primary language", () => {
    expect(resolveToolkitLocale("de")).toBe("de")
    expect(resolveToolkitLocale("de-DE")).toBe("de")
    expect(resolveToolkitLocale("de_AT")).toBe("de")
    expect(resolveToolkitLocale(" DE-ch ")).toBe("de")
    expect(resolveToolkitLocale("en-US")).toBe("en")
  })

  it("falls back to English for any other or missing locale", () => {
    expect(resolveToolkitLocale("fr-FR")).toBe("en")
    expect(resolveToolkitLocale("")).toBe("en")
    expect(resolveToolkitLocale(undefined)).toBe("en")
    expect(resolveToolkitLocale("deu")).toBe("en")
  })
})

describe("resolveToolkitMessages", () => {
  it("returns the shipped catalog itself without an override (stable identity)", () => {
    expect(resolveToolkitMessages("de-DE")).toBe(TOOLKIT_MESSAGES.de)
    expect(resolveToolkitMessages("es")).toBe(TOOLKIT_MESSAGES.en)
  })

  it("merges an override per section and keeps every other string", () => {
    const merged = resolveToolkitMessages("de", {
      listFooter: { loadMore: "Weitere laden" },
      view: { refresh: "Neu laden" },
    })
    expect(merged.listFooter.loadMore).toBe("Weitere laden")
    expect(merged.listFooter.loadingMore).toBe(TOOLKIT_MESSAGES.de.listFooter.loadingMore)
    expect(merged.view.refresh).toBe("Neu laden")
    expect(merged.view.retry).toBe(TOOLKIT_MESSAGES.de.view.retry)
    for (const section of [
      "common",
      "filterBar",
      "pills",
      "renderer",
      "builder",
      "propsSheet",
    ] as const) {
      expect(merged[section]).toEqual(TOOLKIT_MESSAGES.de[section])
    }
  })
})

describe("formatCount", () => {
  it("groups digits per locale", () => {
    expect(formatCount(1234567, "en")).toBe("1,234,567")
    expect(formatCount(1234567, "de-DE")).toBe("1.234.567")
    expect(formatCount(7, "de")).toBe("7")
  })

  it("falls back to English for an invalid locale tag instead of throwing", () => {
    expect(formatCount(1234, "not a locale!")).toBe("1,234")
  })
})
