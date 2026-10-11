import { useMemo, useState } from "react"
import { ListChecks, SearchX } from "lucide-react"
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  KpiGrid,
  ListFooter,
  LivePill,
  SectionHeading,
  WidgetHeader,
  formatCount,
  useDebouncedValue,
  useLocale,
  type FilterChip,
  type KpiCell,
} from "@miragon/mcp-toolkit-ui"
import { HostModelContext, useHostActions } from "@miragon/mcp-toolkit-ui/app"
import {
  countByStatus,
  type TaskCounts,
  type TaskPriority,
  type TaskStatus,
  type TasksBoardData,
} from "../store.js"
import { SHOW_TASKS_BOARD } from "../tool-names.js"
import { useTasksText } from "./messages.js"
import { BoardSkeleton, STATUS_TONE, TaskRow } from "./board/task-row.js"
import { useBoard, useCompletion } from "./board/use-board.js"

/**
 * TasksBoard: a hand-built, curated widget for the `tasks` module, and the
 * reference for the states and the language every widget owes its user.
 *
 * Data contract (see `.claude/skills/build-mcp-widget`):
 *   `show_tasks_board` → `structuredContent` (a `ViewStructuredContent`
 *   envelope) → `adaptDataWidget(TasksBoard, "tasks:board")` resolves the step
 *   whose `_dataType` is `"tasks:board"` and forwards `stepData.data` to this
 *   component's `data` prop. So this file never sees the envelope, just `data`.
 *
 * Dual-mode: when the host pushed `data` (the `show_*` path) it is rendered
 * verbatim; otherwise (a standalone embed, or a manual refresh) the widget
 * self-fetches the app-only `tasks_board_data` feed via `useToolQuery`. Fresh
 * fetches win over the initial seed so the Refresh button shows new data.
 *
 * Language: every word comes from the module's en/de catalog
 * (`messages.ts`, `useTasksText()`), and counts and times are formatted in the
 * widget's locale (`useLocale()`), which the app sets from the host.
 *
 * States: a failed self-fetch is an `ErrorState` with a retry (the raw reason
 * under Details, never as the message); an empty board and an empty filter
 * result are two different `EmptyState`s, each with its next step; writes and
 * refreshes report their outcome as a toast.
 *
 * Interaction: KPI cells filter by status, the `FilterBar` by text and
 * priority. "Complete" is a deterministic write (`complete_task` through
 * `useToolMutation`, shown done at once and rolled back if the call fails).
 * Adding a task needs a title from the user, so it stays a chat hand-off,
 * labelled as one ("Ask agent to add") and styled as the secondary action.
 */

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"]
const PRIORITIES: TaskPriority[] = ["high", "medium", "low"]
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }
const PAGE_SIZE = 8

/** The model-context line: what the user is looking at, and how to act on it. */
function describeBoard(c: TaskCounts): string {
  return (
    `The user is viewing the task board: ${c.total} ${c.total === 1 ? "task" : "tasks"} ` +
    `(${c.todo} to do, ${c.doing} in progress, ${c.done} done). Add tasks with create_task, ` +
    `finish them with complete_task, and re-render this board with ${SHOW_TASKS_BOARD}.`
  )
}

function formatTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date)
  } catch {
    return iso
  }
}

/** Search text, status and priority filters, and the page limit of the list. */
function useTaskFilter() {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const [priority, setPriority] = useState<TaskPriority | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const debouncedSearch = useDebouncedValue(search, 200)
  return {
    search,
    debouncedSearch,
    status,
    priority,
    limit,
    active: search.trim() !== "" || status !== null || priority !== null,
    setSearch: (next: string) => {
      setSearch(next)
      setLimit(PAGE_SIZE)
    },
    toggleStatus: (next: TaskStatus) => {
      setStatus((current) => (current === next ? null : next))
      setLimit(PAGE_SIZE)
    },
    togglePriority: (next: TaskPriority) => {
      setPriority((current) => (current === next ? null : next))
      setLimit(PAGE_SIZE)
    },
    clear: () => {
      setSearch("")
      setStatus(null)
      setPriority(null)
      setLimit(PAGE_SIZE)
    },
    showMore: () => setLimit((current) => current + PAGE_SIZE),
  }
}

