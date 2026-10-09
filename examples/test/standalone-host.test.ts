import { afterEach, describe, expect, it, vi } from "vitest"
import server from "../standalone-host/index.js"

/**
 * The standard path's ordering rule, pinned on the example the docs point
 * at: `installToolkit` runs BEFORE the project's own `server.tool` calls.
 * The duplicate-name guard is installed by `installToolkit` and mcp-use has
 * no public tool listing, so a tool registered earlier is invisible to it —
 * an own tool named `render-view` or `create_task` would then be silently
 * replaced. Re-registering the example's own `echo` proves the guard saw it.
 */
describe("standalone-host", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("registers its own tools after installToolkit, so the name guard covers them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    server.tool({ name: "echo", description: "A second echo." }, () =>
      Promise.resolve({ content: [] }),
    )

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'Duplicate tool name "echo": already registered by application code',
    )
  })
})
