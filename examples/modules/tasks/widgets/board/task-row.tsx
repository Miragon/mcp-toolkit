import { useRef } from "react"
import { Check, ChevronDown, ChevronsUp, Equal } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  FOCUS_RING,
  Skeleton,
  TONE_BORDER,
  TONE_ICON,
  TONE_SOFT,
  cn,
  type ToneVariant,
} from "@miragon/mcp-toolkit-ui"
import type { Task, TaskPriority, TaskStatus } from "../../store.js"
import { useTasksText } from "../messages.js"

/** A task's status is a state, so it takes a status tone (tint, rim, foreground text). */
export const STATUS_TONE: Record<TaskStatus, ToneVariant> = {
  todo: "neutral",
  doing: "info",
  done: "success",
}

/**
 * Priority is an order, not a status: a neutral outline badge with an ordinal
 * icon. No primary fill (it would read as a selected control) and no danger
 * tone (nothing has failed).
 */
const PRIORITY_ICON = { high: ChevronsUp, medium: Equal, low: ChevronDown } as const

/** Small tone-tinted status pill, built from the shared `TONE_*` token maps. */
function StatusPill({ status }: { status: TaskStatus }) {
  const text = useTasksText()
  return (
    <span
      className={cn(
        "text-small inline-flex items-center rounded-md border px-2 py-0.5 font-semibold",
        TONE_SOFT[STATUS_TONE[status]],
        TONE_BORDER[STATUS_TONE[status]],
      )}
    >
      {text.status[status]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const text = useTasksText()
  const Icon = PRIORITY_ICON[priority]
  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {text.priority[priority]}
      <span className="sr-only"> {text.prioritySuffix}</span>
    </Badge>
  )
}

/**
 * Takes the place of Complete once the user completed the task here: the same
 * size, so nothing moves, and not a control, so the second click of a
 * double-click lands on nothing.
 */
function JustCompleted() {
  const text = useTasksText()
  return (
    <span className="text-muted-foreground inline-flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium select-none">
      <Check aria-hidden="true" className={cn("size-4", TONE_ICON.success)} />
      {text.justCompleted}
    </span>
  )
}

/**
 * One task. Complete moves the focus to the row before the button gives way
 * to {@link JustCompleted}: an unmounted button would drop the focus to the
 * document, and the next Tab would start over at the top (WCAG 2.4.3). From
 * the row, a screen reader reads the updated task and Tab goes on to the next
 * one.
 */
export function TaskRow({
  task,
  justCompleted,
  onComplete,
}: {
  task: Task
  /** The user completed this task here; it stays in place until a refresh. */
  justCompleted: boolean
  onComplete: (task: Task) => void
}) {
  const text = useTasksText()
  const row = useRef<HTMLDivElement>(null)
  const complete = () => {
    row.current?.focus({ preventScroll: true })
    onComplete(task)
  }
  return (
    <Card ref={row} tabIndex={-1} size="sm" className={FOCUS_RING}>
      <CardContent className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <PriorityBadge priority={task.priority} />
          <span
            className={cn(
              "truncate text-sm font-medium",
              task.status === "done" && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <StatusPill status={task.status} />
          {justCompleted ? (
            <JustCompleted />
          ) : (
            task.status !== "done" && (
              <Button
                variant="outline"
                size="sm"
                onClick={complete}
                aria-label={text.completeTask(task.title)}
              >
                {text.complete}
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** The loading placeholder in the board's geometry, announced as a status. */
export function BoardSkeleton() {
  const text = useTasksText()
  return (
    <div className="flex flex-col gap-4 p-6" role="status" aria-label={text.loading}>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
