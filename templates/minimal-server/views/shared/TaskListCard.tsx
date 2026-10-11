import { ChevronDown, ChevronsUp, Equal, ListChecks } from "lucide-react"
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  KpiGrid,
  SectionHeading,
  Skeleton,
  WidgetHeader,
  cn,
  formatCount,
  useLocale,
} from "@miragon/mcp-toolkit-ui"
import type { Task, TasksBoardData } from "../../src/modules/tasks/store.js"
import { taskBoardText, type TaskBoardText } from "./messages.js"

/**
 * TaskListCard — a compact, purely presentational widget.
 *
 * Data contract: `show_tasks_board` → `structuredContent` →
 * `adaptDataWidget(TaskListCard, "tasks:board")` in `widgets.tsx`
 * resolves the step whose `_dataType` is `"tasks:board"` and forwards its data
 * to this `data` prop. This file never sees the envelope — just `data`.
 *
 * Host-portable: only `@miragon/mcp-toolkit-ui` primitives, no `mcp-use/react`.
 * Icons come from `lucide-react`, pinned to the version the toolkit uses, so
 * they share its instance and the stroke its views set.
 *
 * Language: every word comes from the en/de catalog (`messages.ts`), picked by
 * the widget's locale (`useLocale()`, which the view sets from the host's
 * locale), and counts are formatted in that locale.
 */

/**
 * Priority is an order, not a status: a neutral outline badge with an ordinal
 * icon. A primary fill would read as a selected control, a danger tone as a
 * failure.
 */
const PRIORITY_ICON = { high: ChevronsUp, medium: Equal, low: ChevronDown } as const

function TaskRow({ task, text }: { task: Task; text: TaskBoardText }) {
  const Icon = PRIORITY_ICON[task.priority]
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline">
            <Icon aria-hidden="true" data-icon="inline-start" />
            {text.priority[task.priority]}
            <span className="sr-only"> {text.prioritySuffix}</span>
          </Badge>
          <span
            className={cn(
              "truncate text-sm font-medium",
              task.status === "done" && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
        </div>
        <span className="text-muted-foreground text-small shrink-0">
          {text.status[task.status]}
        </span>
      </CardContent>
    </Card>
  )
}

export function TaskListCard({ data }: { data: TasksBoardData | null }) {
  const locale = useLocale()
  const text = taskBoardText(locale)
  const count = (n: number) => formatCount(n, locale)
  if (!data) {
    return (
      <div className="flex flex-col gap-4 p-6" role="status" aria-label={text.loading}>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const { counts, tasks } = data
  return (
    <div className="bg-card text-card-foreground mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <WidgetHeader
        title={text.title}
        sub={<span>{text.taskCount(counts.total, count(counts.total))}</span>}
      />

      {tasks.length === 0 ? (
        <EmptyState icon={<ListChecks />} title={text.emptyTitle} description={text.emptyHint} />
      ) : (
        <>
          <KpiGrid
            boxed
            header={{ label: text.statusHeader }}
            cells={[
              { label: text.status.todo, value: count(counts.todo), tone: "neutral" },
              { label: text.status.doing, value: count(counts.doing), tone: "info" },
              { label: text.status.done, value: count(counts.done), tone: "success" },
              { label: text.total, value: count(counts.total) },
            ]}
          />

          <div>
            <SectionHeading title={text.listTitle} hint={text.shown(count(tasks.length))} />
            <div className="mt-3 flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} text={text} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
