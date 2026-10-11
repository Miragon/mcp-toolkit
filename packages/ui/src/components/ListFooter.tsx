import { FOCUS_RING } from "../lib/focus-ring.js"
import { cn } from "../lib/utils.js"
import { useToolkitLocale, useToolkitMessages } from "../locale/locale-provider.js"
import type { ListFooterMessages } from "../locale/message-types.js"
import { formatCount } from "../locale/toolkit-messages.js"

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
  /** Plural noun for the count, e.g. `"instances"`. Default: the locale's word for rows. */
  noun?: string
  /**
   * A new first page is in flight while these rows stay on screen (a search,
   * a filter, a refetch): the status line adds a visible "Updating…".
   */
  refreshing?: boolean
  /**
   * The rows on screen are the PREVIOUS result (a changed search or filter is
   * in flight or failed): the count and "Load more" hide, so the old count
   * never reads as the new search's answer.
   */
  stale?: boolean
  /** Override strings of the active catalog's `listFooter` section. */
  labels?: Partial<ListFooterMessages>
  /**
   * Make the count line a polite live region (`role="status"`). Default
   * `true`. Set `false` only where the caller already announces the count in
   * a live region of its own, so a screen reader hears it once.
   */
  announce?: boolean
  className?: string
}

/**
 * Footer for a paginated list: an honest "Showing X of Y" total plus an
 * explicit "Load more" control. Deliberately not infinite scroll — the user
 * gets the total, a reachable footer, and control over fetching. The count
 * is a polite live region (`role="status"`), so a keyboard or screen-reader
 * user hears the new total after "Load more" or a filter change; while a
 * first page is in flight it also says "Updating…". Renders nothing when
 * there is nothing to count and nothing in flight. Text and number format
 * follow the active locale (`LocaleProvider`, else the host's inside
 * `McpAppView`).
 */
export function ListFooter({
  shown,
  total,
  hasMore,
  loadingMore = false,
  onLoadMore,
  noun,
  refreshing = false,
  stale = false,
  labels,
  announce = true,
  className,
}: ListFooterProps) {
  const locale = useToolkitLocale()
  const listFooter = { ...useToolkitMessages().listFooter, ...labels }
  const counted = total > 0 && !stale
  if (!counted && !refreshing) return null
  return (
    <div
      data-slot="list-footer"
      className={cn(
        "text-small text-muted-foreground flex items-center justify-between gap-3 px-1 py-2",
        className,
      )}
    >
      <p
        role={announce ? "status" : undefined}
        data-slot="list-footer-status"
        className="flex flex-wrap items-center gap-x-2"
      >
        {counted && (
          <span>
            {listFooter.showing({
              shown: formatCount(shown, locale),
              total: formatCount(total, locale),
              noun: noun ?? listFooter.defaultNoun,
            })}
          </span>
        )}
        {refreshing && <span data-slot="list-footer-updating">{listFooter.updating}</span>}
      </p>
      {counted && hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className={`border-border text-foreground hover:border-focus hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${FOCUS_RING}`}
        >
          {loadingMore ? listFooter.loadingMore : listFooter.loadMore}
        </button>
      )}
    </div>
  )
}
