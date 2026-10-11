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
   * Optional on the type (a hand-built value may omit it); `LocaleProvider`
   * always sets it.
   */
  messages?: ToolkitMessages
}

const DEFAULT_LOCALE = "en"

/**
 * Default used when a widget renders *outside* a {@link LocaleProvider} (e.g. a
 * standalone `show_*` widget the consumer hasn't wrapped yet). Unlike
 * `useTheme()`, the locale hooks degrade gracefully rather than throwing: a
 * missing wrapper echoes the key (visible + greppable) instead of crashing a
 * widget that is perfectly renderable in English.
 */
const DEFAULT_VALUE = {
  locale: DEFAULT_LOCALE,
  t: (key) => key,
  messages: resolveToolkitMessages(DEFAULT_LOCALE),
} satisfies Required<LocaleContextValue>

const LocaleContext = createContext<LocaleContextValue | null>(null)

/** The toolkit-only locale a {@link ToolkitLocaleFallback} binds (no `t`). */
interface ToolkitLocaleScope {
  locale: string
  messages: ToolkitMessages
}

const ToolkitLocaleFallbackContext = createContext<ToolkitLocaleScope | null>(null)

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
  const provided = useContext(LocaleContext)
  const fallback = useContext(ToolkitLocaleFallbackContext)
  return provided?.messages ?? fallback?.messages ?? DEFAULT_VALUE.messages
}

/**
 * The locale the toolkit's own text is in: the nearest {@link LocaleProvider}'s,
 * else a {@link ToolkitLocaleFallback}'s (the host's, inside `McpAppView`),
 * else `"en"`. Toolkit components format their numbers with it, so a count
 * always matches the language of the sentence around it. Internal: consumer
 * widgets read {@link useLocale}.
 */
export function useToolkitLocale(): string {
  const provided = useContext(LocaleContext)
  const fallback = useContext(ToolkitLocaleFallbackContext)
  return provided?.locale ?? fallback?.locale ?? DEFAULT_VALUE.locale
}

/**
 * Binds ONLY the toolkit's own strings and number format to `locale` for a
 * subtree — the fallback `McpAppView` mounts with the host's locale. It is not
 * a {@link LocaleProvider}: {@link useLocale} and {@link useTranslate} keep
 * their outside-a-provider behaviour (`"en"`, echoed keys) for consumer
 * widgets, and any `LocaleProvider` above or below wins over it.
 */
export function ToolkitLocaleFallback({
  locale,
  children,
}: {
  locale: string
  children: ReactNode
}): ReactNode {
  const value = useMemo<ToolkitLocaleScope>(
    () => ({ locale, messages: resolveToolkitMessages(locale) }),
    [locale],
  )
  return (
    <ToolkitLocaleFallbackContext.Provider value={value}>
      {children}
    </ToolkitLocaleFallbackContext.Provider>
  )
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
