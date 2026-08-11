import { adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"
import { TaskListCard } from "./TaskListCard.js"
import type { TasksBoardData } from "../../src/modules/tasks/store.js"

/**
 * The shared widget map every view in this project renders. Widget code lives
 * HERE (under `views/`) on purpose: the mcp-use dev server routes only
 * `views/*` through its Vite middleware, so browser modules elsewhere in the
 * project 404 in dev. Type-only imports from `src/` (like `TasksBoardData`)
 * are fine — they are erased at build time.
 *
 * Every widget id declared in a plugin's `definition.ts` must appear here,
 * mapped to its React component. `adaptDataWidget` wraps a single-data
 * `({ data })` widget so the framework resolves the step whose `_dataType`
 * matches and forwards its data; the optional third argument describes the
 * rendered view to the model.
 */
export const widgets = {
  "tasks:board": adaptDataWidget<TasksBoardData>(
    TaskListCard,
    "tasks:board",
    (d) =>
      `The user is viewing the task board: ${d.counts.total} task(s) — ` +
      `${d.counts.todo} to do, ${d.counts.doing} in progress, ${d.counts.done} done.`,
  ),
}
