import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { Translate } from "@miragon/mcp-toolkit-core"
import {
  resolveToolkitMessages,
  type ToolkitMessages,
  type ToolkitMessagesOverride,
} from "./toolkit-messages.js"

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
  /**
   * The toolkit's own strings for the active locale (its shipped `en`/`de`
   * catalog, English for any other locale) with the provider's
   * `toolkitMessages` override applied. Read it with {@link useToolkitMessages}.
   */
  messages: ToolkitMessages
}

const DEFAULT_LOCALE = "en"

/**
 * Default used when a widget renders *outside* a {@link LocaleProvider} (e.g. a
 * standalone `show_*` widget the consumer hasn't wrapped yet). Unlike
 * `useTheme()`, the locale hooks degrade gracefully rather than throwing: a
 * missing wrapper echoes the key (visible + greppable) instead of crashing a
 * widget that is perfectly renderable in English.
 */
const DEFAULT_VALUE: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  t: (key) => key,
  messages: resolveToolkitMessages(DEFAULT_LOCALE),
}

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

/**
 * The toolkit's own UI strings for the nearest {@link LocaleProvider}'s locale
 * (English outside a provider). Every toolkit component reads its captions,
 * labels and accessible names here, so a German locale renders no English
 * toolkit chrome.
 */
export function useToolkitMessages(): ToolkitMessages {
  return useContext(LocaleContext)?.messages ?? DEFAULT_VALUE.messages
}

/**
 * The nearest {@link LocaleProvider}'s value, or `null` when none is mounted.
 * The app shell uses it to fall back to the host's locale only when the
 * consumer provides none.
 */
export function useLocaleContextOrNull(): LocaleContextValue | null {
  return useContext(LocaleContext)
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
  /**
   * Override individual toolkit strings for this subtree, per catalog section
   * (e.g. `{ listFooter: { loadMore: "Show more" } }`). Omitted entries keep the
   * shipped `en`/`de` catalog of `locale`.
   */
  toolkitMessages?: ToolkitMessagesOverride
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
export function LocaleProvider({
  locale,
  translator,
  toolkitMessages,
  children,
}: LocaleProviderProps): ReactNode {
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: translator ? (key, params) => translator(locale, key, params) : (key) => key,
      messages: resolveToolkitMessages(locale, toolkitMessages),
    }),
    [locale, translator, toolkitMessages],
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
