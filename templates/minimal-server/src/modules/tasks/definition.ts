import type { AppDefinition } from "@miragon/mcp-toolkit-core"

/**
 * The module's static contract: its name and the widgets it ships.
 *
 * The board widget is *pushed* eagerly by the `show_tasks_board` tool via
 * `buildSingleWidgetView`, so it needs no pipeline keys: `requires` is empty
 * and `consumes` names the step `dataType` the bundle-side `adaptDataWidget`
 * resolves its `data` from. `steps: []` because this module owns its data
 * in-process rather than fetching it through a declarative step.
 */
export const definition: AppDefinition = {
  name: "tasks",
  steps: [],
  widgets: [
    {
      id: "tasks:board",
      description: "A task board: KPI counts by status and the task list.",
      requires: [],
      consumes: ["tasks:board"],
      size: "full",
    },
  ],
}
