import type { TaskPriority, TaskStatus } from "../../src/modules/tasks/store.js"

/**
 * The task board's UI text: one typed catalog per language, English and
 * German (with du), the same pattern as the toolkit's own catalog. The type
 * makes a missing German string a compile error.
 *
 * The view decides the language: `views/<tool>/view.tsx` wraps the app in a
 * `LocaleProvider` with the host's locale, and the widget reads it with
 * `useLocale()` and picks its catalog with {@link taskBoardText}. Counts are
 * formatted with the full locale tag (`de-AT`); the catalog is picked by its
 * language (`de`). Model-facing text (the model context in `widgets.tsx`)
 * stays English.
 *
 * Add a language: add its catalog below and its case to `taskBoardText`.
 */
export interface TaskBoardText {
  title: string
  /** "4 tasks"; `formatted` is the count in the widget's locale. */
  taskCount: (count: number, formatted: string) => string
  status: Record<TaskStatus, string>
  priority: Record<TaskPriority, string>
  /** Appended to the priority for screen readers ("High priority"). */
  prioritySuffix: string
  loading: string
  emptyTitle: string
  emptyHint: string
  statusHeader: string
  total: string
  listTitle: string
  /** "3 shown"; `formatted` is the count in the widget's locale. */
  shown: (formatted: string) => string
}

const en: TaskBoardText = {
  title: "Task board",
  taskCount: (count, formatted) => `${formatted} ${count === 1 ? "task" : "tasks"}`,
  status: { todo: "To do", doing: "In progress", done: "Done" },
  priority: { high: "High", medium: "Medium", low: "Low" },
  prioritySuffix: "priority",
  loading: "Loading tasks…",
  emptyTitle: "No tasks yet",
  emptyHint: "Ask the agent to add a task, then show the board again.",
  statusHeader: "Status",
  total: "Total",
  listTitle: "Tasks",
  shown: (formatted) => `${formatted} shown`,
}

const de: TaskBoardText = {
  title: "Aufgabenboard",
  taskCount: (count, formatted) => `${formatted} ${count === 1 ? "Aufgabe" : "Aufgaben"}`,
  status: { todo: "Offen", doing: "In Arbeit", done: "Erledigt" },
  priority: { high: "Hoch", medium: "Mittel", low: "Niedrig" },
  prioritySuffix: "Priorität",
  loading: "Aufgaben werden geladen…",
  emptyTitle: "Noch keine Aufgaben",
  emptyHint: "Bitte den Agenten im Chat um eine Aufgabe und lass dir das Board dann neu zeigen.",
  statusHeader: "Status",
  total: "Gesamt",
  listTitle: "Aufgaben",
  shown: (formatted) => `${formatted} angezeigt`,
}

/** Both catalogs, keyed by language. */
export const TASK_BOARD_TEXT: Readonly<Record<"en" | "de", TaskBoardText>> = { en, de }

/** The catalog for a locale tag (`de-AT` → German); English for any other language. */
export function taskBoardText(locale: string): TaskBoardText {
  return locale.trim().toLowerCase().split(/[-_]/)[0] === "de" ? de : en
}
