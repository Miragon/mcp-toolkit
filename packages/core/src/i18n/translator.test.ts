import { describe, expect, it } from "vitest"
import { createTranslator } from "./translator.js"

const catalogs = {
  en: {
    greeting: ({ name }: Record<string, unknown>) => `Hello, ${String(name)}`,
    plain: "A plain string",
  },
  de: {
    greeting: ({ name }: Record<string, unknown>) => `Hallo, ${String(name)}`,
  },
}

describe("createTranslator", () => {
  it("resolves a message in the requested locale", () => {
    const t = createTranslator(catalogs)
    expect(t("de", "greeting", { name: "Ada" })).toBe("Hallo, Ada")
  })

  it("returns literal (non-function) messages verbatim", () => {
    const t = createTranslator(catalogs)
    expect(t("en", "plain")).toBe("A plain string")
  })

  it("falls back to the fallback locale when the requested locale lacks the key", () => {
    const t = createTranslator(catalogs)
    // `de` has no `plain` key → fall back to `en`.
    expect(t("de", "plain")).toBe("A plain string")
  })

  it("falls back to the fallback locale when the requested locale has no catalog", () => {
    const t = createTranslator(catalogs)
    expect(t("fr", "greeting", { name: "Ada" })).toBe("Hello, Ada")
  })

  it("returns the key itself when no catalog has the message", () => {
    const t = createTranslator(catalogs)
    expect(t("de", "does.not.exist")).toBe("does.not.exist")
  })

  it("honours a custom fallback locale", () => {
    const t = createTranslator(catalogs, { fallbackLocale: "de" })
    // `fr` missing → fall back to `de`, not `en`.
    expect(t("fr", "greeting", { name: "Ada" })).toBe("Hallo, Ada")
  })

  it("tolerates a missing params object for a function message", () => {
    const t = createTranslator({ en: { greeting: ({ name }) => `Hi ${String(name)}` } })
    expect(t("en", "greeting")).toBe("Hi undefined")
  })
})
