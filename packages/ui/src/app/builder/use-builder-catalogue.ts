import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  AvailableStep,
  KeyCatalogEntry,
  PipelineContext,
  PipelineStepRef,
  ReachableWidget,
  UnreachableWidget,
} from "@miragon/mcp-toolkit-core"
import { parseToolResult } from "../../lib/parse-tool-result.js"
import {
  entriesToKeys,
  toPipelineContext,
  type KeyEntry,
  type WireContext,
} from "./builder-model.js"
import type { RefreshStatus } from "./labels.js"

// -------------------------------------------------------------------------- //
// Builder catalogue hook — live snapshots from `get-builder-catalogue`
// -------------------------------------------------------------------------- //

const EMPTY_CONTEXT: PipelineContext = { steps: {}, keys: {}, errors: [] }

/**
 * Owns the builder's live catalogue: the snapshots fetched from the app-only
 * `get-builder-catalogue` tool (the LLM never sees this data), the refresh
 * status for the auto-apply chip, and the lookups derived from the
 * snapshots. Extracted from `layout-builder.tsx` unchanged: fetch on mount
 * (no debounce) so the builder is ready immediately, then debounce 600ms on
 * every keys/steps edit. The ref pattern keeps the effect dependent on only
 * `keyEntries` / `stepEntries`.
 */
export function useBuilderCatalogue({
  callTool,
  catalogueToolName,
  keyEntries,
  stepEntries,
}: {
  callTool: (name: string, args: object) => Promise<unknown>
  catalogueToolName: string
  keyEntries: KeyEntry[]
  stepEntries: PipelineStepRef[]
}) {
  // ── Live snapshots from get-builder-catalogue responses ─────────────────
  // Start empty — the first effect below fetches the catalogue on mount.
  const [liveReachable, setLiveReachable] = useState<ReachableWidget[]>([])
  const [liveUnreachable, setLiveUnreachable] = useState<UnreachableWidget[]>([])
  const [liveCatalog, setLiveCatalog] = useState<KeyCatalogEntry[]>([])
  const [liveSteps, setLiveSteps] = useState<AvailableStep[]>([])
  const [liveContext, setLiveContext] = useState<PipelineContext>(EMPTY_CONTEXT)
  // Pipeline validation issues from the catalogue (Finding [10]/[6]). The
  // catalogue is fail-soft, but `render-view` is fail-hard, so we surface
  // these so the user sees — before committing — that the pipeline as
  // configured wouldn't render.
  const [validationIssues, setValidationIssues] = useState<string[]>([])

  // ── Refresh status (for the auto-apply chip) ────────────────────────────
  const [status, setStatus] = useState<RefreshStatus>("idle")
  // Last catalogue-fetch failure (Finding [3]). Surfaced as a toolbar banner
  // instead of only `console.warn`-ing, so the user knows the palette/context
  // may be stale. Cleared on the next successful refresh.
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const refreshBuilder = useCallback(async () => {
    setStatus("refreshing")
    try {
      const result = await callTool(catalogueToolName, {
        keys: entriesToKeys(keyEntries),
        steps: stepEntries.filter((s) => s.step.trim().length > 0),
      })
      const sc = parseToolResult<{
        reachableWidgets?: ReachableWidget[]
        unreachableWidgets?: UnreachableWidget[]
        availableSteps?: AvailableStep[]
        keyCatalog?: KeyCatalogEntry[]
        validationIssues?: string[]
        context?: WireContext
      } | null>(result)
      if (sc?.reachableWidgets) setLiveReachable(sc.reachableWidgets)
      if (sc?.unreachableWidgets) setLiveUnreachable(sc.unreachableWidgets)
      if (sc?.availableSteps) setLiveSteps(sc.availableSteps)
      if (sc?.keyCatalog) setLiveCatalog(sc.keyCatalog)
      if (sc?.context) setLiveContext(toPipelineContext(sc.context))
      // Pipeline issues are fail-soft in the catalogue but fail-hard in
      // render-view; surface them so the user sees the render path wouldn't
      // run as configured (Finding [10]/[6]). Coerce undefined → [] so a
      // fixed pipeline clears a previously-shown warning.
      setValidationIssues(sc?.validationIssues ?? [])
      // A successful fetch clears any stale failure banner.
      setRefreshError(null)
    } catch (err) {
      // Fail soft: when the host's server hasn't registered the app-only
      // `get-builder-catalogue` tool (the builder platform is opt-in via
      // `app.builder`), the call rejects. Degrade to the static catalogue
      // already derived from the layout rather than crashing the iframe —
      // but surface the failure so the user knows the palette may be stale
      // (Finding [3]).
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(
        `[mcp-toolkit] builder catalogue fetch failed (${catalogueToolName}): ${reason}. ` +
          "The builder platform may be disabled on this server (app.builder).",
      )
      setRefreshError(reason)
    } finally {
      setStatus("idle")
    }
  }, [catalogueToolName, callTool, keyEntries, stepEntries])

  const refreshRef = useRef(refreshBuilder)
  useEffect(() => {
    refreshRef.current = refreshBuilder
  }, [refreshBuilder])
  const isFirstRun = useRef(true)
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      void refreshRef.current()
      return
    }
    setStatus("pending")
    const handle = window.setTimeout(() => {
      void refreshRef.current()
    }, 600)
    return () => {
      window.clearTimeout(handle)
    }
  }, [keyEntries, stepEntries])

  // ── Derived lookups ─────────────────────────────────────────────────────
  const widgetById = useMemo(() => {
    const map = new Map<string, ReachableWidget>()
    for (const w of liveReachable) map.set(w.id, w)
    return map
  }, [liveReachable])

  // Per-widget propsSchema lookup. Merged from both reachable and
  // unreachable lists because a saved layout can reference a widget whose
  // `requires` aren't currently satisfied — we still want the user to be
  // able to edit its props.
  const propsSchemaByWidgetId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const w of liveReachable) {
      if (w.propsSchema) map.set(w.id, w.propsSchema)
    }
    for (const w of liveUnreachable) {
      if (w.propsSchema) map.set(w.id, w.propsSchema)
    }
    return map
  }, [liveReachable, liveUnreachable])

  const paletteByApp = useMemo(() => {
    const groups = new Map<string, ReachableWidget[]>()
    for (const w of liveReachable) {
      if (!groups.has(w.app)) groups.set(w.app, [])
      groups.get(w.app)!.push(w)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [liveReachable])

  const liveKeyCount = useMemo(() => liveCatalog.filter((c) => c.inContext).length, [liveCatalog])

  const stepsByApp = useMemo(() => {
    const groups = new Map<string, AvailableStep[]>()
    for (const s of liveSteps) {
      if (!groups.has(s.app)) groups.set(s.app, [])
      groups.get(s.app)!.push(s)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [liveSteps])

  return {
    liveReachable,
    liveUnreachable,
    liveCatalog,
    liveSteps,
    liveContext,
    validationIssues,
    status,
    refreshError,
    widgetById,
    propsSchemaByWidgetId,
    paletteByApp,
    liveKeyCount,
    stepsByApp,
  }
}
