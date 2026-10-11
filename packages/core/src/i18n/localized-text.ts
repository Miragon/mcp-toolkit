/**
 * User-facing text that travels with a definition (a widget's or a step's
 * title, a props field's label) instead of living in a widget bundle's
 * catalog. Browser-bundle-safe: pure data + functions, so the server attaches
 * it to its definitions and the builder in the iframe resolves it.
 */

/**
 * Text in one language (a plain string) or per locale, keyed by a BCP 47 tag
 * (`{ en: "Process list", de: "Prozessliste" }`). Resolve it with
 * {@link resolveLocalizedText}.
 */
export type LocalizedText = string | Readonly<Record<string, string>>

/** Lower-case a BCP 47 tag and accept `_` as the subtag separator (`de_AT` → `de-at`). */
function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-")
}

function primaryOf(tag: string): string {
  return tag.split("-")[0] ?? ""
}

function nonBlank(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** The best entry of `entries` for one language: its bare tag first, then any regional tag. */
function pickLanguage(
  entries: readonly (readonly [string, string])[],
  language: string,
): string | undefined {
  const bare = entries.find(([tag]) => tag === language)
  if (bare) return bare[1]
  return entries.find(([tag]) => primaryOf(tag) === language)?.[1]
}

/**
 * The text of `text` for `locale`, trimmed; `undefined` when there is none.
 *
 * A plain string is returned as is (whatever the locale). From a per-locale
 * map it takes the first non-blank entry of: the exact tag (case and `_`/`-`
 * insensitive), the same language (`de` for `de-AT`, `de-DE` for `de`), English,
 * then the first entry, so a partial translation degrades to another language
 * rather than to nothing.
 *
 * @example
 * resolveLocalizedText({ en: "Orders", de: "Bestellungen" }, "de-AT") // "Bestellungen"
 * resolveLocalizedText({ en: "Orders", de: "Bestellungen" }, "fr")    // "Orders"
 * resolveLocalizedText("Orders", "de")                                 // "Orders"
 */
export function resolveLocalizedText(
  text: LocalizedText | undefined,
  locale: string | undefined,
): string | undefined {
  if (typeof text === "string") return nonBlank(text)
  // Display text crosses the wire: anything but a string or a plain map is no text.
  if (typeof text !== "object" || text === null || Array.isArray(text)) return undefined
  const entries = Object.entries(text).flatMap(([tag, value]) => {
    const resolved = nonBlank(value)
    return resolved === undefined ? [] : [[normalizeTag(tag), resolved] as const]
  })
  const wanted = normalizeTag(locale ?? "")
  return (
    entries.find(([tag]) => tag === wanted)?.[1] ??
    pickLanguage(entries, primaryOf(wanted)) ??
    pickLanguage(entries, "en") ??
    entries[0]?.[1]
  )
}
