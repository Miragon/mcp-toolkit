import type { ReactNode } from "react"
import { TONE_TEXT, type ToneVariant } from "../lib/tone-utils.js"

/** Trend direction → tone for the small trend line under a value. */
const TREND_TONE: Record<"up" | "down" | "flat", string> = {
  up: "text-danger",
  down: "text-success",
  flat: "text-muted-foreground",
}

export interface KpiCell {
  /** Caption shown above the value. */
  label: ReactNode
  /** The headline figure. Pre-format numbers for locale/currency. */
  value: ReactNode
  /** Small fraction shown next to the value, e.g. ` /14`. */
  fraction?: ReactNode
  /** Optional trend line under the value (e.g. `"+12% vs last week"`). */
  trend?: ReactNode
  /** Colours the trend line. `up` reads as bad (danger), `down` as good (success). */
  trendDirection?: "up" | "down" | "flat"
  /** Tone applied to the value text (e.g. `"danger"` for a breached metric). */
  tone?: ToneVariant
  /** When set, the cell renders as a button — turns a metric into a nav entry point. */
  onClick?: () => void
  /** Accessible label for the clickable cell (recommended when `onClick` is set). */
  ariaLabel?: string
}

const COL_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}

export interface KpiGridHeader {
  /** Group label, rendered uppercase in the strip header. */
  label: ReactNode
  /** Optional muted badge to the right of the label. */
  badge?: ReactNode
}

export interface KpiGridProps {
  /** The metric cells, flowed as columns (1–6, clamped). */
  cells: KpiCell[]
  /** Wrap the strip in a bordered card with an optional group `header`. Default `false`. */
  boxed?: boolean
  /** Group header shown above the strip when `boxed`. */
  header?: KpiGridHeader
}

/**
 * Bordered strip of KPI cells — the canonical way to show a row of headline
 * metrics in a widget (replaces the single-metric KPICard). Cells flow as
 * columns (1–6) and can be made clickable to drill into a detail view. Use
 * `boxed` + `header` for a labelled metric block; unboxed (default) renders the
 * lighter `border-y` strip.
 */
export function KpiGrid({ cells, boxed = false, header }: KpiGridProps) {
  const cols = Math.min(Math.max(cells.length, 1), 6)
  const colClass = COL_CLASS[cols] ?? "grid-cols-4"
  const wrapperClass = boxed ? "border-border overflow-hidden rounded-lg border" : ""
  const stripClass = boxed ? "" : "border-border border-y"
  return (
    <div className={wrapperClass}>
      {header && (
        <div className="border-border bg-muted text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-[11px] font-semibold tracking-wide uppercase">
          <span>{header.label}</span>
          {header.badge && (
            <span className="border-border bg-card text-muted-foreground rounded border px-1.5 py-0 text-[10px] font-medium normal-case">
              {header.badge}
            </span>
          )}
        </div>
      )}
      <div className={`grid ${colClass} ${stripClass}`}>
        {cells.map((cell, idx) => {
          const borderClass = idx < cells.length - 1 ? "border-border border-r" : ""
          const content = (
            <>
              <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium">
                <span>{cell.label}</span>
                {cell.onClick && (
                  <span aria-hidden="true" className="text-sm leading-none">
                    ›
                  </span>
                )}
              </div>
              <div
                className={`mt-1.5 text-2xl leading-none font-bold tracking-tight tabular-nums ${
                  (cell.tone && TONE_TEXT[cell.tone]) || "text-foreground"
                }`}
              >
                {cell.value}
                {cell.fraction && (
                  <span className="text-muted-foreground ml-0.5 text-sm font-normal">
                    {cell.fraction}
                  </span>
                )}
              </div>
              {cell.trend && (
                <div
                  className={`mt-1.5 text-xs ${
                    cell.trendDirection ? TREND_TONE[cell.trendDirection] : "text-muted-foreground"
                  }`}
                >
                  {cell.trend}
                </div>
              )}
            </>
          )
          return cell.onClick ? (
            <button
              key={idx}
              type="button"
              onClick={cell.onClick}
              aria-label={cell.ariaLabel}
              className={`hover:bg-muted focus-visible:ring-ring cursor-pointer px-5 py-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset ${borderClass}`}
            >
              {content}
            </button>
          ) : (
            <div key={idx} className={`px-5 py-4 ${borderClass}`}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
