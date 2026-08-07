import { adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"
import { TasksBoard } from "../modules/tasks/widgets/TasksBoard.js"
import type { TasksBoardData } from "../modules/tasks/store.js"

/**
 * The shared widget map every view in this project renders. One place for
 * widget code; each `views/<name>/view.tsx` mounts it through
 * `McpToolkitApp`, so `render-view` compositions and the `show_tasks_board`
 * single-widget view resolve the same components.
 */
export const widgets = {
  "tasks:board": adaptDataWidget<TasksBoardData>(TasksBoard, "tasks:board"),
}
