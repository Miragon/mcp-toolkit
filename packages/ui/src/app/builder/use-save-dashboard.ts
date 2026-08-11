import { useCallback, useState } from "react"
import type { PipelineStepRef } from "@miragon/mcp-toolkit-core"
import { parseToolResult } from "../../lib/parse-tool-result.js"
import { draftToLayout, entriesToKeys, type DraftLayout, type KeyEntry } from "./builder-model.js"

// -------------------------------------------------------------------------- //
// Save-dashboard hook — dialog state + the `save-dashboard` call
// -------------------------------------------------------------------------- //

/**
 * Owns the save dialog's state (open flag, name/description inputs, busy
 * flag, inline error) and the `save-dashboard` call. Extracted from
 * `layout-builder.tsx` unchanged: a rejected save surfaces its reason
 * inline in the SaveDialog instead of failing silently (Finding [3]).
 */
export function useSaveDashboard({
  callTool,
  saveToolName,
  dashboardId,
  title,
  keyEntries,
  stepEntries,
  draft,
  onSaved,
}: {
  callTool: (name: string, args: object) => Promise<unknown>
  saveToolName: string
  dashboardId?: string
  title?: string
  keyEntries: KeyEntry[]
  stepEntries: PipelineStepRef[]
  draft: DraftLayout
  onSaved?: (result: { id: string; name: string }) => void
}) {
  const [isBusy, setBusy] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(title ?? "")
  const [saveDescription, setSaveDescription] = useState("")
  // Last save failure (Finding [3]). Shown inline in the SaveDialog so a
  // rejected `save-dashboard` call no longer fails silently.
  const [saveError, setSaveError] = useState<string | null>(null)

  const saveDraft = useCallback(async () => {
    if (!saveName.trim()) return
    setBusy(true)
    setSaveError(null)
    try {
      const result = await callTool(saveToolName, {
        id: dashboardId,
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        keys: entriesToKeys(keyEntries),
        steps: stepEntries.filter((s) => s.step.trim().length > 0),
        layout: draftToLayout(draft),
        title,
      })
      const saved = parseToolResult<{ id?: string; name?: string } | null>(result)
      setSaveOpen(false)
      if (saved?.id && onSaved) {
        onSaved({
          id: saved.id,
          name: saved.name ?? saveName.trim(),
        })
      }
    } catch (err) {
      // Previously uncaught: a rejected `save-dashboard` left the dialog open
      // with no feedback. Surface the reason inline (Finding [3]).
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [
    callTool,
    dashboardId,
    draft,
    keyEntries,
    onSaved,
    saveDescription,
    saveName,
    saveToolName,
    stepEntries,
    title,
  ])

  return {
    isBusy,
    saveOpen,
    setSaveOpen,
    saveName,
    setSaveName,
    saveDescription,
    setSaveDescription,
    saveError,
    setSaveError,
    saveDraft,
  }
}
