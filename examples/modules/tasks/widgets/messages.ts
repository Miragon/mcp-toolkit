import { useLocale } from "@miragon/mcp-toolkit-ui"
import type { TaskPriority, TaskStatus } from "../store.js"

/**
 * The task board's UI text: one typed catalog per language, English and
 * German (with du), the same pattern as the toolkit's own catalog
 * (`packages/ui/src/locale/messages-*.ts`). The type makes a missing German
 * string a compile error; `examples/test/example-messages.test.ts` checks
 * the copy rules (no dash connector, "…", du, sentence case).
 *
 * The app decides the language: it wraps the view in a `LocaleProvider`
 * with the host's locale (see `examples/app-bundle/main.tsx`), and the widget
 * reads it with {@link useTasksText}. Counts and times are formatted with the
 * full locale tag (`de-AT`); the catalog is picked by its language (`de`).
 * Model-facing text (the model context, tool names) stays English.
 */
export interface TasksText {
  title: string
  live: string
  /** "4 tasks"; `formatted` is the count in the widget's locale. */
  taskCount: (count: number, formatted: string) => string
  updatedAt: (time: string) => string
  status: Record<TaskStatus, string>
  priority: Record<TaskPriority, string>
  /** Appended to the priority for screen readers ("High priority"). */
  prioritySuffix: string
  refresh: string
  refreshing: string
  refreshed: string
  refreshFailed: string
  refreshFailedHint: string
  /** The chat hand-off: adding a task needs a title from the user. */
  askToAdd: string
  /** The prompt the hand-off posts to the chat, in the user's language. */
  addPrompt: (showBoardTool: string) => string
  loading: string
  loadFailed: string
  loadFailedHint: string
  emptyTitle: string
  emptyHint: string
  statusHeader: string
  /**
   * What a click on a status cell does, read as the cell's description: its
   * visible label and figure stay its name (WCAG 2.5.3).
   */
  statusCellHint: string
  /** The same while the list shows only that status: a click shows all again. */
  statusCellActiveHint: string
  /** The KPI header's badge while a status filter is on (the cells have no pressed state). */
  statusFilterBadge: (status: string) => string
  total: string
  listTitle: string
  shown: (formatted: string) => string
  filterPlaceholder: string
  /** Clears the status filter and names it, since nothing else in the list does. */
  clearStatus: (status: string) => string
  clearFilters: string
  noMatchTitle: string
  noMatchHint: string
  /** The noun of the list footer ("Showing 8 of 12 tasks"). */
  listNoun: string
  complete: string
  /** Accessible name of Complete; starts with the visible label (WCAG 2.5.3). */
  completeTask: (title: string) => string
  /** Takes Complete's place once the task was completed here. */
  justCompleted: string
  completed: string
  completeFailed: string
  completeFailedHint: string
}

const en: TasksText = {
  title: "Task board",
  live: "Live",
  taskCount: (count, formatted) => `${formatted} ${count === 1 ? "task" : "tasks"}`,
  updatedAt: (time) => `updated ${time}`,
  status: { todo: "To do", doing: "In progress", done: "Done" },
  priority: { high: "High", medium: "Medium", low: "Low" },
  prioritySuffix: "priority",
  refresh: "Refresh",
  refreshing: "Refreshing…",
  refreshed: "Board updated",
  refreshFailed: "The board couldn't be refreshed",
  refreshFailedHint: "You're seeing the last loaded tasks. Try again in a moment.",
  askToAdd: "Ask agent to add",
  addPrompt: (tool) =>
    "Add a new task to my board: ask me for a short title (and an optional priority), " +
    `then create it with create_task and show the updated board with ${tool}.`,
  loading: "Loading tasks…",
  loadFailed: "The task board couldn't be loaded",
  loadFailedHint: "Try again. If it fails again, ask in the chat to show the board.",
  emptyTitle: "No tasks yet",
  emptyHint: "Ask the agent to add your first task. It shows up here.",
  statusHeader: "Status",
  statusCellHint: "Shows only these tasks",
  statusCellActiveHint: "Shows all tasks again",
  statusFilterBadge: (status) => `Only “${status}”`,
  total: "Total",
  listTitle: "Tasks",
  shown: (formatted) => `${formatted} shown`,
  filterPlaceholder: "Filter tasks…",
  clearStatus: (status) => `Show all, not only “${status}”`,
  clearFilters: "Clear filters",
  noMatchTitle: "No task matches this filter",
  noMatchHint: "Clear the filter to see all tasks again.",
  listNoun: "tasks",
  complete: "Complete",
  completeTask: (title) => `Complete “${title}”`,
  justCompleted: "Just completed",
  completed: "Task completed",
  completeFailed: "The task couldn't be completed",
  completeFailedHint: "It is still open. Try again in a moment.",
}

