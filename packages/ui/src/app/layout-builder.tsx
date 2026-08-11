import { useCallback, useMemo, useReducer, useState } from "react"
import { Eye, Layers, SlidersHorizontal } from "lucide-react"
import type { LayoutConfig, PipelineStepRef, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import { draftToLayout, entriesToKeys, initDraft, sizeToSpan } from "./builder/builder-model.js"
import {
  draftReducer,
  initBuilderState,
  type BuilderDraftState,
} from "./builder/builder-reducer.js"
import { DEFAULT_LABELS, type LayoutBuilderLabels } from "./builder/labels.js"
import { Toolbar } from "./builder/Toolbar.js"
import { PipelineStrip } from "./builder/PipelineStrip.js"
import { CatalogueSheet } from "./builder/CatalogueSheet.js"
import { SaveDialog } from "./builder/SaveDialog.js"
import { PreviewPane } from "./builder/PreviewPane.js"
import { LayoutSurface } from "./builder/LayoutSurface.js"
import { BuilderBanners } from "./builder/BuilderBanners.js"
import { EmptyHint } from "./builder/EmptyHint.js"
import { CellPropsSheet } from "./builder/CellPropsSheet.js"
import { useBuilderCatalogue } from "./builder/use-builder-catalogue.js"
import { useKeyStepEntries } from "./builder/use-key-step-entries.js"
import { useSaveDashboard } from "./builder/use-save-dashboard.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs.js"
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
  const { keyEntries, stepEntries, addKey, updateKey, removeKey, addStep, updateStep, removeStep } =
    useKeyStepEntries({ initialKeys, initialSteps })

  // ── Catalogue fetch (mount + on key/step edits) ─────────────────────────
  // The builder fetches its own catalogue from the app-only
  // `get-builder-catalogue` tool; the LLM never sees this data.
  const {
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
  } = useBuilderCatalogue({ callTool, catalogueToolName, keyEntries, stepEntries })

  // ── Save dialog ─────────────────────────────────────────────────────────
  const {
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
  } = useSaveDashboard({
    callTool,
    saveToolName,
    dashboardId,
    title,
    keyEntries,
    stepEntries,
    draft,
    onSaved,
  })

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
            <LayoutSurface
              L={L}
              draft={draft}
              activeTabIndex={activeTabIndex}
              setActiveTabIndex={setActiveTabIndex}
              editingTabIdx={editingTabIdx}
              setEditingTabIdx={setEditingTabIdx}
              renameRejected={renameRejected}
              commitRename={commitRename}
              onAddTab={addTab}
              onRemoveTab={removeTab}
              workspace={{
                L,
                paletteByApp,
                paletteCount: liveReachable.length,
                activeRows,
                focusedRowIndex,
                setFocusedRowIndex,
                dragOverRow,
                setDragOverRow,
                onAddRow: addRow,
                onRemoveRow: removeRow,
                onMoveRow: moveRow,
                onSetCellSpan: setCellSpan,
                onRemoveCell: removeCell,
                onAddWidget: addWidgetToRow,
                onConfigureCell: (rowIdx, cellIdx) => setConfiguringCell({ rowIdx, cellIdx }),
                propsSchemaByWidgetId,
                widgets,
                widgetProps,
              }}
            />
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

      <CellPropsSheet
        configuringCell={configuringCell}
        activeRows={activeRows}
        propsSchemaByWidgetId={propsSchemaByWidgetId}
        onApply={setCellProps}
        onClose={() => setConfiguringCell(null)}
      />
    </div>
  )
}
