import type { ReactNode } from "react"
import { TONE_BORDER, TONE_DOT, TONE_SOFT, type ToneVariant } from "../lib/tone-utils.js"

export interface LivePillProps {
  /** Status tone driving the dot, tint and border. Default `"info"`. */
  tone?: ToneVariant
  /** Pill label. Defaults to `"Live"`. */
  children?: ReactNode
}

/**
 * Small tinted pill with a pulsing dot. Use in a widget header to signal that
 * the data is live/real-time. Tone-based (tint, border and dot in the tone,
 * text in the foreground), so it inherits the active theme. The pulse stops
 * under `prefers-reduced-motion`.
 */
export function LivePill({ tone = "info", children }: LivePillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold ${TONE_SOFT[tone]} ${TONE_BORDER[tone]}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 animate-pulse rounded-full ${TONE_DOT[tone]}`}
      />
      {children ?? "Live"}
    </span>
  )
}

export interface CountPillProps {
  /** Status tone driving the tint and border. Default `"neutral"`. */
  tone?: ToneVariant
  /** The count/value to display (tabular numbers). */
  children: ReactNode
}

/**
 * Compact count badge — tabular numbers on a tinted background with a border
 * in the tone. Use as the right-aligned indicator on a list/group row (e.g. a
 * per-group item count). The number stays in the foreground in every tone
 * (no coloured digits): the tint and the border carry the tone.
 */
export function CountPill({ tone = "neutral", children }: CountPillProps) {
  return (
    <span
      className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-sm border px-2.5 py-0.5 text-sm font-semibold tabular-nums ${TONE_SOFT[tone]} ${TONE_BORDER[tone]}`}
    >
      {children}
    </span>
  )
}