const de: TasksText = {
  title: "Aufgabenboard",
  live: "Live",
  taskCount: (count, formatted) => `${formatted} ${count === 1 ? "Aufgabe" : "Aufgaben"}`,
  updatedAt: (time) => `aktualisiert ${time}`,
  status: { todo: "Offen", doing: "In Arbeit", done: "Erledigt" },
  priority: { high: "Hoch", medium: "Mittel", low: "Niedrig" },
  prioritySuffix: "Priorität",
  refresh: "Aktualisieren",
  refreshing: "Wird aktualisiert…",
  refreshed: "Board aktualisiert",
  refreshFailed: "Das Board konnte nicht aktualisiert werden",
  refreshFailedHint: "Du siehst die zuletzt geladenen Aufgaben. Versuch es gleich noch einmal.",
  askToAdd: "Im Chat hinzufügen",
  addPrompt: (tool) =>
    "Leg eine neue Aufgabe auf meinem Board an: Frag mich nach einem kurzen Titel (und " +
    `optional einer Priorität), leg sie mit create_task an und zeig das Board mit ${tool}.`,
  loading: "Aufgaben werden geladen…",
  loadFailed: "Das Aufgabenboard konnte nicht geladen werden",
  loadFailedHint:
    "Versuch es noch einmal. Klappt es wieder nicht, lass dir das Board im Chat zeigen.",
  emptyTitle: "Noch keine Aufgaben",
  emptyHint: "Bitte den Agenten im Chat um deine erste Aufgabe. Danach steht sie hier.",
  statusHeader: "Status",
  statusCellHint: "Zeigt nur diese Aufgaben",
  statusCellActiveHint: "Zeigt wieder alle Aufgaben",
  statusFilterBadge: (status) => `Nur „${status}“`,
  total: "Gesamt",
  listTitle: "Aufgaben",
  shown: (formatted) => `${formatted} angezeigt`,
  filterPlaceholder: "Aufgaben filtern…",
  clearStatus: (status) => `Alle zeigen, nicht nur „${status}“`,
  clearFilters: "Filter zurücksetzen",
  noMatchTitle: "Keine Aufgabe passt zu diesem Filter",
  noMatchHint: "Setz den Filter zurück, um wieder alle Aufgaben zu sehen.",
  listNoun: "Aufgaben",
  complete: "Erledigen",
  completeTask: (title) => `Erledigen: „${title}“`,
  justCompleted: "Gerade erledigt",
  completed: "Aufgabe erledigt",
  completeFailed: "Die Aufgabe konnte nicht erledigt werden",
  completeFailedHint: "Die Aufgabe bleibt offen. Versuch es gleich noch einmal.",
}

/** Both catalogs, keyed by language. Exported for the copy-rule test. */
export const TASKS_TEXT: Readonly<Record<"en" | "de", TasksText>> = { en, de }

/** The catalog for a locale tag (`de-AT` → German); English for any other language. */
export function tasksText(locale: string): TasksText {
  return locale.trim().toLowerCase().split(/[-_]/)[0] === "de" ? de : en
}

/** The task board's text in the active locale (the nearest `LocaleProvider`). */
export function useTasksText(): TasksText {
  return tasksText(useLocale())
}
