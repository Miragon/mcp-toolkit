import { useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../primitives/table.js"
import { cn } from "../lib/utils.js"

export interface DataTableColumn {
  key: string
  label: string
  align?: "left" | "right" | "center"
  format?: "currency" | "number" | "date"
  sortable?: boolean
}

export interface DataTableLabels {
  /** Template for the pagination range label. Defaults to `"{from}–{to} of {total}"`. */
  range?: (from: number, to: number, total: number) => string
  previous?: string
  next?: string
}

interface DataTableProps {
  columns: DataTableColumn[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[]
  className?: string
  pageSize?: number
  /**
   * Locale used for number/currency formatting. Defaults to `"en-US"`. Consumers
   * that need German formatting pass `locale="de-DE"` and `currency="EUR"`.
   */
  locale?: string
  currency?: string
  labels?: DataTableLabels
}

const DEFAULT_LABELS: Required<DataTableLabels> = {
  range: (from, to, total) => `${from}–${to} of ${total}`,
  previous: "← Previous",
  next: "Next →",
}

/** Converts an unknown cell value to a display string. Objects are JSON-serialized. */
function safeString(value: unknown): string {
  if (typeof value === "object" && value !== null) return JSON.stringify(value)
  return String(value)
}

function formatValue(
  value: unknown,
  format: DataTableColumn["format"] | undefined,
  locale: string,
  currency: string,
): string {
  if (value == null) return "—"
  if (format === "currency") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value))
  }
  if (format === "number") {
    return new Intl.NumberFormat(locale).format(Number(value))
  }
  if (format === "date") {
    return safeString(value)
  }
  return safeString(value)
}

function getSortValue(value: unknown, format?: DataTableColumn["format"]): string | number {
  if (value == null) return ""
  if (format === "currency" || format === "number") return Number(value)
  return safeString(value).toLowerCase()
}

export function DataTable({
  columns,
  rows,
  className,
  pageSize,
  locale = "en-US",
  currency = "USD",
  labels,
}: DataTableProps) {
  const effectiveLabels = { ...DEFAULT_LABELS, ...labels }
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    return [...rows].sort((a, b) => {
      const va = getSortValue(a[sortKey], col?.format)
      const vb = getSortValue(b[sortKey], col?.format)
      if (va < vb) return sortDir === "asc" ? -1 : 1
      if (va > vb) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [rows, sortKey, sortDir, columns])

  const totalPages = pageSize ? Math.ceil(sorted.length / pageSize) : 1
  const visible = pageSize ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(0)
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : undefined,
                  col.sortable !== false && "hover:text-foreground cursor-pointer select-none",
                )}
                onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : undefined
                  }
                >
                  {formatValue(row[col.key], col.format, locale, currency)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pageSize && totalPages > 1 && (
        <div className="text-muted-foreground flex items-center justify-between px-2 py-3 text-sm">
          <span>
            {effectiveLabels.range(
              page * pageSize + 1,
              Math.min((page + 1) * pageSize, sorted.length),
              sorted.length,
            )}
          </span>
          <div className="flex gap-1">
            <button
              className="hover:bg-accent rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              {effectiveLabels.previous}
            </button>
            <button
              className="hover:bg-accent rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              {effectiveLabels.next}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
