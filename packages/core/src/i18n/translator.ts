/**
 * A minimal, dependency-free translation engine shared by the server (tool
 * summaries / messages) and the UI (widget strings). It deliberately ships *no*
 * catalogs — a consuming app provides its own message catalogs and decides where
 * the active locale comes from (a header, a user profile, a session store …).
 *
 * Browser-bundle-safe: pure data + functions, no `node:*` and no `mcp-use/*`, so
 * it ships from the core root barrel and runs in a widget bundle and on the
 * server alike.
 */

/**
 * A single message. Either:
 * - a string, optionally with `{name}` placeholders interpolated from params
 *   (e.g. `"{count} open incidents"`), or
 * - a function of the params, for logic a template can't express (plurals,
 *   conditionals).
 *
 * Strings keep catalogs pure data (JSON-serialisable); reach for a function only
 * when interpolation isn't enough.
 */
export type Message = string | ((params: Record<string, unknown>) => string)

/** One locale's messages, keyed by a dotted message key (e.g. `"engine.list.empty"`). */
export type MessageCatalog = Record<string, Message>

/** Per-locale catalogs, keyed by a locale tag (e.g. `"en"`, `"de"`). */
export type Catalogs = Record<string, MessageCatalog>

/** Resolves a message for an explicit locale. */
export type Translate = (locale: string, key: string, params?: Record<string, unknown>) => string

export interface CreateTranslatorOptions {
  /**
   * Locale used when the requested locale has no catalog, or has a catalog but
   * not the requested key. Defaults to `"en"`.
   */
  fallbackLocale?: string
}

/**
 * Build a {@link Translate} over the given catalogs. Resolution falls back in a
 * fixed chain so a partial translation degrades predictably rather than
 * crashing:
 *
 *   requested locale → fallback locale → the key itself
 *
 * Returning the key for a wholly-unknown message keeps a missing translation
 * visible (and greppable) in development instead of rendering an empty string.
 *
 * @example
 * const t = createTranslator({
 *   en: { "greeting": ({ name }) => `Hello, ${name}` },
 *   de: { "greeting": ({ name }) => `Hallo, ${name}` },
 * })
 * t("de", "greeting", { name: "Ada" }) // "Hallo, Ada"
 * t("fr", "greeting", { name: "Ada" }) // "Hello, Ada" (fallback)
 * t("de", "missing")                   // "missing"     (key passthrough)
 *
 * // String templates interpolate `{name}` placeholders from params:
 * const u = createTranslator({ en: { hi: "Hi {name}, {n} new" } })
 * u("en", "hi", { name: "Ada", n: 3 })  // "Hi Ada, 3 new"
 */
export function createTranslator(
  catalogs: Catalogs,
  options: CreateTranslatorOptions = {},
): Translate {
  const fallbackLocale = options.fallbackLocale ?? "en"
  return (locale, key, params) => {
    const message = catalogs[locale]?.[key] ?? catalogs[fallbackLocale]?.[key]
    if (message === undefined) return key
    if (typeof message === "function") return message(params ?? {})
    if (!params) return message
    // Interpolate `{name}` placeholders; leave unknown ones untouched.
    return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in params ? String(params[name]) : whole,
    )
  }
}
