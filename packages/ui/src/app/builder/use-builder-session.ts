import { useCallback, useState } from "react"
import {
  draftStatus,
  viewAfterAdvancedToggle,
  type BuilderView,
  type DraftStatus,
} from "./builder-model.js"

// -------------------------------------------------------------------------- //
// Builder session state that is not the draft itself
// -------------------------------------------------------------------------- //

/**
 * Which builder view is shown and whether advanced mode is on. The data
 * sources (keys, steps, context ids) and the catalogue are technical, so they
 * live behind "Advanced"; switching it off leaves a now hidden view for the
 * layout.
 */
export function useBuilderMode() {
  const [advanced, setAdvanced] = useState(false)
  const [view, setView] = useState<BuilderView>("layout")
  const toggleAdvanced = useCallback(() => {
    const next = !advanced
    setAdvanced(next)
    setView(viewAfterAdvancedToggle(view, next))
  }, [advanced, view])
  /** The empty layout's one next step: show the data sources. */
  const openDataSources = useCallback(() => {
    setAdvanced(true)
    setView("pipeline")
  }, [])
  return { advanced, view, setView, toggleAdvanced, openDataSources }
}

/**
 * Tracks the draft against the view before editing and the last saved
 * dashboard (see `draftStatus`). `snapshot` is the current `builderSnapshot`;
 * the first one is the pre-edit baseline.
 */
export function useDraftStatus(snapshot: string): DraftStatus & {
  /** Records `saved` (the snapshot that went into a saved dashboard). */
  markSaved: (saved: string) => void
} {
  const [baseline] = useState(snapshot)
  const [saved, setSaved] = useState<string | null>(null)
  const markSaved = useCallback((value: string) => setSaved(value), [])
  return { ...draftStatus(snapshot, baseline, saved), markSaved }
}
