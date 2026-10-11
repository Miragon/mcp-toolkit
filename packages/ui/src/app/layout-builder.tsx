import { useCallback, useMemo, useReducer, useState } from "react"
import { Eye, Layers, SlidersHorizontal } from "lucide-react"
import type { LayoutConfig, PipelineStepRef, RowDef, WidgetProps } from "@miragon/mcp-toolkit-core"
import {
  builderLeave,
  builderSnapshot,
  draftHasCells,
  initDraft,
  sizeToSpan,
  toExitCommit,
  type BuilderExitCommit,
  type BuilderView,
} from "./builder/builder-model.js"
import {
  draftReducer,
  initBuilderState,
  type BuilderDraftState,
} from "./builder/builder-reducer.js"
import type { LayoutBuilderLabels } from "./builder/labels.js"
import { Toolbar } from "./builder/Toolbar.js"
import { PipelineStrip } from "./builder/PipelineStrip.js"
import { CatalogueSheet } from "./builder/CatalogueSheet.js"
import { SaveDialog } from "./builder/SaveDialog.js"
import { DiscardDialog } from "./builder/DiscardDialog.js"
import { PreviewPane } from "./builder/PreviewPane.js"
import { LayoutSurface } from "./builder/LayoutSurface.js"
import { BuilderBanners } from "./builder/BuilderBanners.js"
import { EmptyHint } from "./builder/EmptyHint.js"
import { CellPropsSheet } from "./builder/CellPropsSheet.js"
import { useBuilderCatalogue } from "./builder/use-builder-catalogue.js"
import { useBuilderMode, useDraftStatus, useRenameFeedback } from "./builder/use-builder-session.js"
import { useKeyStepEntries } from "./builder/use-key-step-entries.js"
import { useSaveDashboard } from "./builder/use-save-dashboard.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs.js"
import { ToastProvider, useToast } from "../components/Toast.js"
import { useToolkitMessages } from "../locale/locale-provider.js"
import { builderMountFocusTarget, useFocusOnMount } from "./use-build-mode-focus.js"
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
   * Leaves the builder. "Apply" calls it WITH the final draft (`commit`) so
   * the parent swaps the just-built layout into its view; "Discard" calls it
   * WITHOUT one, so the parent keeps the view as it was before editing (after
   * a confirmation when the draft changed it). Without `onExit` the builder
   * has no Apply, and Discard resets the draft in place.
   */
  onExit?: (commit?: BuilderExitCommit) => void
}

// -------------------------------------------------------------------------- //
// Main component
// -------------------------------------------------------------------------- //

/**
 * The visual view builder. People see widgets and steps by their titles
 * (`title`/`titleKey` of the definitions, else the id); the data sources, the
 * catalogue and the technical ids sit behind "Advanced". "Apply" shows the
 * draft in the view, "Save as dashboard" stores it, "Discard" restores the
 * view as it was. Confirms a successful save with a toast (it mounts a
 * `ToastProvider` when none is above it — inside `McpAppView` it shares the
 * view's). Every caption follows the active locale (`labels` overrides).
 */
export function LayoutBuilder(props: LayoutBuilderProps) {
  // Discard without an `onExit` restores the initial props by remounting.
  const [generation, setGeneration] = useState(0)
  const reset = useCallback(() => setGeneration((g) => g + 1), [])
  return (
    <ToastProvider>
      <LayoutBuilderImpl
        key={generation}
        {...props}
        onReset={reset}
        mountFocus={builderMountFocusTarget(generation)}
      />
    </ToastProvider>
  )
}

/**
 * The catalog strings, overrides merged; a `labels` override of the deprecated
 * `done` still labels Apply (a catalog override of it already did, in
 * `resolveToolkitMessages`).
 */
function useBuilderLabels(labels: LayoutBuilderLabels | undefined): Required<LayoutBuilderLabels> {
  const messages = useToolkitMessages()
  return useMemo(
    () => ({
      ...messages.builder,
      ...labels,
      apply: labels?.apply ?? labels?.done ?? messages.builder.apply,
    }),
    [messages.builder, labels],
  )
}

