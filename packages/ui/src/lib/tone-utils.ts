/**
 * Single source of truth for the semantic "tones" used across the tone-aware
 * components (`Pills`, `KpiGrid`, `WidgetHeader`, `Badge`, …).
 *
 * Every status tone has THREE roles (Miragon CI §3.3), each its own token in
 * `theme.css` with light and dark values:
 *
 * | Role                         | Token           | Map            |
 * | ---------------------------- | --------------- | -------------- |
 * | fill, dot, border, icon      | `--<tone>`      | `TONE_DOT`, `TONE_BORDER`, `TONE_ICON` |
 * | tint (badge/banner surface)  | `--<tone>-soft` | `TONE_SOFT`    |
 * | text                         | `--<tone>-ink`  | `TONE_TEXT`, `TONE_SOFT` |
 *
 * Status is never text in its own colour: success and warning reach only
 * 1.67:1 / 1.83:1 on white, so their ink is the foreground and the tone shows
 * as a dot, icon or border NEXT to the text. In dark mode the colours are the
 * `-hell` values and the tints are transparent (no tinted fills on dark).
 * The `neutral` tone reuses the muted ramp.
 *
 * Change a tone here, in one place, instead of hand-rolling
 * `tone === "x" ? "…" : "…"` ternaries at every call site.
 */
export type ToneVariant = "neutral" | "info" | "success" | "warning" | "danger"

/** Tinted surface + the tone's readable text colour — badges, pills, banners. */
export const TONE_SOFT: Record<ToneVariant, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
}

/** Solid dot colour — a status dot next to a label. */
export const TONE_DOT: Record<ToneVariant, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
}

/**
 * The tone's TEXT colour (its `-ink` role) — inline emphasis. Success and
 * warning resolve to the foreground on light: pair the text with a
 * {@link TONE_DOT} or {@link TONE_ICON} to show the tone.
 */
export const TONE_TEXT: Record<ToneVariant, string> = {
  neutral: "text-foreground",
  info: "text-info-ink",
  success: "text-success-ink",
  warning: "text-warning-ink",
  danger: "text-danger-ink",
}

/** Border colour in the tone — the rim of a tinted badge, banner or toast. */
export const TONE_BORDER: Record<ToneVariant, string> = {
  neutral: "border-border",
  info: "border-info",
  success: "border-success",
  warning: "border-warning",
  danger: "border-danger",
}

/**
 * Icon colour in the tone (SVG `currentColor`). For icons only — never for
 * text: an icon next to its label carries the tone, the label stays readable.
 */
export const TONE_ICON: Record<ToneVariant, string> = {
  neutral: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
}
