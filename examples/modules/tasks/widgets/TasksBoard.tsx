import { useMemo, useState } from "react"
import { ModelContext } from "mcp-use/react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CountPill,
  FilterBar,
  KpiGrid,
  ListFooter,
  LivePill,
  SectionHeading,
  Skeleton,
  TONE_SOFT,
  WidgetHeader,
  cn,
  useDebouncedValue,
  useToolQuery,
  type FilterChip,
  type ToneVariant,
} from "@miragon/mcp-toolkit-ui"
import { buildShowWidgetIntent, useHostActions } from "@miragon/mcp-toolkit-ui/app"
import type { Task, TaskPriority, TaskStatus, TasksBoardData } from "../store.js"
import { SHOW_TASKS_BOARD, TASKS_BOARD_DATA } from "../tool-names.js"

/**
 * TasksBoard — a hand-built, curated widget for the `tasks` module.
 *
 * Data contract (see `.claude/skills/build-mcp-widget`):
 *   `show_tasks_board` → `structuredContent` (a `ViewStructuredContent`
 *   envelope) → `adaptDataWidget(TasksBoard, "tasks:board")` resolves the step
 *   whose `_dataType` is `"tasks:board"` and forwards `stepData.data` to this
 *   component's `data` prop. So this file never sees the envelope — just `data`.
 *
 * Dual-mode: when the host pushed `data` (the `show_*` path) it is rendered
 * verbatim; otherwise (a standalone embed, or a manual refresh) the widget
 * self-fetches the app-only `tasks_board_data` feed via `useToolQuery`. Fresh
 * fetches win over the initial seed so the Refresh button shows new data.
 *
 * Everything else is deterministic, in-widget interaction (no model round-trip):
 * KPI cells filter by status, the `FilterBar` filters by text + priority. The
 * two boundary-crossing affordances (add a task, complete a task) hand a prompt
 * to the agent through `useHostActions`, which the host turns into the matching
 * `create_task` / `complete_task` + `show_tasks_board` calls.
 */

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"]
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
}
const STATUS_TONE: Record<TaskStatus, ToneVariant> = {
  todo: "neutral",
  doing: "info",
  done: "success",
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }
const PRIORITY_BADGE: Record<TaskPriority, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
}

