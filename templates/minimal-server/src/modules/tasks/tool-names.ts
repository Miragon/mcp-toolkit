/**
 * Tool-name constants, centralised because two sides must agree: the server
 * registers them (`plugin.ts`) and the widget bundle may call them back.
 * Pure strings → safe to import into the browser bundle.
 */

/** Read view: renders the board widget (the eager `show_*` entry point). */
export const SHOW_TASKS_BOARD = "show_tasks_board"

/** App-only JSON feed (no UI) a widget can self-fetch on refresh. */
export const TASKS_BOARD_DATA = "tasks_board_data"

export const LIST_TASKS = "list_tasks"
export const CREATE_TASK = "create_task"
