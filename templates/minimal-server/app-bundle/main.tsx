import { createRoot } from "react-dom/client"
import { McpToolkitApp, adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"
import { TaskListCard } from "../src/modules/tasks/widgets/TaskListCard.js"
import type { TasksBoardData } from "../src/modules/tasks/store.js"
import "./main.css"

// Widget-id map: every widget id declared in a plugin's `definition.ts` must
// appear here too, mapped to its React component. `adaptDataWidget` wraps a
// single-data `({ data })` widget so the framework resolves the step whose
// `_dataType` matches and forwards its data. The optional third argument
// describes the rendered view to the model.
const widgets = {
  "tasks:board": adaptDataWidget<TasksBoardData>(
    TaskListCard,
    "tasks:board",
    (d) =>
      `The user is viewing the task board: ${d.counts.total} task(s) — ` +
      `${d.counts.todo} to do, ${d.counts.doing} in progress, ${d.counts.done} done.`,
  ),
}

const root = document.getElementById("root")
if (!root) throw new Error("missing #root")
createRoot(root).render(<McpToolkitApp widgets={widgets} />)
