import { describe, it, expect, vi } from "vitest"
import { createRemoteWidgetLoader } from "./remote-widget-loader.js"
import type { WidgetComponent } from "./widget-renderer.js"
import { TOOLKIT_REACT_MAJOR } from "../index.js"

const stubComponent: WidgetComponent = () => null

describe("createRemoteWidgetLoader", () => {
  it("fetches the resource, evaluates it, and returns the default export", async () => {
    const fetchResource = vi.fn().mockResolvedValue("// bundle source")
    const evaluateBundle = vi.fn().mockResolvedValue({ default: stubComponent })
    const loader = createRemoteWidgetLoader({ fetchResource, evaluateBundle })

    const component = await loader("items-ui:item-card", "ui://items-ui/item-card.js")

    expect(component).toBe(stubComponent)
    expect(fetchResource).toHaveBeenCalledWith("items-ui:item-card", "ui://items-ui/item-card.js")
    expect(evaluateBundle).toHaveBeenCalledWith("// bundle source")
  })

  it("throws when the bundle has no default export function", async () => {
    const fetchResource = vi.fn().mockResolvedValue("// bundle source")
    const evaluateBundle = vi.fn().mockResolvedValue({ default: "not-a-component" })
    const loader = createRemoteWidgetLoader({ fetchResource, evaluateBundle })

    await expect(loader("items-ui:item-card", "ui://items-ui/item-card.js")).rejects.toThrow(
      /no default export component/,
    )
  })

  it("wraps evaluateBundle rejections with id, uri, reason, and the import-map hint", async () => {
    const fetchResource = vi.fn().mockResolvedValue("// bundle source")
    const evaluateBundle = vi
      .fn()
      .mockRejectedValue(new Error('Failed to resolve module specifier "mcp-use/react"'))
    const loader = createRemoteWidgetLoader({ fetchResource, evaluateBundle })

    const promise = loader("items-ui:item-card", "ui://items-ui/item-card.js")
    await expect(promise).rejects.toThrow(/remote widget "items-ui:item-card"/)
    await expect(promise).rejects.toThrow(/ui:\/\/items-ui\/item-card\.js failed to evaluate/)
    await expect(promise).rejects.toThrow(/Failed to resolve module specifier "mcp-use\/react"/)
    await expect(promise).rejects.toThrow(
      /buildSharedRuntimeImportMap\/exposeSharedRuntime in @miragon\/mcp-toolkit-ui/,
    )
  })

  it("bubbles up fetchResource errors verbatim", async () => {
    const fetchResource = vi.fn().mockRejectedValue(new Error("404 missing bundle"))
    const evaluateBundle = vi.fn()
    const loader = createRemoteWidgetLoader({ fetchResource, evaluateBundle })

    await expect(loader("items-ui:item-card", "ui://items-ui/item-card.js")).rejects.toThrow(
      /404 missing bundle/,
    )
    expect(evaluateBundle).not.toHaveBeenCalled()
  })

  it("refuses to build a loader when the host React major does not match the expected major", () => {
    const fetchResource = vi.fn()
    expect(() =>
      createRemoteWidgetLoader({
        fetchResource,
        expectedReactMajor: TOOLKIT_REACT_MAJOR + 1,
      }),
    ).toThrow(/host React/)
    expect(fetchResource).not.toHaveBeenCalled()
  })
})
