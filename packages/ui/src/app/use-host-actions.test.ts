import { describe, expect, it } from "vitest"
import { buildShowWidgetIntent } from "./use-host-actions.js"

describe("buildShowWidgetIntent", () => {
  it("appends the tool-name hint in parentheses so the agent can disambiguate", () => {
    expect(buildShowWidgetIntent("show_process_detail", "Show the process detail for `abc`")).toBe(
      "Show the process detail for `abc` (use show_process_detail)",
    )
  })

  it("keeps the description verbatim ahead of the hint", () => {
    expect(buildShowWidgetIntent("analytics_show_kpis", "Open the analytics dashboard")).toBe(
      "Open the analytics dashboard (use analytics_show_kpis)",
    )
  })
})
