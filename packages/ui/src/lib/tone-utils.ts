/**
 * Single source of truth for the semantic "tones" used across the tone-aware
 * components (`Pills`, `KpiGrid`, `WidgetHeader`, …).
 *
 * Each tone maps to the status tokens defined in `globals.css`
 * (`--danger`, `--warning`, `--success`, `--info`) plus the shadcn neutral ramp
 * for the `neutral` tone. All tokens carry light + dark values, so these class
 * strings re-theme automatically — change a tone in one place instead of
 * hand-rolling `tone === "x" ? "…" : "…"` ternaries at every call site.
 */
export type ToneVariant = "neutral" | "info" | "success" | "warning" | "danger"

/** Tinted background + readable foreground — badges, icon tiles, pills. */
export const TONE_SOFT: Record<ToneVariant, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
}

/** Solid dot color — status dots next to a label. */
export const TONE_DOT: Record<ToneVariant, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
}

/** Foreground-only color — metric values, inline emphasis. */
export const TONE_TEXT: Record<ToneVariant, string> = {
  neutral: "text-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
}
