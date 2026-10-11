import type { LocalizedText } from "../i18n/localized-text.js"

/**
 * How a widget or a pipeline step introduces itself to the PEOPLE using the
 * view builder: a name and a one-line summary in their language. The LLM keeps
 * reading `description` (it stays out of the builder's main UI) and the id stays
 * the technical handle, shown only as a quiet secondary line.
 *
 * Each text comes either inline (`title`: one string or one per locale) or as
 * an i18n key (`titleKey`) that the widget bundle resolves through the
 * translator of its `LocaleProvider`; a key the translator knows wins over the
 * inline text. Without either, the builder shows the id.
 */
export interface DisplayText {
  /**
   * The name the builder shows (palette, canvas cell, props sheet, data
   * sources): one string, or one per locale (`{ en: "Orders", de: "Bestellungen" }`).
   */
  title?: LocalizedText
  /** i18n key of {@link DisplayText.title}, resolved in the widget bundle; wins when the translator knows it. */
  titleKey?: string
  /** One line under the title in the builder palette: what it shows, in user words. */
  summary?: LocalizedText
  /** i18n key of {@link DisplayText.summary}, resolved like {@link DisplayText.titleKey}. */
  summaryKey?: string
}

/**
 * The JSON Schema keyword under which a `propsSchema` property carries its
 * {@link DisplayText} (`"x-display": { title: { en: "Data key", de: "Datenschlüssel" } }`).
 * The standard `title` keyword (a plain string, e.g. from zod's
 * `.meta({ title })`) is the fallback label, the property name the last one.
 * As a JSON Schema extension (`x-` prefix) it is ignored by validators.
 */
export const PROPS_SCHEMA_DISPLAY_KEYWORD = "x-display"
