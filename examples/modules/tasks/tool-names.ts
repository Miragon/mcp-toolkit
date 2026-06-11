/**
 * Tool-name constants for the `tasks` module.
 *
 * Centralised because the names are referenced from two sides that must agree:
 * the server registers them (`plugin.ts`) and the widget calls them back
 * (`widgets/TasksBoard.tsx` self-fetches `TASKS_BOARD_DATA`; the agentic
 * hand-offs name `SHOW_TASKS_BOARD` via `buildShowWidgetIntent`). A rename then
 * flows through this one file. Pure string constants → safe to import into the
 * browser widget bundle.
 */

/** Read view: renders the board widget (the eager `show_*` entry point). */
export const SHOW_TASKS_BOARD = "show_tasks_board"

/** App-only JSON feed (no UI) the board widget self-fetches on refresh. */
export const TASKS_BOARD_DATA = "tasks_board_data"

export const LIST_TASKS = "list_tasks"
export const CREATE_TASK = "create_task"
export const COMPLETE_TASK = "complete_task"
