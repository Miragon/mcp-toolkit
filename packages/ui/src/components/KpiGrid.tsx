import type { ReactNode } from "react"
import { FOCUS_RING_INSET } from "../lib/focus-ring.js"
import { TONE_DOT, type ToneVariant } from "../lib/tone-utils.js"

/**
 * Trend direction → tone. The tone shows ONLY as a dot before the trend line;
 * the figures stay in the foreground (no coloured digits, CI §3.3).
 */
const TREND_TONE: Record<"up" | "down" | "flat", ToneVariant> = {
  up: "danger",
  down: "success",
  flat: "neutral",
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
  /**
   * Tones the trend line's dot. `up` reads as bad (danger), `down` as good
   * (success); the trend text itself stays in the foreground.
   */
  trendDirection?: "up" | "down" | "flat"
  /**
   * Status of the metric (e.g. `"danger"` for a breached one), shown as a dot
   * before the label. The figure itself stays in the foreground colour.
   */
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

/** A small status dot; decorative — the label next to it carries the meaning. */
function ToneDot({ tone, size }: { tone: ToneVariant; size: "size-1.5" | "size-2" }) {
  return <span aria-hidden="true" className={`${size} shrink-0 rounded-full ${TONE_DOT[tone]}`} />
}

/**
 * The trend line under a value: a tone dot plus the trend text in the
 * foreground — never in a tone colour. Without a tone it stays quiet text.
 */
function KpiTrend({
  trend,
  direction,
}: {
  trend: ReactNode
  direction?: KpiCell["trendDirection"]
}) {
  const tone = direction ? TREND_TONE[direction] : "neutral"
  const textClass = tone === "neutral" ? "text-muted-foreground" : "text-foreground"
  return (
    <div className={`mt-1.5 inline-flex items-center gap-1.5 text-xs ${textClass}`}>
      {tone !== "neutral" && <ToneDot tone={tone} size="size-1.5" />}
      {trend}
    </div>
  )
}

/** One cell's label row, figure and optional trend — status as dots, never as coloured digits. */
function KpiCellContent({ cell }: { cell: KpiCell }) {
  return (
    <>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {cell.tone && cell.tone !== "neutral" && <ToneDot tone={cell.tone} size="size-2" />}
          <span>{cell.label}</span>
        </span>
        {cell.onClick && (
          <span aria-hidden="true" className="text-sm leading-none">
            ›
          </span>
        )}
      </div>
      <div className="text-foreground mt-1.5 text-2xl leading-none font-bold tracking-tight tabular-nums">
        {cell.value}
        {cell.fraction && (
          <span className="text-muted-foreground ml-0.5 text-sm font-normal">{cell.fraction}</span>
        )}
      </div>
      {cell.trend && <KpiTrend trend={cell.trend} direction={cell.trendDirection} />}
    </>
  )
}

/**
 * Bordered strip of KPI cells — the canonical way to show a row of headline
 * metrics in a widget (replaces the single-metric KPICard). Cells flow as
 * columns (1–6) and can be made clickable to drill into a detail view. Use
 * `boxed` + `header` for a labelled metric block; unboxed (default) renders the
 * lighter `border-y` strip. A cell's `tone` shows as a status dot next to its
 * label; figures stay in the foreground colour.
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
            <span className="border-border bg-card text-muted-foreground rounded-sm border px-1.5 py-0 text-[10px] font-medium normal-case">
              {header.badge}
            </span>
          )}
        </div>
      )}
      <div className={`grid ${colClass} ${stripClass}`}>
        {cells.map((cell, idx) => {
          const borderClass = idx < cells.length - 1 ? "border-border border-r" : ""
          const content = <KpiCellContent cell={cell} />
          return cell.onClick ? (
            <button
              key={idx}
              type="button"
              onClick={cell.onClick}
              aria-label={cell.ariaLabel}
              className={`hover:bg-muted cursor-pointer px-5 py-4 text-left transition-colors ${FOCUS_RING_INSET} ${borderClass}`}
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
