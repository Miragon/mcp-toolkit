import { useCallback, useState } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { useDisplayMode } from "mcp-use/react"
import { useToast } from "../components/Toast.js"
import type { ViewMessages } from "../locale/toolkit-messages.js"
import { fullscreenAvailable, isCompleteViewData, type ViewData } from "./mcp-app-view-chrome.js"
import { decodeViewResult } from "./view-lifecycle.js"

/**
 * The toolbar actions of `McpAppView`: refresh and the fullscreen toggle.
 * Their failures raise a toast in catalog words; the raw reason goes to the
 * console, never to the user.
 */

/**
 * Refresh via the refresh tool. A failure keeps the data and says so in a
 * toast. A refresh that went through invalidates the queries of `client`,
 * the one the view's widgets fetch through.
 */
export function useViewRefresh(options: {
  viewData: ViewData | null
  setViewData: (next: ViewData) => void
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  refreshToolName: string
  labels: Pick<ViewMessages, "refreshFailed" | "refreshFailedHint">
  client: QueryClient
}) {
  const { viewData, setViewData, callTool, refreshToolName, labels, client } = options
  const toast = useToast()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshView = useCallback(async () => {
    if (!viewData?._refreshParams) return
    setIsRefreshing(true)
    let failure: unknown = null
    try {
      const result = await callTool(
        refreshToolName,
        viewData._refreshParams as unknown as Record<string, unknown>,
      )
      // One decoding convention with `useToolQuery` (structured-first), with a
      // typed outcome: an unusable payload is a failure, never exception text.
      const outcome = decodeViewResult(result, isCompleteViewData)
      if (outcome.ok) setViewData(outcome.data)
      else failure = outcome.reason ?? "the refresh tool returned no view"
      // The call went through, so self-fetching widgets refresh as well;
      // a tool error refreshes nothing.
      if (outcome.ok || !outcome.isError) void client.invalidateQueries()
    } catch (e) {
      failure = e
    } finally {
      setIsRefreshing(false)
    }
    if (failure === null) return
    console.warn("[mcp-toolkit] refresh failed:", failure)
    toast.show({
      tone: "danger",
      title: labels.refreshFailed,
      description: labels.refreshFailedHint,
    })
  }, [callTool, client, labels, refreshToolName, setViewData, toast, viewData])
  return { isRefreshing, refreshView }
}

/** The fullscreen toggle, gated on the host's offer; a rejected request raises a toast. */
export function useFullscreenToggle(
  labels: Pick<ViewMessages, "fullscreenFailed" | "fullscreenFailedHint">,
) {
  const { displayMode, availableDisplayModes, requestDisplayMode } = useDisplayMode()
  const toast = useToast()
  const toggle = useCallback(async () => {
    const mode = displayMode === "fullscreen" ? "inline" : "fullscreen"
    try {
      // Advisory since 2.x: `displayMode` updates when the host applies it.
      await requestDisplayMode({ mode })
    } catch (e) {
      console.warn("[mcp-toolkit] display-mode request failed:", e)
      toast.show({
        tone: "danger",
        title: labels.fullscreenFailed,
        description: labels.fullscreenFailedHint,
      })
    }
  }, [displayMode, labels, requestDisplayMode, toast])
  return {
    isFullscreen: displayMode === "fullscreen",
    canFullscreen: fullscreenAvailable(displayMode, availableDisplayModes),
    toggle,
  }
}
