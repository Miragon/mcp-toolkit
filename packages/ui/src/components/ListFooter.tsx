export interface ListFooterProps {
  /** How many rows are currently rendered. */
  shown: number
  /** The total number of rows available. */
  total: number
  /** Whether more rows can be loaded. */
  hasMore: boolean
  /** Disables the button and shows a loading label while a fetch is in flight. */
  loadingMore?: boolean
  /** Called when the user asks for the next page. */
  onLoadMore: () => void
  /** Plural noun for the count, e.g. `"instances"`. Default `"rows"`. */
  noun?: string
}

/**
 * Footer for a paginated list: an honest "Showing X of Y" total plus an
 * explicit "Load more" control. Deliberately not infinite scroll — the user
 * gets the total, a reachable footer, and control over fetching. Renders
 * nothing when `total` is 0.
 */
export function ListFooter({
  shown,
  total,
  hasMore,
  loadingMore = false,
  onLoadMore,
  noun = "rows",
}: ListFooterProps) {
  if (total <= 0) return null
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-3 px-1 py-2 text-xs">
      <span>
        Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  )
}
