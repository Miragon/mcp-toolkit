/**
 * The toolkit's own UI strings — every caption, label, placeholder and
 * accessible name a toolkit component renders — as one typed catalog per
 * locale. Components read the active locale's catalog through
 * `useToolkitMessages()` (the nearest `LocaleProvider`), so a consumer only
 * passes a locale; nothing in the toolkit hard-codes English any more.
 *
 * Pure data + functions (no React, no `mcp-use/react`): browser-safe and
 * shared by the root barrel and the `./app` shell alike.
 */
import type { BuilderMessages, ToolkitMessages } from "./message-types.js"
import { de } from "./messages-de.js"
import { en } from "./messages-en.js"

export type {
  BuilderMessages,
  CommonMessages,
  FilterBarMessages,
  ListFooterMessages,
  PropsSheetMessages,
  RendererMessages,
  ToolkitMessages,
  ViewMessages,
} from "./message-types.js"

/** A partial override of a {@link ToolkitMessages} catalog, per section. */
export type ToolkitMessagesOverride = {
  [K in keyof ToolkitMessages]?: Partial<ToolkitMessages[K]>
}

/** The locales the toolkit ships a catalog for. English is the fallback. */
export const TOOLKIT_LOCALES = ["en", "de"] as const
export type ToolkitLocale = (typeof TOOLKIT_LOCALES)[number]

/** The shipped catalogs, keyed by {@link ToolkitLocale}. */
export const TOOLKIT_MESSAGES: Readonly<Record<ToolkitLocale, ToolkitMessages>> = { en, de }

/**
 * Map any BCP 47 tag (`"de-DE"`, `"de_AT"`, `"EN"`) onto a shipped catalog:
 * its primary language subtag when the toolkit ships it, English otherwise.
 */
export function resolveToolkitLocale(locale: string | undefined): ToolkitLocale {
  const primary = (locale ?? "").trim().toLowerCase().split(/[-_]/)[0]
  return (TOOLKIT_LOCALES as readonly string[]).includes(primary ?? "")
    ? (primary as ToolkitLocale)
    : "en"
}

/**
 * The catalog for `locale`, with `override` merged over it section by
 * section. Without an override the shipped catalog object itself is returned
 * (referentially stable — safe as a memo dependency).
 */
export function resolveToolkitMessages(
  locale: string | undefined,
  override?: ToolkitMessagesOverride,
): ToolkitMessages {
  const base = TOOLKIT_MESSAGES[resolveToolkitLocale(locale)]
  if (!override) return base
  return {
    common: { ...base.common, ...override.common },
    view: { ...base.view, ...override.view },
    listFooter: { ...base.listFooter, ...override.listFooter },
    filterBar: { ...base.filterBar, ...override.filterBar },
    pills: { ...base.pills, ...override.pills },
    renderer: { ...base.renderer, ...override.renderer },
    builder: mergeBuilder(base.builder, override.builder),
    propsSheet: { ...base.propsSheet, ...override.propsSheet },
  }
}

/**
 * The builder section with its override. An override of the deprecated
 * `done` still labels the commit button, Apply, unless it sets `apply` too.
 */
function mergeBuilder(
  base: BuilderMessages,
  override: Partial<BuilderMessages> | undefined,
): BuilderMessages {
  const merged = { ...base, ...override }
  if (override?.done !== undefined && override.apply === undefined) merged.apply = override.done
  return merged
}

/**
 * Format a count for display in `locale` (grouping separators per locale:
 * `1,234` / `1.234`). An invalid tag falls back to English instead of
 * throwing inside a render.
 */
export function formatCount(value: number, locale: string | undefined): string {
  try {
    return new Intl.NumberFormat(locale).format(value)
  } catch {
    return new Intl.NumberFormat("en").format(value)
  }
}

/**
 * The tag a toolkit sentence formats its numbers and times in: the language
 * its words come from (`textLocale`, mapped onto a shipped catalog the way
 * {@link resolveToolkitMessages} maps it), with the regional tag of that
 * language from `textLocale` or else `hostLocale`, so `en-GB` keeps its
 * 24-hour clock. A tag of another language never mixes in: German words
 * never carry an English clock ("Neu geladen um 4:32 PM Uhr").
 */
export function resolveFormatLocale(textLocale: string | undefined, hostLocale?: string): string {
  const language = resolveToolkitLocale(textLocale)
  const regionOfLanguage = (tag: string | undefined): string | undefined => {
    const normal = tag?.trim().replace(/_/g, "-")
    if (!normal?.includes("-")) return undefined
    return normal.toLowerCase().split("-")[0] === language ? normal : undefined
  }
  return regionOfLanguage(textLocale) ?? regionOfLanguage(hostLocale) ?? language
}

/**
 * Format the clock time (hours and minutes) of `epochMs` in `locale`, in the
 * host's `timeZone` when it reports one: `14:32` / `2:32 PM`. The hour is
 * `numeric`, so each locale pads it its own way (a 12-hour clock never shows
 * `02:32 PM`). A zone the runtime rejects (a Windows id, say) drops the zone,
 * never the locale; an invalid tag falls back to English. It never throws
 * inside a render.
 */
export function formatClockTime(
  epochMs: number,
  locale: string | undefined,
  timeZone?: string,
): string {
  const clock: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
  const attempts: readonly (readonly [string | undefined, string | undefined])[] = [
    [locale, timeZone],
    [locale, undefined],
    ["en", timeZone],
  ]
  for (const [tag, zone] of attempts) {
    try {
      return new Intl.DateTimeFormat(tag, { ...clock, timeZone: zone }).format(epochMs)
    } catch {
      // The next attempt drops what the runtime rejected.
    }
  }
  return new Intl.DateTimeFormat("en", clock).format(epochMs)
}