/** The model-context line: what the user is looking at, and how to act on it. */
function describeBoard(board: TasksBoardData): string {
  const c = board.counts
  return (
    `The user is viewing the task board: ${c.total} task(s) — ${c.todo} to do, ` +
    `${c.doing} in progress, ${c.done} done. Add tasks with create_task, ` +
    `finish them with complete_task, and re-render this board with ${SHOW_TASKS_BOARD}.`
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

/** Small tone-tinted status pill, built from the shared `TONE_*` token maps. */
function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        TONE_SOFT[STATUS_TONE[status]],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: (task: Task) => void }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={PRIORITY_BADGE[task.priority]}>{task.priority}</Badge>
          <span
            className={cn(
              "truncate text-sm font-medium",
              task.status === "done" && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={task.status} />
          {task.status !== "done" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onComplete(task)}
              aria-label={`Complete task ${task.title}`}
            >
              Complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const PAGE_SIZE = 8

export function TasksBoard({ data: pushed }: { data: TasksBoardData | null }) {
  // Self-fetch the feed when the host pushed nothing; when it did, seed from
  // `pushed` and only hit the feed on an explicit refresh. `refetch()` runs even
  // while the query is disabled, and `query.data ?? pushed` then prefers the
  // freshly fetched board over the initial seed.
  const query = useToolQuery<TasksBoardData>(
    ["tasks", "board"],
    TASKS_BOARD_DATA,
    {},
    {
      enabled: pushed == null,
    },
  )
  const board = query.data ?? pushed ?? null

  const host = useHostActions()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const debouncedSearch = useDebouncedValue(search, 200)

  const tasks = board?.tasks ?? []
  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase()
    return tasks
      .filter((task) => {
        const matchesText = needle === "" || task.title.toLowerCase().includes(needle)
        const matchesStatus = !statusFilter || task.status === statusFilter
        const matchesPriority = !priorityFilter || task.priority === priorityFilter
        return matchesText && matchesStatus && matchesPriority
      })
      .sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      )
  }, [tasks, debouncedSearch, statusFilter, priorityFilter])

  const visible = filtered.slice(0, limit)

  // Loading / error states only matter on the self-fetch path (no pushed data).
  if (!board) {
    if (query.error) {
      return (
        <Card className="m-4">
          <CardContent className="text-destructive text-sm">{query.error.message}</CardContent>
        </Card>
      )
    }
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const counts = board.counts
  const priorityChips: FilterChip[] = (["high", "medium", "low"] as TaskPriority[]).map((p) => ({
    id: p,
    label: p,
    active: priorityFilter === p,
  }))

  function toggleStatus(status: TaskStatus) {
    setStatusFilter((current) => (current === status ? null : status))
    setLimit(PAGE_SIZE)
  }

  return (
    // The widget self-fetches, so it reports its own ModelContext (rather than
    // relying on `adaptDataWidget`'s central `describeForModel`).
    <ModelContext content={describeBoard(board)}>
      <div className="bg-card text-card-foreground mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <WidgetHeader
          icon="✓"
          iconTone="info"
          title="Task board"
          sub={
            <>
              <LivePill tone="success">Live</LivePill>
              <span>
                {counts.total} task{counts.total === 1 ? "" : "s"} · updated{" "}
                {formatTime(board.generatedAt)}
              </span>
            </>
          }
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                {query.isFetching ? "Refreshing…" : "Refresh"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() =>
                  host.askAi(
                    "Add a new task to my board: gather a short title (and optional " +
                      "priority) from me, then create it with create_task and show the " +
                      `updated board with ${SHOW_TASKS_BOARD}.`,
                  )
                }
              >
                Ask agent to add
              </Button>
            </>
          }
        />

        {/* KPI strip — counts by status; each cell is a click-to-filter control. */}
        <KpiGrid
          boxed
          header={{ label: "Status", badge: "click to filter" }}
          cells={[
            {
              label: STATUS_LABEL.todo,
              value: counts.todo,
              tone: "neutral",
              onClick: () => toggleStatus("todo"),
              ariaLabel: "Filter to to-do tasks",
            },
            {
              label: STATUS_LABEL.doing,
              value: counts.doing,
              tone: "info",
              onClick: () => toggleStatus("doing"),
              ariaLabel: "Filter to in-progress tasks",
            },
            {
              label: STATUS_LABEL.done,
              value: counts.done,
              tone: "success",
              onClick: () => toggleStatus("done"),
              ariaLabel: "Filter to done tasks",
            },
            { label: "Total", value: counts.total },
          ]}
        />

        <div>
          <SectionHeading
            title="Tasks"
            hint={`${filtered.length} shown`}
            trailing={
              statusFilter ? (
                <button
                  type="button"
                  onClick={() => setStatusFilter(null)}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  Clear “{STATUS_LABEL[statusFilter]}” filter
                </button>
              ) : undefined
            }
          />

          <FilterBar
            search={search}
            searchPlaceholder="Filter tasks…"
            onSearchChange={(next) => {
              setSearch(next)
              setLimit(PAGE_SIZE)
            }}
            chips={priorityChips}
            onChipToggle={(id) =>
              setPriorityFilter((current) => (current === id ? null : (id as TaskPriority)))
            }
          />

          <div className="mt-3 flex flex-col gap-2">
            {visible.length === 0 ? (
              <Card size="sm">
                <CardContent className="text-muted-foreground flex items-center justify-between text-sm">
                  <span>No tasks match the current filter.</span>
                  <CountPill tone="neutral">0</CountPill>
                </CardContent>
              </Card>
            ) : (
              visible.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onComplete={(t) =>
                    // Hand the mutation to the agent: it calls complete_task and
                    // then re-renders this board. `buildShowWidgetIntent` appends
                    // the `(use show_tasks_board)` hint the host reads.
                    host.showWidget(
                      buildShowWidgetIntent(
                        SHOW_TASKS_BOARD,
                        `Mark the task “${t.title}” (${t.id}) as done by calling complete_task`,
                      ),
                    )
                  }
                />
              ))
            )}
          </div>

          <ListFooter
            shown={visible.length}
            total={filtered.length}
            hasMore={filtered.length > limit}
            onLoadMore={() => setLimit((current) => current + PAGE_SIZE)}
            noun="tasks"
          />
        </div>
      </div>
    </ModelContext>
  )
}
