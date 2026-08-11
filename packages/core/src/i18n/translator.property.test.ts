import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { createTranslator, type Catalogs } from "./translator.js"

// Deterministic PRNG: a property failure in CI must replay identically on the
// next run, never appear as a fresh random draw (FITNESS.md phase 5c).
fc.configureGlobal({ seed: 42, numRuns: 100 })

// Realistic locale tags and dotted message keys. Keys are short lowercase
// words on purpose: the documented contract covers app-authored catalog keys,
// not adversarial identifiers colliding with Object.prototype members.
const localeArb = fc.constantFrom("en", "de", "fr", "en-US", "zz")
const keyArb = fc.stringMatching(/^[a-z]{1,6}(\.[a-z]{1,6}){0,2}$/)
const catalogArb = fc.dictionary(keyArb, fc.string(), { maxKeys: 5 })
const catalogsArb: fc.Arbitrary<Catalogs> = fc.dictionary(localeArb, catalogArb, { maxKeys: 3 })

describe("createTranslator (property)", () => {
  // Bug class guarded: a widget shipping a partial catalog must degrade along
  // the documented chain (locale → fallback → the key itself) — a throw or a
  // non-string here crashes server tool summaries and widget strings alike.
  it("always resolves to a string; wholly-unknown keys fall back to the key", () => {
    fc.assert(
      fc.property(catalogsArb, localeArb, keyArb, (catalogs, locale, key) => {
        const translate = createTranslator(catalogs)
        const out = translate(locale, key)
        expect(typeof out).toBe("string")
        const known = catalogs[locale]?.[key] ?? catalogs["en"]?.[key]
        if (known === undefined) expect(out).toBe(key)
      }),
    )
  })

  // Bug class guarded: interpolation leaking the literal string "undefined"
  // into UI/model-facing text ("3 undefined open") when the caller DID provide
  // the parameter — every provided value must appear verbatim instead.
  it('never injects "undefined" for provided params', () => {
    const nameArb = fc.stringMatching(/^[a-z]{1,6}$/)
    const valueArb = fc.oneof(
      fc.string().filter((s) => !s.includes("undefined") && !s.includes("{") && !s.includes("}")),
      fc.integer(),
      fc.boolean(),
    )
    fc.assert(
      fc.property(fc.dictionary(nameArb, valueArb, { minKeys: 1, maxKeys: 4 }), (params) => {
        const names = Object.keys(params)
        const template = names.map((name) => `<{${name}}>`).join(" ")
        const translate = createTranslator({ en: { msg: template } })
        const out = translate("en", "msg", params)
        expect(out).not.toContain("undefined")
        for (const name of names) expect(out).toContain(`<${String(params[name])}>`)
      }),
    )
  })

  // Bug class guarded: placeholders the caller did NOT provide must survive
  // untouched (greppable in dev output), not be replaced by garbage or dropped.
  it("leaves unknown placeholders literally in place", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,6}$/), (name) => {
        const translate = createTranslator({ en: { msg: `pre {${name}} post` } })
        expect(translate("en", "msg", { unrelated: 1 })).toBe(`pre {${name}} post`)
      }),
    )
  })
})
