import { useLocale } from "@miragon/mcp-toolkit-ui"

/**
 * The article card's UI text: one typed catalog per language, English and
 * German (with du), the same pattern as the tasks and orders modules. The
 * app sets the locale from the host; the card reads it with
 * {@link useArticlesText}.
 */
export interface ArticlesText {
  noArticleTitle: string
  noArticleHint: string
  loading: string
  loadFailed: string
  loadFailedHint: string
  /** "by Ada · May 21, 2026" */
  byline: (author: string, date: string) => string
}

const en: ArticlesText = {
  noArticleTitle: "No article selected",
  noArticleHint: "Ask in the chat for the article you want to see.",
  loading: "Loading the article…",
  loadFailed: "The article couldn't be loaded",
  loadFailedHint: "Try again. If it fails again, check that the article still exists.",
  byline: (author, date) => `by ${author} · ${date}`,
}

const de: ArticlesText = {
  noArticleTitle: "Kein Artikel ausgewählt",
  noArticleHint: "Bitte im Chat um den Artikel, den du sehen willst.",
  loading: "Artikel wird geladen…",
  loadFailed: "Der Artikel konnte nicht geladen werden",
  loadFailedHint:
    "Versuch es noch einmal. Klappt es wieder nicht, prüf, ob es den Artikel noch gibt.",
  byline: (author, date) => `von ${author} · ${date}`,
}

/** Both catalogs, keyed by language. Exported for the copy-rule test. */
export const ARTICLES_TEXT: Readonly<Record<"en" | "de", ArticlesText>> = { en, de }

/** The catalog for a locale tag (`de-AT` → German); English for any other language. */
export function articlesText(locale: string): ArticlesText {
  return locale.trim().toLowerCase().split(/[-_]/)[0] === "de" ? de : en
}

/** The article card's text in the active locale (the nearest `LocaleProvider`). */
export function useArticlesText(): ArticlesText {
  return articlesText(useLocale())
}

/** An ISO date (`2026-05-21`) as a medium date in `locale`; anything else verbatim. */
export function formatPublished(iso: string, locale: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date)
  } catch {
    return iso
  }
}
