import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { Task } from "../../store.js"
import { TaskList } from "./task-list.js"

/**
 * The board's list keeps the kit's `ListFooter` mounted in both branches, so
 * its live region is in the tree before a filter finds nothing and is still
 * there when the filter is cleared (WCAG 4.1.3). Rendered only next to the
 * rows, the region would leave with them: nothing would announce the empty
 * result, and the returning count would land in a region created with it
 * inside, which a screen reader does not read. SSR markup, no DOM.
 */

const TASKS: Task[] = [
  {
    id: "t-1",
    title: "Draft the onboarding guide",
    status: "todo",
    priority: "high",
    createdAt: "2026-01-01",
    completedAt: null,
  },
  {
    id: "t-2",
    title: "Review the release notes",
    status: "doing",
    priority: "medium",
    createdAt: "2026-01-01",
    completedAt: null,
  },
]

function render(visible: readonly Task[], matching: number) {
  return renderToStaticMarkup(
    createElement(TaskList, {
      visible,
      matching,
      hasMore: false,
      placedAs: new Map(),
      onShowMore: () => {},
      onClearFilters: () => {},
      onComplete: () => {},
    }),
  )
}

/** The footer's count line, the list's one polite live region. */
const status = (html: string) =>
  /<p role="status" data-slot="list-footer-status"[^>]*>(.*?)<\/p>/.exec(html)?.[1]

describe("TaskList", () => {
  it("keeps the footer's live region next to an empty filter result, saying 'No entries'", () => {
    const html = render([], 0)
    expect(html).toContain("No task matches this filter")
    expect(status(html), "the live region left with the rows").toBeDefined()
    expect(status(html)).toContain("No entries")
  })

  it("announces the count in the same region next to the rows", () => {
    const html = render(TASKS, 2)
    expect(html).not.toContain("No task matches this filter")
    expect(status(html)).toContain("Showing 2 of 2 tasks")
  })
})
