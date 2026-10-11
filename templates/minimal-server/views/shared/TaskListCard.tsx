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
import type {
  Task,
  TaskPriority,
  TaskStatus,
  TasksBoardData,
} from "../../src/modules/tasks/store.js"

/**
 * TaskListCard — a compact, purely presentational widget.
 *
 * Data contract: `show_tasks_board` → `structuredContent` →
 * `adaptDataWidget(TaskListCard, "tasks:board")` in `app-bundle/main.tsx`
 * resolves the step whose `_dataType` is `"tasks:board"` and forwards its data
 * to this `data` prop. This file never sees the envelope — just `data`.
 *
 * Host-portable: only `@miragon/mcp-toolkit-ui` primitives, no `mcp-use/react`.
 * Icons come from `lucide-react`, pinned to the version the toolkit uses, so
 * they share its instance and the stroke its views set.
 */

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
}

/**
 * Priority is an order, not a status: a neutral outline badge with an ordinal
 * icon. A primary fill would read as a selected control, a danger tone as a
 * failure.
 */
const PRIORITY = {
  high: { label: "High", Icon: ChevronsUp },
  medium: { label: "Medium", Icon: Equal },
  low: { label: "Low", Icon: ChevronDown },
} as const satisfies Record<TaskPriority, unknown>

/** "1 task" / "3 tasks", the count in the widget's locale. */
function taskCount(n: number, locale: string): string {
  return `${formatCount(n, locale)} ${n === 1 ? "task" : "tasks"}`
}

function TaskRow({ task }: { task: Task }) {
  const { label, Icon } = PRIORITY[task.priority]
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline">
            <Icon aria-hidden="true" data-icon="inline-start" />
            {label}
            <span className="sr-only"> priority</span>
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
          {STATUS_LABEL[task.status]}
        </span>
      </CardContent>
    </Card>
  )
}

export function TaskListCard({ data }: { data: TasksBoardData | null }) {
  const locale = useLocale()
  if (!data) {
    return (
      <div className="flex flex-col gap-4 p-6" role="status" aria-label="Loading tasks…">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const { counts, tasks } = data
  return (
    <div className="bg-card text-card-foreground mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <WidgetHeader title="Task board" sub={<span>{taskCount(counts.total, locale)}</span>} />

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No tasks yet"
          description="Ask the agent to add a task, then show the board again."
        />
      ) : (
        <>
          <KpiGrid
            boxed
            header={{ label: "Status" }}
            cells={[
              {
                label: STATUS_LABEL.todo,
                value: formatCount(counts.todo, locale),
                tone: "neutral",
              },
              { label: STATUS_LABEL.doing, value: formatCount(counts.doing, locale), tone: "info" },
              {
                label: STATUS_LABEL.done,
                value: formatCount(counts.done, locale),
                tone: "success",
              },
              { label: "Total", value: formatCount(counts.total, locale) },
            ]}
          />

          <div>
            <SectionHeading title="Tasks" hint={`${formatCount(tasks.length, locale)} shown`} />
            <div className="mt-3 flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
