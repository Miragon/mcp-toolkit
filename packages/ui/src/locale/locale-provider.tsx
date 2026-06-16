import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { Translate } from "@miragon/mcp-toolkit-core"

/**
 * A locale-bound translate: the active locale is already applied, so call sites
 * only pass a key (+ params). Obtained from {@link useTranslate}.
 */
export type BoundTranslate = (key: string, params?: Record<string, unknown>) => string

/** The value exposed by {@link useLocale} / {@link useTranslate}. */
export interface LocaleContextValue {
  /** The active locale tag (e.g. `"en"`, `"de"`). */
  locale: string
  /** Translate a key in the active locale. */
  t: BoundTranslate
}

const DEFAULT_LOCALE = "en"

/**
 * Default used when a widget renders *outside* a {@link LocaleProvider} (e.g. a
 * standalone `show_*` widget the consumer hasn't wrapped yet). Unlike
 * `useTheme()`, the locale hooks degrade gracefully rather than throwing: a
 * missing wrapper echoes the key (visible + greppable) instead of crashing a
 * widget that is perfectly renderable in English.
 */
const DEFAULT_VALUE: LocaleContextValue = { locale: DEFAULT_LOCALE, t: (key) => key }

const LocaleContext = createContext<LocaleContextValue | null>(null)

/** Read the active locale tag from the nearest {@link LocaleProvider}. */
export function useLocale(): string {
  return useContext(LocaleContext)?.locale ?? DEFAULT_VALUE.locale
}

/**
 * Get a locale-bound translate from the nearest {@link LocaleProvider}. Outside
 * a provider it returns a passthrough that echoes the key, so unwrapped widgets
 * render their keys instead of throwing.
 */
export function useTranslate(): BoundTranslate {
  return useContext(LocaleContext)?.t ?? DEFAULT_VALUE.t
}

export interface LocaleProviderProps {
  /** The active locale tag (e.g. `"en"`, `"de"`). */
  locale: string
  /**
   * A translator from `createTranslator(catalogs)` (`@miragon/mcp-toolkit-core`).
   * Omit to provide the locale only (translate echoes keys) — useful while a
   * consumer wires the locale before any catalog exists.
   */
  translator?: Translate
  children: ReactNode
}

/**
 * Provide the active locale (and an optional translator) to a subtree. Widgets
 * read it with {@link useLocale} / {@link useTranslate}. Pure React (no
 * `mcp-use/react`), so it ships from the root barrel and works in a host, a
 * standalone app, or the widget playground alike — mirroring `ThemeProvider`.
 *
 * The locale itself is app-specific (a header, a user profile, a session
 * store …): resolve it on the host/server and pass it in.
 *
 * @example
 * const translator = createTranslator({ en: {...}, de: {...} })
 * <LocaleProvider locale={profile.language} translator={translator}>
 *   <YourWidget />
 * </LocaleProvider>
 */
export function LocaleProvider({ locale, translator, children }: LocaleProviderProps): ReactNode {
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: translator ? (key, params) => translator(locale, key, params) : (key) => key,
    }),
    [locale, translator],
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
