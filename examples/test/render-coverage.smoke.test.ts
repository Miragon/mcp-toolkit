import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { STORIES } from "../widget-playground/stories.js"

/**
 * Render-coverage gate for the example widgets (FITNESS.md phase 5c).
 *
 * Same mechanics as `widget-fixture.smoke.test.ts`: server-side rendering via
 * `renderToStaticMarkup` through the real `WidgetFixtureHost` harness — no
 * jsdom (deliberately renounced), no MCP host, no backend. Two promises:
 *
 * 1. every widget component under `examples/modules/<module>/widgets/` has at
 *    least one playground Story (fs listing vs. the stories import), so a new
 *    widget cannot ship without a fixture-driven render path;
 * 2. every Story SSR-mounts through the harness without throwing and yields
 *    non-empty markup — the compensating control for the unmeasured JSX
 *    render surface (mutation testing does not cover it).
 */

const modulesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "modules")

/** Every `<module>/widgets/*.tsx` file, as { module, component-basename }. */
function moduleWidgetFiles(): { module: string; component: string }[] {
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const widgetsDir = path.join(modulesDir, entry.name, "widgets")
      if (!existsSync(widgetsDir)) return []
      return readdirSync(widgetsDir)
        .filter((file) => file.endsWith(".tsx"))
        .map((file) => ({ module: entry.name, component: path.basename(file, ".tsx") }))
    })
}

/** Component names the stories cover (widget function/display names). */
const storyWidgetNames = new Set(
  STORIES.map((story) => {
    const widget = story.widget as { displayName?: string; name?: string }
    return widget.displayName ?? widget.name ?? "(anonymous)"
  }),
)

describe("story completeness (modules → stories.ts)", () => {
  it("story ids are unique", () => {
    const ids = STORIES.map((story) => story.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("the fs listing finds widgets — the gate must never pass vacuously", () => {
    expect(
      moduleWidgetFiles().length,
      `No widget files found under ${modulesDir}/*/widgets — if the layout moved, update this test's listing instead of letting the gate go silent.`,
    ).toBeGreaterThan(0)
  })

  it("every module widget component has at least one Story", () => {
    const missing = moduleWidgetFiles()
      .filter((file) => !storyWidgetNames.has(file.component))
      .map((file) => `${file.module}/${file.component}`)
    expect(
      missing,
      `Widget(s) [${missing.join(", ")}] have no Story — add an entry to ` +
        "examples/widget-playground/stories.ts (fixture data only, no host/backend) whose " +
        "`widget` is the component named like the file, so it joins the SSR render gate below.",
    ).toEqual([])
  })

  it("the host-portability reference widget (OrderStatusCard) keeps its Story", () => {
    expect(
      storyWidgetNames.has("OrderStatusCard"),
      "OrderStatusCard lost its Story — restore it in examples/widget-playground/stories.ts " +
        "(it is the host-portable reference widget the docs and skills point at).",
    ).toBe(true)
  })
})

describe("every Story SSR-renders through WidgetFixtureHost", () => {
  for (const story of STORIES) {
    it(`${story.id} renders non-empty markup`, () => {
      const html = renderToStaticMarkup(
        createElement(WidgetFixtureHost, {
          widget: story.widget,
          data: story.data,
          dataType: story.dataType,
          tools: story.tools,
        }),
      )
      expect(html.length, `${story.id} rendered empty markup`).toBeGreaterThan(0)
    })
  }

  it("the empty-state story shows its empty-state copy, not a blank card", () => {
    const story = STORIES.find((s) => s.id === "tasks-board-empty")
    expect(story, "stories.ts lost the tasks-board-empty Story").toBeDefined()
    const html = renderToStaticMarkup(
      createElement(WidgetFixtureHost, {
        widget: story!.widget,
        data: story!.data,
        tools: story!.tools,
      }),
    )
    expect(html).toContain("No tasks match the current filter.")
  })
})
