import { describe, expect, it, vi } from "vitest"
import { mountMcpToolkitApp } from "./mcp-toolkit-app.js"

/**
 * The mount order behind K13 (toolkit#176): `mountMcpToolkitApp` installs the
 * tool-result observer BEFORE `bootstrapView` connects the view to its host,
 * so the observer sees the handshake and the view never mistakes a slow tool
 * for a stripped result.
 */

const calls = vi.hoisted(() => ({ order: [] as string[] }))

vi.mock(import("../lib/tool-result-observer.js"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    installToolResultObserver: () => {
      calls.order.push("installToolResultObserver")
      return null
    },
  }
})

vi.mock(import("mcp-use/react"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    bootstrapView: (() => {
      calls.order.push("bootstrapView")
    }) as unknown as typeof actual.bootstrapView,
  }
})

describe("mountMcpToolkitApp", () => {
  it("installs the tool-result observer before bootstrapView connects to the host", () => {
    calls.order = []
    mountMcpToolkitApp({ widgets: {} })
    expect(calls.order).toEqual(["installToolResultObserver", "bootstrapView"])
  })
})
