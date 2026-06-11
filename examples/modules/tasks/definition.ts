import type { AppDefinition } from "@miragon/mcp-toolkit-core"

/**
 * The `tasks` module's static contract: its name and the widgets it ships.
 *
 * Unlike `articles` (which declares a pipeline `step` that resolves a key), the
 * board widget is *pushed* eagerly by the `show_tasks_board` tool via
 * `buildSingleWidgetView`, so it needs no pipeline keys: `requires` is empty and
 * `consumes` names the step `dataType` the host-side `adaptDataWidget` resolves
 * its `data` from. `steps: []` because this module owns its data in-process
 * rather than fetching it through a declarative step.
 */
export const definition: AppDefinition = {
  name: "tasks",
  steps: [],
  widgets: [
    {
      id: "tasks:board",
      description:
        "A task board: KPI counts by status, filterable task list, agentic add/complete.",
      requires: [],
      consumes: ["tasks:board"],
      size: "full",
    },
  ],
}
