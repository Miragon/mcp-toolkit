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
 * Format the clock time (hours and minutes) of `epochMs` in `locale`, in the
 * host's `timeZone` when it reports one: `14:32` / `02:32 PM`. An invalid tag
 * or zone falls back to English in the runtime's zone instead of throwing
 * inside a render.
 */
export function formatClockTime(
  epochMs: number,
  locale: string | undefined,
  timeZone?: string,
): string {
  const clock: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }
  try {
    return new Intl.DateTimeFormat(locale, { ...clock, timeZone }).format(epochMs)
  } catch {
    return new Intl.DateTimeFormat("en", clock).format(epochMs)
  }
}
