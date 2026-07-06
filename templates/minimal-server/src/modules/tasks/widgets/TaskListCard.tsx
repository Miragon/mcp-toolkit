import {
  Badge,
  Card,
  CardContent,
  KpiGrid,
  SectionHeading,
  Skeleton,
  WidgetHeader,
  cn,
} from "@miragon/mcp-toolkit-ui"
import type { Task, TaskStatus, TasksBoardData } from "../store.js"

/**
 * TaskListCard — a compact, purely presentational widget.
 *
 * Data contract: `show_tasks_board` → `structuredContent` →
 * `adaptDataWidget(TaskListCard, "tasks:board")` in `app-bundle/main.tsx`
 * resolves the step whose `_dataType` is `"tasks:board"` and forwards its data
 * to this `data` prop. This file never sees the envelope — just `data`.
 *
 * Host-portable: only `@miragon/mcp-toolkit-ui` primitives, no `mcp-use/react`.
 */

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
}

const PRIORITY_BADGE = {
  high: "destructive",
  medium: "default",
  low: "secondary",
} as const

function TaskRow({ task }: { task: Task }) {
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
        <span className="text-muted-foreground shrink-0 text-xs">{STATUS_LABEL[task.status]}</span>
      </CardContent>
    </Card>
  )
}

export function TaskListCard({ data }: { data: TasksBoardData | null }) {
  if (!data) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const { counts, tasks } = data
  return (
    <div className="bg-card text-card-foreground mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <WidgetHeader
        icon="✓"
        iconTone="info"
        title="Task board"
        sub={<span>{counts.total} task(s)</span>}
      />

      <KpiGrid
        boxed
        header={{ label: "Status" }}
        cells={[
          { label: STATUS_LABEL.todo, value: counts.todo, tone: "neutral" },
          { label: STATUS_LABEL.doing, value: counts.doing, tone: "info" },
          { label: STATUS_LABEL.done, value: counts.done, tone: "success" },
          { label: "Total", value: counts.total },
        ]}
      />

      <div>
        <SectionHeading title="Tasks" hint={`${tasks.length} shown`} />
        <div className="mt-3 flex flex-col gap-2">
          {tasks.length === 0 ? (
            <Card size="sm">
              <CardContent className="text-muted-foreground text-sm">No tasks yet.</CardContent>
            </Card>
          ) : (
            tasks.map((task) => <TaskRow key={task.id} task={task} />)
          )}
        </div>
      </div>
    </div>
  )
}
