import { useMemo } from "react"
import { useToolkitLocale, useTranslate } from "../../locale/locale-provider.js"
import { keyResolverFrom, type DisplayKeyResolver } from "./builder-model.js"

/** What the builder needs to turn a definition's display text into words. */
export interface DisplayResolver {
  /** The locale the builder's own text is in (a `LocaleProvider`'s, else the host's). */
  locale: string
  /** Resolves a `titleKey`/`summaryKey` through the `LocaleProvider`'s translator. */
  resolveKey: DisplayKeyResolver
}

/**
 * Binds `displayLabel` / `propFieldText` to the builder's locale: inline
 * per-locale titles follow the same language as the builder chrome around
 * them, and i18n keys resolve through the nearest `LocaleProvider`'s
 * translator (outside one, keys stay unknown and the inline text or the id
 * shows instead).
 */
export function useDisplayResolver(): DisplayResolver {
  const locale = useToolkitLocale()
  const translate = useTranslate()
  return useMemo(() => ({ locale, resolveKey: keyResolverFrom(translate) }), [locale, translate])
}
