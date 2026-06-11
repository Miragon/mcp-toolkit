import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { WidgetFixtureHost, FixtureCallToolRegistry } from "@miragon/mcp-toolkit-ui/app"
import CustomerCard from "../customers-upstream/widget/CustomerCard.js"

/**
 * Smoke test for the widget harness. Renders a real example widget through
 * `WidgetFixtureHost` with fixture data and asserts it mounts and shows the
 * fixture — without a real MCP host or backend.
 *
 * This uses server-side rendering (`renderToStaticMarkup`) rather than a DOM:
 * `@testing-library/react` / `jsdom` are not dependencies of this workspace,
 * and CustomerCard renders purely from its `keys` prop, so SSR exercises the
 * full props path (host install, AppQueryProvider, widget mount) the harness
 * sets up. The host-bridge effects (window.openai, model-context flush) are
 * covered by the pure `FixtureCallToolRegistry` unit tests in the ui package;
 * here we only assert the fixture reaches the widget.
 */
describe("WidgetFixtureHost (smoke)", () => {
  it("mounts an example widget with fixture data and no real host", () => {
    const html = renderToStaticMarkup(
      createElement(WidgetFixtureHost, {
        widget: CustomerCard,
        data: {
          "customers:customer": {
            id: "c-1",
            name: "Miravelo Leasing GmbH",
            email: "ops@miravelo.example",
            tier: "gold",
            since: "2021-08-03",
          },
        },
      }),
    )

    // The widget rendered its fixture, not a loading/error state.
    expect(html).toContain("Miravelo Leasing GmbH")
    expect(html).toContain("ops@miravelo.example")
    expect(html).toContain("gold")
  })

  it("does not require a real callTool — fixtures drive the registry", async () => {
    const registry = new FixtureCallToolRegistry({
      "articles_get-article": (args: Record<string, unknown>) => ({
        id: args.id,
        title: `Article ${String(args.id)}`,
      }),
    })

    const res = await registry.call("articles_get-article", { id: "x9" })

    expect(res.structuredContent).toEqual({ id: "x9", title: "Article x9" })
  })
})