export function TasksBoard({ data: pushed }: { data: TasksBoardData | null }) {
  const locale = useLocale()
  const text = useTasksText()
  const host = useHostActions()
  const { query, board, refresh } = useBoard(pushed)
  const { tasks, complete, pendingId } = useCompletion(board, () => void query.refetch())
  const filter = useTaskFilter()

  const { debouncedSearch, status: statusFilter, priority: priorityFilter } = filter
  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase()
    return tasks
      .filter(
        (task) =>
          (needle === "" || task.title.toLowerCase().includes(needle)) &&
          (!statusFilter || task.status === statusFilter) &&
          (!priorityFilter || task.priority === priorityFilter),
      )
      .sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      )
  }, [tasks, debouncedSearch, statusFilter, priorityFilter])

  // Loading / error states only matter on the self-fetch path (no pushed data).
  if (!board) {
    if (query.error) {
      return (
        <ErrorState
          className="m-4"
          title={text.loadFailed}
          description={text.loadFailedHint}
          details={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )
    }
    return <BoardSkeleton />
  }

  const counts = countByStatus(tasks)
  const visible = filtered.slice(0, filter.limit)
  const count = (n: number) => formatCount(n, locale)
  const askToAdd = () => host.askAi(text.addPrompt(SHOW_TASKS_BOARD))
  const askButton = (
    <Button variant="outline" size="sm" onClick={askToAdd}>
      {text.askToAdd}
    </Button>
  )

  const priorityChips: FilterChip[] = PRIORITIES.map((p) => ({
    id: p,
    label: text.priority[p],
    active: priorityFilter === p,
  }))
  const statusCell = (status: TaskStatus): KpiCell => ({
    label: text.status[status],
    value: count(counts[status]),
    tone: STATUS_TONE[status],
    onClick: () => filter.toggleStatus(status),
    // The accessible name starts with what the cell shows (WCAG 2.5.3).
    ariaLabel: text.statusCellLabel(text.status[status], count(counts[status])),
  })

  return (
    // The widget self-fetches, so it reports its own model context (rather
    // than relying on `adaptDataWidget`'s central `describeForModel`).
    // `HostModelContext`, not mcp-use's `ModelContext`: the direct import
    // throws outside a bootstrapView mount (e.g. the widget playground).
    <HostModelContext content={describeBoard(counts)}>
      <div className="bg-card text-card-foreground mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <WidgetHeader
          title={text.title}
          sub={
            <>
              <LivePill tone="success">{text.live}</LivePill>
              <span>
                {text.taskCount(counts.total, count(counts.total))} ·{" "}
                {text.updatedAt(formatTime(board.generatedAt, locale))}
              </span>
            </>
          }
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refresh()}
                disabled={query.isFetching}
              >
                {query.isFetching ? text.refreshing : text.refresh}
              </Button>
              {/* An empty board offers this step in its empty state instead. */}
              {counts.total > 0 && askButton}
            </>
          }
        />

        {counts.total === 0 ? (
          <EmptyState
            icon={<ListChecks />}
            title={text.emptyTitle}
            description={text.emptyHint}
            action={askButton}
          />
        ) : (
          <>
            {/* KPI strip: counts by status; each cell filters the list below. */}
            <KpiGrid
              boxed
              header={{ label: text.statusHeader }}
              cells={[
                statusCell("todo"),
                statusCell("doing"),
                statusCell("done"),
                { label: text.total, value: count(counts.total) },
              ]}
            />

            <div>
              <SectionHeading
                title={text.listTitle}
                hint={text.shown(count(filtered.length))}
                trailing={
                  filter.active ? (
                    <button
                      type="button"
                      onClick={filter.clear}
                      className="text-link text-small font-medium hover:underline"
                    >
                      {text.clearFilters}
                    </button>
                  ) : undefined
                }
              />

              <FilterBar
                search={filter.search}
                searchPlaceholder={text.filterPlaceholder}
                onSearchChange={filter.setSearch}
                chips={priorityChips}
                onChipToggle={(id) => filter.togglePriority(id as TaskPriority)}
              />

              {visible.length === 0 ? (
                <EmptyState
                  icon={<SearchX />}
                  title={text.noMatchTitle}
                  description={text.noMatchHint}
                  action={
                    <Button variant="outline" size="sm" onClick={filter.clear}>
                      {text.clearFilters}
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="mt-3 flex flex-col gap-2">
                    {visible.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        completing={pendingId === task.id}
                        onComplete={complete}
                      />
                    ))}
                  </div>
                  <ListFooter
                    shown={visible.length}
                    total={filtered.length}
                    hasMore={filtered.length > filter.limit}
                    onLoadMore={filter.showMore}
                    noun={text.listNoun}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </HostModelContext>
  )
}
