import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AppQueryProvider } from "../providers/query-provider.js"
import { useViewData, type ViewDataResult } from "./use-view-data.js"

type Demo = { n: number }
type CallTool = (name: string, args: object) => Promise<unknown>

/** Renders a probe once (SSR, the house path) and hands back the hook's result. */
function probe(
  initialData: Demo | null,
  ready: boolean,
  callTool: CallTool,
  key: string,
): ViewDataResult<Demo> {
  let result: ViewDataResult<Demo> | undefined
  function Probe() {
    result = useViewData<Demo>(
      initialData,
      ["use-view-data.test", key],
      "demo_data",
      { id: 1 },
      ready,
    )
    return null
  }
  renderToStaticMarkup(
    <AppQueryProvider callTool={callTool}>
      <Probe />
    </AppQueryProvider>,
  )
  if (!result) throw new Error("probe did not render")
  return result
}

describe("useViewData", () => {
  it("returns host-pushed data verbatim without fetching", () => {
    const callTool = vi.fn<CallTool>(() => Promise.resolve({}))
    const result = probe({ n: 1 }, true, callTool, "pushed")
    expect(result.data).toEqual({ n: 1 })
    expect(result.loading).toBe(false)
    expect(result.error).toBeNull()
    expect(callTool).not.toHaveBeenCalled()
  })

  it("is not loading before it is ready", () => {
    const result = probe(null, false, vi.fn<CallTool>(), "not-ready")
    expect(result).toMatchObject({ data: null, loading: false, error: null })
  })

  it("refetch calls the tool again: the retry an error state offers", async () => {
    const callTool = vi.fn<CallTool>(() => Promise.resolve({ structuredContent: { n: 2 } }))
    const result = probe(null, false, callTool, "refetch")
    expect(callTool).not.toHaveBeenCalled()
    result.refetch()
    await vi.waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("demo_data", { id: 1 })
    })
  })
})
