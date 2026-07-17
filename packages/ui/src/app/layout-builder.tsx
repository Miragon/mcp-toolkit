import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { AlertTriangle, Eye, Layers, Plus, SlidersHorizontal, X } from "lucide-react"
import type {
  AvailableStep,
  KeyCatalogEntry,
  LayoutConfig,
  PipelineContext,
  PipelineStepRef,
  ReachableWidget,
  RowDef,
  UnreachableWidget,
  WidgetProps,
} from "@miragon/mcp-toolkit-core"
import { parseToolResult } from "../lib/parse-tool-result.js"
import {
  defaultStepIdFor,
  draftToLayout,
  entriesToKeys,
  initDraft,
  keysToEntries,
  sizeToSpan,
  toPipelineContext,
  type KeyEntry,
} from "./builder/builder-model.js"
import {
  draftReducer,
  initBuilderState,
  type BuilderDraftState,
} from "./builder/builder-reducer.js"
import { DEFAULT_LABELS, type LayoutBuilderLabels } from "./builder/labels.js"
import { Toolbar } from "./builder/Toolbar.js"
import { PipelineStrip } from "./builder/PipelineStrip.js"
import { Workspace } from "./builder/Workspace.js"
import { CatalogueSheet } from "./builder/CatalogueSheet.js"
import { SaveDialog } from "./builder/SaveDialog.js"
import { PreviewPane } from "./builder/PreviewPane.js"
import { WidgetPropsSheet } from "./widget-props-sheet.js"
import { Button } from "../primitives/button.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs.js"
import { cn } from "../lib/utils.js"
import { type WidgetComponent } from "./widget-renderer.js"

// -------------------------------------------------------------------------- //
// Public label contract — re-exported from ./builder/labels so callers keep
// importing `LayoutBuilderLabels` from this module unchanged.
// -------------------------------------------------------------------------- //

export type { LayoutBuilderLabels } from "./builder/labels.js"

// -------------------------------------------------------------------------- //
// Props
// -------------------------------------------------------------------------- //