function LayoutBuilderImpl({
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
  onReset,
  mountFocus,
}: LayoutBuilderProps & { onReset: () => void; mountFocus: string | null }) {
  const L = useBuilderLabels(labels)
  const toast = useToast()

  // A reset remounts the builder: the element that had the focus is gone.
  const rootRef = useFocusOnMount<HTMLDivElement>(mountFocus)

  // ── Draft layout (pure reducer) ─────────────────────────────────────────
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
  const { advanced, view, setView, toggleAdvanced, openDataSources } = useBuilderMode()
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const renameRejected = useRenameFeedback(renameRejectedAt, editingTabIdx)

  // ── Keys + steps editor state ───────────────────────────────────────────
  const { keyEntries, stepEntries, addKey, updateKey, removeKey, addStep, updateStep, removeStep } =
    useKeyStepEntries({ initialKeys, initialSteps })

  // ── Draft status: what Apply / Discard / the unsaved marker compare ─────
  const snapshot = useMemo(
    () => builderSnapshot(draft, keyEntries, stepEntries),
    [draft, keyEntries, stepEntries],
  )
  const draftState = useDraftStatus(snapshot)

  // ── Catalogue fetch (mount + on key/step edits) ─────────────────────────
  const catalogue = useBuilderCatalogue({ callTool, catalogueToolName, keyEntries, stepEntries })
  const { liveReachable, liveCatalog, liveContext, widgetById } = catalogue

  // ── Save dialog ─────────────────────────────────────────────────────────
  const save = useSaveDashboard({
    callTool,
    saveToolName,
    dashboardId,
    title,
    keyEntries,
    stepEntries,
    draft,
    onSaved,
    onSuccess: (name) => {
      draftState.markSaved(snapshot)
      toast.show({ tone: "success", title: L.saved(name) })
    },
  })

  // ── DnD + the cell whose props are being configured ─────────────────────
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)
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
  // Sets (or clears, when `next` is undefined) a cell's per-instance `props`
  // from the props sheet's Apply; `undefined` keeps the field absent on the wire.
  const setCellProps = useCallback(
    (rowIdx: number, cellIdx: number, next: Record<string, unknown> | undefined) =>
      dispatch({ type: "setCellProps", rowIdx, cellIdx, next }),
    [],
  )
  const addTab = useCallback(() => dispatch({ type: "addTab" }), [])
  // Commit an inline tab rename. A label that collides with another tab keeps
  // the editor open (the reducer's rejection drives the inline error); the
  // return value tells the field whether it closed.
  const commitRename = useCallback(
    (tabIdx: number, label: string): boolean => {
      dispatch({ type: "renameTab", tabIdx, label })
      const trimmed = label.trim()
      const isDuplicate =
        draft.kind === "tabs" &&
        trimmed.length > 0 &&
        draft.tabs.some((t, i) => i !== tabIdx && t.label === trimmed)
      if (!isDuplicate) setEditingTabIdx(null)
      return !isDuplicate
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

  // ── Leaving: Apply commits, Discard restores (asking first when the view loses changes) ─
  const leave = builderLeave({
    changed: draftState.changed,
    onExit,
    onReset,
    commit: () => toExitCommit(draft, keyEntries, stepEntries, title, liveContext),
    confirm: () => setDiscardOpen(true),
  })

  const widgetProps: WidgetProps = useMemo(
    () => ({ keys: liveContext.keys, context: liveContext }),
    [liveContext],
  )
  const hasAnyCell = draftHasCells(draft)

  return (
    <div ref={rootRef} className="flex min-h-[60vh] flex-col gap-4 p-1">
      <Toolbar
        L={L}
        previewMode={view === "preview"}
        isBusy={save.isBusy}
        status={catalogue.status}
        liveKeys={catalogue.liveKeyCount}
        reachableCount={liveReachable.length}
        unreachableCount={catalogue.liveUnreachable.length}
        advanced={advanced}
        onToggleAdvanced={toggleAdvanced}
        unsaved={draftState.unsaved}
        onOpenCatalogue={() => setCatalogueOpen(true)}
        onOpenSave={() => save.setSaveOpen(true)}
        onDiscard={leave.discard}
        onApply={leave.apply}
        hasAnyCell={hasAnyCell}
      />

      <BuilderBanners
        L={L}
        catalogueToolName={catalogueToolName}
        refreshError={catalogue.refreshError}
        validationIssues={catalogue.validationIssues}
        onRetry={catalogue.retryCatalogue}
      />

      <Tabs value={view} onValueChange={(v) => setView(v as BuilderView)}>
        <TabsList>
          <TabsTrigger value="layout">
            <Layers aria-hidden="true" className="size-3.5" />
            {L.viewLayoutTab}
          </TabsTrigger>
          {advanced && (
            <TabsTrigger value="pipeline">
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
              {L.viewPipelineTab}
              {(keyEntries.length > 0 || stepEntries.length > 0) && (
                <span className="bg-muted text-muted-foreground text-small ml-1 rounded px-1 tabular-nums">
                  {keyEntries.length}/{stepEntries.length}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="preview" disabled={!hasAnyCell}>
            <Eye aria-hidden="true" className="size-3.5" />
            {L.viewPreviewTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="layout" className="mt-4">
          {/* Until the catalogue answers, the palette shows a loading state
              (an empty state now would flash on every open). */}
          {catalogue.loaded && liveReachable.length === 0 && !hasAnyCell ? (
            <EmptyHint L={L} onGotoPipeline={openDataSources} />
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
                paletteByApp: catalogue.paletteByApp,
                appDisplayByName: catalogue.appDisplayByName,
                paletteCount: liveReachable.length,
                paletteLoading: !catalogue.loaded,
                onOpenDataSources: openDataSources,
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
                propsSchemaByWidgetId: catalogue.propsSchemaByWidgetId,
                displayByWidgetId: catalogue.displayByWidgetId,
                advanced,
                widgets,
                widgetProps,
              }}
            />
          )}
        </TabsContent>

        {advanced && (
          <TabsContent value="pipeline" className="mt-4">
            <PipelineStrip
              L={L}
              keyEntries={keyEntries}
              stepEntries={stepEntries}
              keyCatalog={liveCatalog}
              availableSteps={catalogue.liveSteps}
              stepsByApp={catalogue.stepsByApp}
              liveKeys={liveContext.keys}
              onAddKey={addKey}
              onUpdateKey={updateKey}
              onRemoveKey={removeKey}
              onAddStep={addStep}
              onUpdateStep={updateStep}
              onRemoveStep={removeStep}
              status={catalogue.status}
            />
          </TabsContent>
        )}

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
        availableSteps={catalogue.liveSteps}
        unreachableWidgets={catalogue.liveUnreachable}
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
        open={save.saveOpen}
        canApply={onExit !== undefined}
        onOpenChange={(open) => {
          // Clear any stale save error whenever the dialog is opened or
          // dismissed so a fresh attempt starts clean.
          save.setSaveError(null)
          save.setSaveOpen(open)
        }}
        name={save.saveName}
        setName={save.setSaveName}
        description={save.saveDescription}
        setDescription={save.setSaveDescription}
        onSubmit={save.saveDraft}
        busy={save.isBusy}
        error={save.saveError}
      />

      <DiscardDialog
        L={L}
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        changesSaved={!draftState.unsaved}
        onConfirm={() => {
          setDiscardOpen(false)
          leave.discardNow()
        }}
      />

      <CellPropsSheet
        configuringCell={configuringCell}
        activeRows={activeRows}
        propsSchemaByWidgetId={catalogue.propsSchemaByWidgetId}
        displayByWidgetId={catalogue.displayByWidgetId}
        onApply={setCellProps}
        onClose={() => setConfiguringCell(null)}
      />
    </div>
  )
}
