import { SearchX } from "lucide-react"
import { Button, EmptyState, ListFooter } from "@miragon/mcp-toolkit-ui"
import type { Task } from "../../store.js"
import { useTasksText } from "../messages.js"
import { TaskRow } from "./task-row.js"

/**
 * The filtered list of the board: its rows, or the empty filter result with
 * its next step, and under either one the `ListFooter`.
 *
 * The footer stays mounted in BOTH branches. Its count line is the board's
 * one polite live region: at zero matches it stays in the tree (visually
 * hidden) and says "No entries", so a search or filter that finds nothing is
 * announced, and when the filter is cleared the region is still there to
 * announce the new count. Rendered only next to the rows, it would unmount
 * with them, nothing would be announced (`EmptyState` is static), and the
 * count would come back in a region created with its news already inside it,
 * which a screen reader does not read either.
 */
export function TaskList({
  visible,
  matching,
  hasMore,
  placedAs,
  onShowMore,
  onClearFilters,
  onComplete,
}: {
  /** The rows on screen (the first page of the matching tasks). */
  visible: readonly Task[]
  /** How many tasks match the filter. */
  matching: number
  /** More matching tasks than rows on screen. */
  hasMore: boolean
  /** Tasks the user completed here; they keep their place until a refresh. */
  placedAs: ReadonlyMap<string, unknown>
  onShowMore: () => void
  onClearFilters: () => void
  onComplete: (task: Task) => void
}) {
  const text = useTasksText()
  return (
    <>
      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={text.noMatchTitle}
          description={text.noMatchHint}
          action={
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              {text.clearFilters}
            </Button>
          }
        />
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              justCompleted={placedAs.has(task.id)}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}
      <ListFooter
        shown={visible.length}
        total={matching}
        hasMore={hasMore}
        onLoadMore={onShowMore}
        noun={text.listNoun}
      />
    </>
  )
}