export interface LayoutBuilderProps {
  initialLayout?: LayoutConfig
  title?: string
  initialKeys?: Record<string, unknown>
  initialSteps?: PipelineStepRef[]
  widgets: Record<string, WidgetComponent>
  callTool: (name: string, args: object) => Promise<unknown>
  /** App-only catalogue tool name. Default: `get-builder-catalogue`. */
  catalogueToolName?: string
  saveToolName?: string
  dashboardId?: string
  labels?: LayoutBuilderLabels
  onSaved?: (result: { id: string; name: string }) => void
  /**
   * Called after each `get-builder-catalogue` fetch with the catalogue's full
   * remote-widget palette (`{ id → { bundle, moduleId } }`). The parent
   * (`McpAppView`) uses it to pre-load every upstream-hosted widget bundle so
   * the palette renders real widgets immediately when dropped onto the canvas.
   * `render-view` only advertises the remote widgets the *layout* references,
   * so build mode learns about the rest here rather than from the view payload.
   */
  onCatalogue?: (remoteWidgets: Record<string, { bundle: string; moduleId: string }>) => void
  /**
   * Called after each `get-builder-catalogue` fetch with the catalogue's full
   * host-alias palette (`{ id → { hostWidget, presetProps? } }`). The parent
   * (`McpAppView`) resolves each alias against its own `widgets` map so
   * dropping an alias onto the canvas renders the host component immediately.
   * Mirrors `onCatalogue` for the same reason: `render-view` only advertises
   * the aliases the *layout* references.
   */
  onAliasCatalogue?: (
    aliasWidgets: Record<string, { hostWidget: string; presetProps?: Record<string, unknown> }>,
  ) => void
  /**
   * Called when the user clicks "Done" / exits the builder. Receives
   * the final draft so the parent can swap into the rendered view with
   * the just-built layout. Omit `commit` to leave parent state untouched.
   */
  onExit?: (commit?: {
    layout: LayoutConfig
    keys?: Record<string, unknown>
    steps?: PipelineStepRef[]
    title?: string
    context?: {
      keys: Record<string, unknown>
      stepIds: string[]
      stepData: Record<
        string,
        { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
      >
      errors: { stepId: string; reason: string }[]
    }
  }) => void
}

// -------------------------------------------------------------------------- //
// Main component
// -------------------------------------------------------------------------- //

const EMPTY_CONTEXT: PipelineContext = { steps: {}, keys: {}, errors: [] }

export function LayoutBuilder({
  initialLayout,
  title,
  initialKeys,
  initialSteps,
  widgets,
  callTool,
  catalogueToolName = "get-builder-catalogue",
  saveToolName = "save-dashboard",
  dashboardId,
  labels,
  onSaved,
  onCatalogue,
  onAliasCatalogue,
  onExit,
}: LayoutBuilderProps) {
  const L = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels])

  // ── Draft layout (pure reducer) ─────────────────────────────────────────
  // The draft plus the UI indices coupled to draft mutations
  // (activeTabIndex / focusedRowIndex / editingTabIdx) live in a single pure
  // reducer (see ./builder/builder-reducer.ts) so every mutation is testable
  // and the old setState-in-updater pattern is gone.
  const [builderState, dispatch] = useReducer(
    draftReducer,
    initialLayout,
    (layout): BuilderDraftState => initBuilderState(initDraft(layout)),
  )
  const { draft, activeTabIndex, focusedRowIndex, editingTabIdx, renameRejectedAt } = builderState
  const setActiveTabIndex = useCallback(
    (idx: number) => dispatch({ type: "selectTab", tabIdx: idx }),
    [],
  )
  const setFocusedRowIndex = useCallback(
    (idx: number) => dispatch({ type: "setFocusedRow", rowIdx: idx }),
    [],
  )
  const setEditingTabIdx = useCallback((idx: number | null) => {
    dispatch(idx === null ? { type: "stopEditingTab" } : { type: "startEditingTab", tabIdx: idx })
  }, [])
  const [view, setView] = useState<"layout" | "pipeline" | "preview">("layout")
  const [catalogueOpen, setCatalogueOpen] = useState(false)

  // ── Inline rename feedback ──────────────────────────────────────────────
  // The reducer rejects duplicate tab labels and bumps `renameRejectedAt`
  // (Phase 1 signal). Mirror each bump into a transient flag so the rename
  // input can show "name already exists" inline (Finding [3]). Tracked via
  // the render-phase setState pattern used elsewhere in this codebase; cleared
  // when the inline editor closes (editingTabIdx → null).
  const [renameRejected, setRenameRejected] = useState(false)
  const [prevRenameRejectedAt, setPrevRenameRejectedAt] = useState(renameRejectedAt)
  if (renameRejectedAt !== prevRenameRejectedAt) {
    setPrevRenameRejectedAt(renameRejectedAt)
    setRenameRejected(true)
  }
  const [prevEditingTabIdx, setPrevEditingTabIdx] = useState(editingTabIdx)
  if (editingTabIdx !== prevEditingTabIdx) {
    setPrevEditingTabIdx(editingTabIdx)
    if (editingTabIdx === null) setRenameRejected(false)
  }

  // ── Keys + steps editor state ───────────────────────────────────────────
  const [keyEntries, setKeyEntries] = useState<KeyEntry[]>(() => keysToEntries(initialKeys))
  const [stepEntries, setStepEntries] = useState<PipelineStepRef[]>(() => initialSteps ?? [])

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
  type RefreshStatus = "idle" | "pending" | "refreshing"
  const [status, setStatus] = useState<RefreshStatus>("idle")
  // Last catalogue-fetch failure (Finding [3]). Surfaced as a toolbar banner
  // instead of only `console.warn`-ing, so the user knows the palette/context
  // may be stale. Cleared on the next successful refresh.
  const [refreshError, setRefreshError] = useState<string | null>(null)

  // ── Save dialog ─────────────────────────────────────────────────────────
  const [isBusy, setBusy] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(title ?? "")
  const [saveDescription, setSaveDescription] = useState("")
  // Last save failure (Finding [3]). Shown inline in the SaveDialog so a
  // rejected `save-dashboard` call no longer fails silently.
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── DnD ──────────────────────────────────────────────────────────────────
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)

  // Which cell (if any) is having its props configured. The
  // WidgetPropsSheet is mounted once at the LayoutBuilder root so that
  // exactly one editor can be open at a time across the entire workspace
  // — including across tabs. Stored as `{ rowIdx, cellIdx }` against the
  // currently active draft surface (rows or active tab's rows).
  const [configuringCell, setConfiguringCell] = useState<{
    rowIdx: number
    cellIdx: number
  } | null>(null)

  // ── Derived ─────────────────────────────────────────────────────────────
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

  const activeRows: RowDef[] =
    draft.kind === "tabs" ? (draft.tabs[activeTabIndex]?.rows ?? []) : draft.rows

  // ── Layout mutations (dispatch pure actions) ────────────────────────────
  const addWidgetToRow = useCallback(
    (widgetId: string, targetRowIdx?: number) => {
      const widget = widgetById.get(widgetId)
      if (!widget) return
      dispatch({
        type: "addWidgetToRow",
        widgetId,
        defaultSpan: sizeToSpan(widget.size),
        targetRowIdx,
      })
    },
    [widgetById],
  )

  const addRow = useCallback(() => dispatch({ type: "addRow" }), [])

  const removeRow = useCallback((rowIdx: number) => dispatch({ type: "removeRow", rowIdx }), [])

  const moveRow = useCallback(
    (rowIdx: number, direction: -1 | 1) => dispatch({ type: "moveRow", rowIdx, direction }),
    [],
  )

  const setCellSpan = useCallback(
    (rowIdx: number, cellIdx: number, span: number) =>
      dispatch({ type: "setCellSpan", rowIdx, cellIdx, span }),
    [],
  )

  const removeCell = useCallback(
    (rowIdx: number, cellIdx: number) => dispatch({ type: "removeCell", rowIdx, cellIdx }),
    [],
  )

  // Sets (or clears, when `next` is undefined) the per-instance `props` on
  // a cell. Triggered by the WidgetPropsSheet's Apply button. Storing
  // `undefined` rather than `{}` keeps the saved layout's wire format
  // identical to one a hand-coded LLM call would produce — the field is
  // simply absent.
  const setCellProps = useCallback(
    (rowIdx: number, cellIdx: number, next: Record<string, unknown> | undefined) =>
      dispatch({ type: "setCellProps", rowIdx, cellIdx, next }),
    [],
  )

  const addTab = useCallback(() => dispatch({ type: "addTab" }), [])

  // Commit an inline tab rename and decide whether to close the editor.
  // Dispatches the rename, then keeps the input open when the trimmed label
  // collides with another tab so the reducer's rejection (`renameRejectedAt`)
  // can drive the inline "name already exists" feedback instead of the editor
  // silently snapping shut on the old label.
  const commitRename = useCallback(
    (tabIdx: number, label: string) => {
      dispatch({ type: "renameTab", tabIdx, label })
      const trimmed = label.trim()
      const isDuplicate =
        draft.kind === "tabs" &&
        trimmed.length > 0 &&
        draft.tabs.some((t, i) => i !== tabIdx && t.label === trimmed)
      if (!isDuplicate) setEditingTabIdx(null)
    },
    [draft, setEditingTabIdx],
  )

  const removeTab = useCallback((tabIdx: number) => dispatch({ type: "removeTab", tabIdx }), [])

  // ── Keys/steps mutations ────────────────────────────────────────────────
  const addKey = useCallback((prefilledName?: string) => {
    setKeyEntries((prev) => {
      if (prefilledName) {
        if (prev.some((e) => e.name === prefilledName)) return prev
        return [...prev, { name: prefilledName, rawValue: "" }]
      }
      return [...prev, { name: "", rawValue: "" }]
    })
  }, [])

  const updateKey = useCallback((idx: number, patch: Partial<KeyEntry>) => {
    setKeyEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }, [])

  const removeKey = useCallback((idx: number) => {
    setKeyEntries((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const addStep = useCallback((stepId?: string) => {
    setStepEntries((prev) => {
      const taken = new Set(prev.map((s) => s.id))
      const newId = stepId ? defaultStepIdFor(stepId, taken) : `step-${prev.length + 1}`
      return [...prev, { id: newId, step: stepId ?? "", optional: false }]
    })
  }, [])

  const updateStep = useCallback((idx: number, patch: Partial<PipelineStepRef>) => {
    setStepEntries((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }, [])

  const removeStep = useCallback((idx: number) => {
    setStepEntries((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  // ── Catalogue fetch (mount + on key/step edits) ─────────────────────────
  // The builder fetches its own catalogue from the app-only
  // `get-builder-catalogue` tool; the LLM never sees this data.
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
        remoteWidgets?: Record<string, { bundle: string; moduleId: string }>
        aliasWidgets?: Record<string, { hostWidget: string; presetProps?: Record<string, unknown> }>
        validationIssues?: string[]
        context?: {
          keys: Record<string, unknown>
          stepIds: string[]
          stepData: Record<
            string,
            { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
          >
          errors: { stepId: string; reason: string }[]
        }
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
      // Hand the parent the full remote-widget palette so it can pre-load
      // every upstream bundle for the builder (render-view only ships the
      // ones the layout references).
      if (sc?.remoteWidgets) onCatalogue?.(sc.remoteWidgets)
      // Same for the host-alias palette: the parent resolves each alias
      // against its own bundled widget map (no fetch involved).
      if (sc?.aliasWidgets) onAliasCatalogue?.(sc.aliasWidgets)
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
  }, [catalogueToolName, callTool, keyEntries, stepEntries, onCatalogue, onAliasCatalogue])

  // Fetch the catalogue on mount (no debounce) so the builder is ready
  // immediately. Then on every keys/steps edit, debounce 600ms before
  // re-fetching. The ref pattern keeps the effect dependent on only
  // keyEntries / stepEntries.
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

  // ── Save ────────────────────────────────────────────────────────────────
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

  // ── Smart action: add a producing step for a missing key ────────────────
  const addProducingStepFor = useCallback(
    (key: string) => {
      const producer = liveCatalog.find((c) => c.key === key)?.producedBySteps[0]
      if (!producer) return
      addStep(producer)
    },
    [addStep, liveCatalog],
  )

  const widgetProps: WidgetProps = useMemo(
    () => ({ keys: liveContext.keys, context: liveContext }),
    [liveContext],
  )
  const hasAnyCell = activeRows.some((r) => r.row.length > 0)
  const liveKeysMap = liveContext.keys

  const layoutContent =
    draft.kind === "tabs" ? (
      <Tabs
        value={draft.tabs[activeTabIndex]?.label ?? ""}
        onValueChange={(label) => {
          const idx = draft.tabs.findIndex((t) => t.label === label)
          if (idx >= 0) setActiveTabIndex(idx)
        }}
      >
        <div className="mb-3 flex items-center gap-1">
          <TabsList>
            {draft.tabs.map((tab, idx) => (
              <div key={tab.label} className="group relative inline-flex">
                <TabsTrigger
                  value={tab.label}
                  className="pr-7"
                  onDoubleClick={() => setEditingTabIdx(idx)}
                  title="Double-click to rename"
                >
                  {editingTabIdx === idx ? (
                    <input
                      autoFocus
                      defaultValue={tab.label}
                      aria-invalid={renameRejected}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          commitRename(idx, e.currentTarget.value)
                        } else if (e.key === "Escape") {
                          e.preventDefault()
                          setEditingTabIdx(null)
                        }
                      }}
                      onBlur={(e) => {
                        commitRename(idx, e.currentTarget.value)
                      }}
                      className={cn(
                        "w-24 border-none bg-transparent p-0 text-inherit outline-none focus:ring-0",
                        renameRejected && "text-destructive",
                      )}
                      size={Math.max(tab.label.length + 1, 6)}
                    />
                  ) : (
                    <span>{tab.label}</span>
                  )}
                </TabsTrigger>
                <button
                  type="button"
                  aria-label={L.removeTab}
                  title={L.removeTab}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTab(idx)
                  }}
                  className="text-muted-foreground/60 hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[state=active]:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </TabsList>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={addTab}
            aria-label={L.addTab}
            title={L.addTab}
          >
            <Plus />
          </Button>
          <span className="text-muted-foreground/70 ml-2 hidden text-[10px] sm:inline">
            double-click a tab to rename
          </span>
        </div>
        {renameRejected && editingTabIdx !== null && (
          <p className="text-destructive -mt-1 mb-2 text-[11px]" role="alert">
            {L.renameDuplicate}
          </p>
        )}
        {draft.tabs.map((tab, idx) => (
          <TabsContent key={tab.label} value={tab.label} className="mt-0">
            {idx === activeTabIndex ? (
              <Workspace
                L={L}
                paletteByApp={paletteByApp}
                paletteCount={liveReachable.length}
                activeRows={activeRows}
                focusedRowIndex={focusedRowIndex}
                setFocusedRowIndex={setFocusedRowIndex}
                dragOverRow={dragOverRow}
                setDragOverRow={setDragOverRow}
                onAddRow={addRow}
                onRemoveRow={removeRow}
                onMoveRow={moveRow}
                onSetCellSpan={setCellSpan}
                onRemoveCell={removeCell}
                onAddWidget={addWidgetToRow}
                onConfigureCell={(rowIdx, cellIdx) => setConfiguringCell({ rowIdx, cellIdx })}
                propsSchemaByWidgetId={propsSchemaByWidgetId}
                widgets={widgets}
                widgetProps={widgetProps}
              />
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    ) : (
      <Workspace
        L={L}
        paletteByApp={paletteByApp}
        paletteCount={liveReachable.length}
        activeRows={activeRows}
        focusedRowIndex={focusedRowIndex}
        setFocusedRowIndex={setFocusedRowIndex}
        dragOverRow={dragOverRow}
        setDragOverRow={setDragOverRow}
        onAddRow={addRow}
        onRemoveRow={removeRow}
        onMoveRow={moveRow}
        onSetCellSpan={setCellSpan}
        onRemoveCell={removeCell}
        onAddWidget={addWidgetToRow}
        onConfigureCell={(rowIdx, cellIdx) => setConfiguringCell({ rowIdx, cellIdx })}
        propsSchemaByWidgetId={propsSchemaByWidgetId}
        widgets={widgets}
        widgetProps={widgetProps}
        showAddTabButton
        onAddTab={addTab}
      />
    )

  return (
    <div className="flex min-h-[60vh] flex-col gap-4 p-1">
      <Toolbar
        L={L}
        previewMode={view === "preview"}
        isBusy={isBusy}
        status={status}
        liveKeys={liveKeyCount}
        reachableCount={liveReachable.length}
        unreachableCount={liveUnreachable.length}
        onOpenCatalogue={() => setCatalogueOpen(true)}
        onOpenSave={() => setSaveOpen(true)}
        onDone={
          onExit
            ? () =>
                onExit({
                  layout: draftToLayout(draft),
                  keys: entriesToKeys(keyEntries),
                  steps: stepEntries.filter((s) => s.step.trim().length > 0),
                  title,
                  context: {
                    keys: liveContext.keys,
                    stepIds: Object.keys(liveContext.steps),
                    stepData: Object.fromEntries(
                      Object.entries(liveContext.steps).map(([id, result]) => [
                        id,
                        {
                          data: result.data,
                          keys: result.keys,
                          _app: result._app,
                          _dataType: result._dataType,
                        },
                      ]),
                    ),
                    errors: liveContext.errors,
                  },
                })
            : undefined
        }
        hasAnyCell={hasAnyCell}
      />

      <BuilderBanners
        L={L}
        catalogueToolName={catalogueToolName}
        refreshError={refreshError}
        validationIssues={validationIssues}
      />

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="layout">
            <Layers className="size-3.5" />
            {L.viewLayoutTab}
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <SlidersHorizontal className="size-3.5" />
            {L.viewPipelineTab}
            {(keyEntries.length > 0 || stepEntries.length > 0) && (
              <span className="bg-muted text-muted-foreground ml-1 rounded px-1 font-mono text-[10px]">
                {keyEntries.length}/{stepEntries.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="preview" disabled={!hasAnyCell}>
            <Eye className="size-3.5" />
            {L.viewPreviewTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="layout" className="mt-4">
          {liveReachable.length === 0 && !hasAnyCell ? (
            <EmptyHint L={L} onGotoPipeline={() => setView("pipeline")} />
          ) : (
            layoutContent
          )}
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineStrip
            L={L}
            keyEntries={keyEntries}
            stepEntries={stepEntries}
            keyCatalog={liveCatalog}
            availableSteps={liveSteps}
            stepsByApp={stepsByApp}
            liveKeys={liveKeysMap}
            onAddKey={addKey}
            onUpdateKey={updateKey}
            onRemoveKey={removeKey}
            onAddStep={addStep}
            onUpdateStep={updateStep}
            onRemoveStep={removeStep}
            status={status}
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <PreviewPane
            draft={draft}
            activeTabIndex={activeTabIndex}
            setActiveTabIndex={setActiveTabIndex}
            widgets={widgets}
            widgetProps={widgetProps}
          />
        </TabsContent>
      </Tabs>

      <CatalogueSheet
        L={L}
        open={catalogueOpen}
        onOpenChange={setCatalogueOpen}
        keyCatalog={liveCatalog}
        availableSteps={liveSteps}
        unreachableWidgets={liveUnreachable}
        onSeedKey={(name) => {
          addKey(name)
          setCatalogueOpen(false)
          setView("pipeline")
        }}
        onAddProducingStep={(key) => {
          addProducingStepFor(key)
          setCatalogueOpen(false)
          setView("pipeline")
        }}
      />

      <SaveDialog
        L={L}
        open={saveOpen}
        onOpenChange={(open) => {
          // Clear any stale save error whenever the dialog is opened or
          // dismissed so a fresh attempt starts clean.
          setSaveError(null)
          setSaveOpen(open)
        }}
        name={saveName}
        setName={setSaveName}
        description={saveDescription}
        setDescription={setSaveDescription}
        onSubmit={saveDraft}
        busy={isBusy}
        error={saveError}
      />

      {(() => {
        if (!configuringCell) return null
        const cell = activeRows[configuringCell.rowIdx]?.row[configuringCell.cellIdx]
        if (!cell) return null
        const schema = propsSchemaByWidgetId.get(cell.widget)
        return (
          <WidgetPropsSheet
            open
            onOpenChange={(open) => {
              if (!open) setConfiguringCell(null)
            }}
            widgetId={cell.widget}
            schema={schema}
            value={cell.props}
            onApply={(next) => {
              setCellProps(configuringCell.rowIdx, configuringCell.cellIdx, next)
              setConfiguringCell(null)
            }}
          />
        )
      })()}
    </div>
  )
}

function EmptyHint({
  L,
  onGotoPipeline,
}: {
  L: Required<LayoutBuilderLabels>
  onGotoPipeline: () => void
}) {
  return (
    <div className="border-muted-foreground/30 text-muted-foreground flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-sm">
      <Layers className="size-5" />
      <p>No widgets reachable yet.</p>
      <p className="text-xs">
        Open the <span className="font-medium">{L.viewPipelineTab}</span> tab to seed keys or add a
        pipeline step — the palette unlocks as soon as a widget's contract is satisfied.
      </p>
      <Button variant="outline" size="sm" onClick={onGotoPipeline} className="mt-1">
        <SlidersHorizontal /> Open {L.viewPipelineTab}
      </Button>
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Builder banners — catalogue-fetch failure + pipeline validation warning
// -------------------------------------------------------------------------- //

/**
 * Inline feedback strip under the toolbar. Surfaces two things the builder
 * previously swallowed:
 *   - a `get-builder-catalogue` fetch failure (Finding [3]) — only console-
 *     logged before, so the user couldn't tell the palette was stale, and
 *   - pipeline validation issues (Finding [10]/[6]) the catalogue reports
 *     fail-soft but `render-view` would reject fail-hard.
 *
 * Renders nothing when there's no error and no issues, so the happy path is
 * visually unchanged.
 */
function BuilderBanners({
  L,
  catalogueToolName,
  refreshError,
  validationIssues,
}: {
  L: Required<LayoutBuilderLabels>
  catalogueToolName: string
  refreshError: string | null
  validationIssues: string[]
}) {
  if (!refreshError && validationIssues.length === 0) return null
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {refreshError && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{L.catalogueError}</p>
            <p className="text-destructive/80 mt-0.5 break-words">
              <span className="font-mono">{catalogueToolName}</span>: {refreshError}
            </p>
          </div>
        </div>
      )}
      {validationIssues.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{L.validationWarning}</p>
            <ul className="mt-0.5 list-inside list-disc space-y-0.5">
              {validationIssues.map((issue, idx) => (
                <li key={idx} className="break-words">
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
