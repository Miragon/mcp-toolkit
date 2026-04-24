import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Library,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
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
import { normalizeLayout } from "@miragon/mcp-toolkit-core"
import { GridLayout, GridItem } from "../components/GridLayout.js"
import { Badge } from "../primitives/badge.js"
import { Button } from "../primitives/button.js"
import { Card } from "../primitives/card.js"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../primitives/dialog.js"
import { Input } from "../primitives/input.js"
import { ScrollArea } from "../primitives/scroll-area.js"
import { Separator } from "../primitives/separator.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs.js"
import type { WidgetComponent } from "./widget-renderer.js"

export interface LayoutBuilderLabels {
  title?: string
  palette?: string
  paletteEmpty?: string
  canvasEmpty?: string
  canvasDropHint?: string
  addRow?: string
  addTab?: string
  removeRow?: string
  renameTab?: string
  removeTab?: string
  edit?: string
  preview?: string
  save?: string
  saveDialogTitle?: string
  saveDialogDescription?: string
  saveNameLabel?: string
  saveDescriptionLabel?: string
  saveConfirm?: string
  cancel?: string
  keysHeader?: string
  stepsHeader?: string
  keyName?: string
  keyValue?: string
  stepContextId?: string
  stepPickerLabel?: string
  applyContext?: string
  addKey?: string
  addStep?: string
  refreshing?: string
  contextError?: string
  catalogue?: string
  catalogueHint?: string
  catalogueEmpty?: string
  catalogueUnreachable?: string
  catalogueUnreachableEmpty?: string
  catalogueKeyInContext?: string
  catalogueKeyNotInContext?: string
  catalogueProducedBy?: string
  catalogueConsumedBy?: string
  catalogueNeedsKeys?: string
  cataloguePickKey?: string
}

const DEFAULT_LABELS: Required<LayoutBuilderLabels> = {
  title: "View Builder",
  palette: "Available widgets",
  paletteEmpty: "No widgets match the current key set. Add keys or steps above to unlock more.",
  canvasEmpty: "Drag a widget from the palette (or click it) to add it here.",
  canvasDropHint: "Drop to add to this row",
  addRow: "Add row",
  addTab: "Add tab",
  removeRow: "Remove row",
  renameTab: "Rename tab",
  removeTab: "Remove tab",
  edit: "Edit",
  preview: "Preview",
  save: "Save dashboard",
  saveDialogTitle: "Save dashboard",
  saveDialogDescription:
    "Persists the current layout along with the keys and steps that populate it.",
  saveNameLabel: "Name",
  saveDescriptionLabel: "Description",
  saveConfirm: "Save",
  cancel: "Cancel",
  keysHeader: "Initial keys",
  stepsHeader: "Pipeline steps",
  keyName: "key",
  keyValue: '"value", 42, or {"id":1}',
  stepContextId: "context id",
  stepPickerLabel: "Step",
  applyContext: "Apply",
  addKey: "Add key",
  addStep: "Add step",
  refreshing: "Refreshing…",
  contextError: "One or more keys have invalid JSON values — using the raw string.",
  catalogue: "Catalogue",
  catalogueHint:
    "Every key and widget the framework knows about, whether or not it's reachable right now.",
  catalogueEmpty: "No keys or widgets registered yet.",
  catalogueUnreachable: "Widgets not reachable",
  catalogueUnreachableEmpty: "Every registered widget is reachable.",
  catalogueKeyInContext: "live",
  catalogueKeyNotInContext: "not in context",
  catalogueProducedBy: "produced by",
  catalogueConsumedBy: "consumed by",
  catalogueNeedsKeys: "needs",
  cataloguePickKey: "Use as seed",
}

type DraftLayout = { kind: "rows"; rows: RowDef[] } | { kind: "tabs"; tabs: DraftTab[] }
interface DraftTab {
  label: string
  rows: RowDef[]
}

interface KeyEntry {
  name: string
  rawValue: string
}

const WIDGET_DRAG_MIME = "application/x-mcp-widget-id"

export interface LayoutBuilderProps {
  /** Optional draft layout to resume editing. */
  initialLayout?: LayoutConfig
  title?: string
  /** Initial keys that seeded the builder (also shown in the key editor). */
  initialKeys?: Record<string, unknown>
  /** Steps that were declared on the open-view-builder call (shown in the step editor). */
  initialSteps?: PipelineStepRef[]
  /** Live pipeline context — used for WYSIWYG preview of the draft layout. */
  context: PipelineContext
  /** Widgets whose `requires` are satisfied by the current key set. */
  reachableWidgets: ReachableWidget[]
  /** Widgets registered but missing one or more `requires` keys. */
  unreachableWidgets?: UnreachableWidget[]
  /** Full step catalogue — populates the step-picker dropdown. */
  availableSteps: AvailableStep[]
  /** Every key the framework could see, with producers + consumers. */
  keyCatalog?: KeyCatalogEntry[]
  /** Merged widget-component map (host-bundled + remote-loaded). */
  widgets: Record<string, WidgetComponent>
  /** Bridge to the MCP host for refresh / save round-trips. */
  callTool: (name: string, args: object) => Promise<unknown>
  /** Override the tool name used to re-run the builder pipeline. Default: `open-view-builder`. */
  builderToolName?: string
  /** Override the save tool name. Default: `save-dashboard`. */
  saveToolName?: string
  /** Optional existing dashboard id when resuming a saved layout. */
  dashboardId?: string
  labels?: LayoutBuilderLabels
  /** Called with `{ id, name }` after a successful save. */
  onSaved?: (result: { id: string; name: string }) => void
}

function emptyRows(): RowDef[] {
  return [{ row: [] }]
}

function initDraft(layout: LayoutConfig | undefined): DraftLayout {
  if (!layout) return { kind: "rows", rows: emptyRows() }
  const normalized = normalizeLayout(layout)
  if ("tabs" in normalized) {
    if (normalized.tabs.length === 0) return { kind: "rows", rows: emptyRows() }
    return {
      kind: "tabs",
      tabs: normalized.tabs.map((t) => ({ label: t.label, rows: cloneRows(t.rows) })),
    }
  }
  return { kind: "rows", rows: cloneRows(normalized.rows) }
}

function cloneRows(rows: RowDef[]): RowDef[] {
  return rows.map((r) => ({ row: r.row.map((c) => ({ ...c })) }))
}

function draftToLayout(draft: DraftLayout): LayoutConfig {
  if (draft.kind === "tabs") {
    return { tabs: draft.tabs.map((t) => ({ label: t.label, rows: cloneRows(t.rows) })) }
  }
  return { rows: cloneRows(draft.rows) }
}

function keysToEntries(keys: Record<string, unknown> | undefined): KeyEntry[] {
  if (!keys) return []
  return Object.entries(keys).map(([name, value]) => ({
    name,
    rawValue: typeof value === "string" ? value : JSON.stringify(value),
  }))
}

function parseKeyValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === "") return ""
  try {
    return JSON.parse(trimmed)
  } catch {
    return raw
  }
}

function entriesToKeys(entries: KeyEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const entry of entries) {
    if (!entry.name.trim()) continue
    out[entry.name] = parseKeyValue(entry.rawValue)
  }
  return out
}

export function LayoutBuilder({
  initialLayout,
  title,
  initialKeys,
  initialSteps,
  context,
  reachableWidgets,
  unreachableWidgets,
  availableSteps,
  keyCatalog,
  widgets,
  callTool,
  builderToolName = "open-view-builder",
  saveToolName = "save-dashboard",
  dashboardId,
  labels,
  onSaved,
}: LayoutBuilderProps) {
  const L = { ...DEFAULT_LABELS, ...labels }

  // Layout draft (rows / tabs) — lives locally, flushed to the server only on
  // save-dashboard. Never round-trips through render-view, so the user can
  // always return to edit mode (fix for "nach Render view kein Weg zurück").
  const [draft, setDraft] = useState<DraftLayout>(() => initDraft(initialLayout))
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [focusedRowIndex, setFocusedRowIndex] = useState(0)
  const [preview, setPreview] = useState(false)

  // Keys + steps editor state. Backed by a separate "live" set that only
  // updates after a successful `open-view-builder` re-run.
  const [keyEntries, setKeyEntries] = useState<KeyEntry[]>(() => keysToEntries(initialKeys))
  const [stepEntries, setStepEntries] = useState<PipelineStepRef[]>(() => initialSteps ?? [])

  // Live snapshot driven by the latest open-view-builder response. Seed from
  // props and update on refresh — including `availableSteps`, which can grow
  // as upstream-module discovery finishes after the initial load.
  const [liveReachable, setLiveReachable] = useState<ReachableWidget[]>(reachableWidgets)
  const [liveUnreachable, setLiveUnreachable] = useState<UnreachableWidget[]>(
    unreachableWidgets ?? [],
  )
  const [liveCatalog, setLiveCatalog] = useState<KeyCatalogEntry[]>(keyCatalog ?? [])
  const [liveSteps, setLiveSteps] = useState<AvailableStep[]>(availableSteps)
  const [liveContext, setLiveContext] = useState<PipelineContext>(context)
  useEffect(() => setLiveReachable(reachableWidgets), [reachableWidgets])
  useEffect(() => setLiveUnreachable(unreachableWidgets ?? []), [unreachableWidgets])
  useEffect(() => setLiveCatalog(keyCatalog ?? []), [keyCatalog])
  useEffect(() => setLiveSteps(availableSteps), [availableSteps])
  useEffect(() => setLiveContext(context), [context])

  const [isRefreshing, setRefreshing] = useState(false)
  const [isBusy, setBusy] = useState(false)

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(title ?? "")
  const [saveDescription, setSaveDescription] = useState("")

  // Drag-and-drop feedback state.
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)

  const paletteByApp = useMemo(() => {
    const groups = new Map<string, ReachableWidget[]>()
    for (const w of liveReachable) {
      if (!groups.has(w.app)) groups.set(w.app, [])
      groups.get(w.app)!.push(w)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [liveReachable])

  const widgetById = useMemo(() => {
    const map = new Map<string, ReachableWidget>()
    for (const w of liveReachable) map.set(w.id, w)
    return map
  }, [liveReachable])

  const activeRows: RowDef[] =
    draft.kind === "tabs" ? (draft.tabs[activeTabIndex]?.rows ?? []) : draft.rows

  const mutateActiveRows = useCallback(
    (fn: (rows: RowDef[]) => RowDef[]) => {
      setDraft((prev) => {
        if (prev.kind === "rows") return { kind: "rows", rows: fn(prev.rows) }
        const tabs = prev.tabs.map((t, idx) =>
          idx === activeTabIndex ? { ...t, rows: fn(t.rows) } : t,
        )
        return { kind: "tabs", tabs }
      })
    },
    [activeTabIndex],
  )

  const addWidgetToRow = useCallback(
    (widgetId: string, targetRowIdx?: number) => {
      const widget = widgetById.get(widgetId)
      if (!widget) return
      const defaultSpan = sizeToSpan(widget.size)
      mutateActiveRows((rows) => {
        const safeRows = rows.length > 0 ? rows : emptyRows()
        const idx = Math.min(Math.max(targetRowIdx ?? focusedRowIndex, 0), safeRows.length - 1)
        return safeRows.map((r, i) =>
          i === idx ? { row: [...r.row, { widget: widgetId, span: defaultSpan }] } : r,
        )
      })
      setFocusedRowIndex(targetRowIdx ?? focusedRowIndex)
    },
    [focusedRowIndex, mutateActiveRows, widgetById],
  )

  const addRow = useCallback(() => {
    mutateActiveRows((rows) => {
      const next = [...rows, { row: [] }]
      setFocusedRowIndex(next.length - 1)
      return next
    })
  }, [mutateActiveRows])

  const removeRow = useCallback(
    (rowIdx: number) => {
      mutateActiveRows((rows) => {
        const next = rows.filter((_, i) => i !== rowIdx)
        return next.length > 0 ? next : emptyRows()
      })
      setFocusedRowIndex((idx) => Math.max(0, idx - 1))
    },
    [mutateActiveRows],
  )

  const moveRow = useCallback(
    (rowIdx: number, direction: -1 | 1) => {
      mutateActiveRows((rows) => {
        const target = rowIdx + direction
        if (target < 0 || target >= rows.length) return rows
        const next = [...rows]
        const [moved] = next.splice(rowIdx, 1)
        next.splice(target, 0, moved)
        setFocusedRowIndex(target)
        return next
      })
    },
    [mutateActiveRows],
  )

  const setCellSpan = useCallback(
    (rowIdx: number, cellIdx: number, span: number) => {
      const clamped = Math.max(1, Math.min(12, span))
      mutateActiveRows((rows) =>
        rows.map((r, i) =>
          i === rowIdx
            ? { row: r.row.map((c, j) => (j === cellIdx ? { ...c, span: clamped } : c)) }
            : r,
        ),
      )
    },
    [mutateActiveRows],
  )

  const removeCell = useCallback(
    (rowIdx: number, cellIdx: number) => {
      mutateActiveRows((rows) =>
        rows.map((r, i) => (i === rowIdx ? { row: r.row.filter((_, j) => j !== cellIdx) } : r)),
      )
    },
    [mutateActiveRows],
  )

  const addTab = useCallback(() => {
    setDraft((prev) => {
      if (prev.kind === "tabs") {
        const label = `Tab ${prev.tabs.length + 1}`
        setActiveTabIndex(prev.tabs.length)
        return { kind: "tabs", tabs: [...prev.tabs, { label, rows: emptyRows() }] }
      }
      // Convert rows → tabs: the existing rows become the first tab.
      setActiveTabIndex(1)
      return {
        kind: "tabs",
        tabs: [
          { label: "Tab 1", rows: prev.rows },
          { label: "Tab 2", rows: emptyRows() },
        ],
      }
    })
  }, [])

  const renameTab = useCallback((tabIdx: number, label: string) => {
    setDraft((prev) => {
      if (prev.kind !== "tabs") return prev
      const tabs = prev.tabs.map((t, i) => (i === tabIdx ? { ...t, label } : t))
      return { kind: "tabs", tabs }
    })
  }, [])

  const removeTab = useCallback((tabIdx: number) => {
    setDraft((prev) => {
      if (prev.kind !== "tabs") return prev
      const tabs = prev.tabs.filter((_, i) => i !== tabIdx)
      setActiveTabIndex((idx) => Math.max(0, Math.min(idx, tabs.length - 1)))
      if (tabs.length === 0) {
        return { kind: "rows", rows: emptyRows() }
      }
      if (tabs.length === 1) {
        // Collapse back to rows-only form for simplicity.
        return { kind: "rows", rows: tabs[0].rows }
      }
      return { kind: "tabs", tabs }
    })
  }, [])

  // --- Keys + steps editors -------------------------------------------------

  const addKey = useCallback((prefilledName?: string) => {
    setKeyEntries((prev) => {
      if (prefilledName) {
        const existingIdx = prev.findIndex((e) => e.name === prefilledName)
        if (existingIdx >= 0) return prev
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
      const next = [...prev]
      const baseId = stepId ? stepId.split(":")[1] || stepId : `step-${prev.length + 1}`
      next.push({ id: baseId, step: stepId ?? "", optional: false })
      return next
    })
  }, [])

  const updateStep = useCallback((idx: number, patch: Partial<PipelineStepRef>) => {
    setStepEntries((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }, [])

  const removeStep = useCallback((idx: number) => {
    setStepEntries((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const refreshBuilder = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = (await callTool(builderToolName, {
        keys: entriesToKeys(keyEntries),
        steps: stepEntries.filter((s) => s.step.trim().length > 0),
        layout: draftToLayout(draft),
        title,
      })) as {
        structuredContent?: {
          reachableWidgets?: ReachableWidget[]
          unreachableWidgets?: UnreachableWidget[]
          availableSteps?: AvailableStep[]
          keyCatalog?: KeyCatalogEntry[]
          context?: PipelineContext
        }
      }
      const sc = result.structuredContent
      if (sc?.reachableWidgets) setLiveReachable(sc.reachableWidgets)
      if (sc?.unreachableWidgets) setLiveUnreachable(sc.unreachableWidgets)
      if (sc?.availableSteps) setLiveSteps(sc.availableSteps)
      if (sc?.keyCatalog) setLiveCatalog(sc.keyCatalog)
      if (sc?.context) setLiveContext(sc.context)
    } finally {
      setRefreshing(false)
    }
  }, [builderToolName, callTool, draft, keyEntries, stepEntries, title])

  // --- Save dialog ----------------------------------------------------------

  const saveDraft = useCallback(async () => {
    if (!saveName.trim()) return
    setBusy(true)
    try {
      const result = (await callTool(saveToolName, {
        id: dashboardId,
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        keys: entriesToKeys(keyEntries),
        steps: stepEntries.filter((s) => s.step.trim().length > 0),
        layout: draftToLayout(draft),
        title,
      })) as { structuredContent?: { id?: string; name?: string } }
      setSaveOpen(false)
      if (result.structuredContent?.id && onSaved) {
        onSaved({
          id: result.structuredContent.id,
          name: result.structuredContent.name ?? saveName.trim(),
        })
      }
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

  const widgetProps: WidgetProps = { keys: liveContext.keys, context: liveContext }
  const hasAnyCell = activeRows.some((r) => r.row.length > 0)

  // --- Preview path ---------------------------------------------------------

  if (preview) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="text-primary size-4" />
            <h2 className="text-lg font-semibold">{title ?? L.title}</h2>
            <Badge variant="outline">{L.preview}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPreview(false)}>
            <Pencil /> {L.edit}
          </Button>
        </div>
        <PreviewPane
          draft={draft}
          activeTabIndex={activeTabIndex}
          setActiveTabIndex={setActiveTabIndex}
          widgets={widgets}
          widgetProps={widgetProps}
        />
      </div>
    )
  }

  // --- Edit path ------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" />
          <h2 className="text-lg font-semibold">{title ?? L.title}</h2>
          <Badge variant="secondary">Builder</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreview(true)}
            disabled={isBusy || isRefreshing || !hasAnyCell}
          >
            <Eye /> {L.preview}
          </Button>
          <Button
            size="sm"
            onClick={() => setSaveOpen(true)}
            disabled={isBusy || isRefreshing || !hasAnyCell}
          >
            <Save /> {L.save}
          </Button>
        </div>
      </div>

      <ContextEditor
        labels={L}
        keyEntries={keyEntries}
        stepEntries={stepEntries}
        availableSteps={liveSteps}
        keyCatalog={liveCatalog}
        isRefreshing={isRefreshing}
        onAddKey={addKey}
        onUpdateKey={updateKey}
        onRemoveKey={removeKey}
        onAddStep={addStep}
        onUpdateStep={updateStep}
        onRemoveStep={removeStep}
        onApply={() => void refreshBuilder()}
      />

      <CataloguePanel
        labels={L}
        keyCatalog={liveCatalog}
        availableSteps={liveSteps}
        unreachableWidgets={liveUnreachable}
        onSeedKey={(name) => addKey(name)}
      />

      {draft.kind === "tabs" ? (
        <Tabs
          value={draft.tabs[activeTabIndex]?.label ?? ""}
          onValueChange={(label) => {
            const idx = draft.tabs.findIndex((t) => t.label === label)
            if (idx >= 0) setActiveTabIndex(idx)
          }}
        >
          <div className="flex items-center gap-2">
            <TabsList>
              {draft.tabs.map((tab) => (
                <TabsTrigger key={tab.label} value={tab.label}>
                  {tab.label}
                </TabsTrigger>
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
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const next = window.prompt(L.renameTab, draft.tabs[activeTabIndex]?.label ?? "")
                if (next && next.trim()) renameTab(activeTabIndex, next.trim())
              }}
            >
              {L.renameTab}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => removeTab(activeTabIndex)}>
              {L.removeTab}
            </Button>
          </div>
          {draft.tabs.map((tab, idx) => (
            <TabsContent key={tab.label} value={tab.label} className="mt-3">
              {idx === activeTabIndex ? (
                <BuilderWorkspace
                  labels={L}
                  activeRows={activeRows}
                  focusedRowIndex={focusedRowIndex}
                  dragOverRow={dragOverRow}
                  setDragOverRow={setDragOverRow}
                  setFocusedRowIndex={setFocusedRowIndex}
                  onAddRow={addRow}
                  onRemoveRow={removeRow}
                  onMoveRow={moveRow}
                  onSetCellSpan={setCellSpan}
                  onRemoveCell={removeCell}
                  onAddWidget={addWidgetToRow}
                  widgets={widgets}
                  widgetProps={widgetProps}
                  paletteByApp={paletteByApp}
                  paletteCount={liveReachable.length}
                />
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={addTab}
              aria-label={L.addTab}
              title={L.addTab}
            >
              <Plus /> {L.addTab}
            </Button>
          </div>
          <BuilderWorkspace
            labels={L}
            activeRows={activeRows}
            focusedRowIndex={focusedRowIndex}
            dragOverRow={dragOverRow}
            setDragOverRow={setDragOverRow}
            setFocusedRowIndex={setFocusedRowIndex}
            onAddRow={addRow}
            onRemoveRow={removeRow}
            onMoveRow={moveRow}
            onSetCellSpan={setCellSpan}
            onRemoveCell={removeCell}
            onAddWidget={addWidgetToRow}
            widgets={widgets}
            widgetProps={widgetProps}
            paletteByApp={paletteByApp}
            paletteCount={liveReachable.length}
          />
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{L.saveDialogTitle}</DialogTitle>
            <DialogDescription>{L.saveDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{L.saveNameLabel}</span>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Invoice overview"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{L.saveDescriptionLabel}</span>
              <Input
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{L.cancel}</Button>
            </DialogClose>
            <Button
              disabled={!saveName.trim() || isBusy}
              onClick={() => {
                void saveDraft()
              }}
            >
              {L.saveConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Sub-components
// -------------------------------------------------------------------------- //

function ContextEditor({
  labels,
  keyEntries,
  stepEntries,
  availableSteps,
  keyCatalog,
  isRefreshing,
  onAddKey,
  onUpdateKey,
  onRemoveKey,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  onApply,
}: {
  labels: Required<LayoutBuilderLabels>
  keyEntries: KeyEntry[]
  stepEntries: PipelineStepRef[]
  availableSteps: AvailableStep[]
  keyCatalog: KeyCatalogEntry[]
  isRefreshing: boolean
  onAddKey: () => void
  onUpdateKey: (idx: number, patch: Partial<KeyEntry>) => void
  onRemoveKey: (idx: number) => void
  onAddStep: (stepId?: string) => void
  onUpdateStep: (idx: number, patch: Partial<PipelineStepRef>) => void
  onRemoveStep: (idx: number) => void
  onApply: () => void
}) {
  const datalistId = useId()
  return (
    <Card className="gap-0 p-3">
      <datalist id={datalistId}>
        {keyCatalog.map((e) => (
          <option key={e.key} value={e.key} />
        ))}
      </datalist>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {labels.keysHeader}
          </div>
          {keyEntries.length === 0 ? (
            <div className="text-muted-foreground text-xs italic">
              No keys yet — add one below to unlock widgets.
            </div>
          ) : (
            keyEntries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  value={entry.name}
                  onChange={(e) => onUpdateKey(idx, { name: e.target.value })}
                  placeholder={labels.keyName}
                  className="font-mono text-xs"
                  list={datalistId}
                />
                <Input
                  value={entry.rawValue}
                  onChange={(e) => onUpdateKey(idx, { rawValue: e.target.value })}
                  placeholder={labels.keyValue}
                  className="font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemoveKey(idx)}
                  aria-label="Remove key"
                >
                  <X />
                </Button>
              </div>
            ))
          )}
          <Button variant="outline" size="sm" onClick={onAddKey} className="self-start">
            <Plus /> {labels.addKey}
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {labels.stepsHeader}
          </div>
          {stepEntries.length === 0 ? (
            <div className="text-muted-foreground text-xs italic">
              No steps yet — optional, but widgets that need step-produced keys stay hidden without
              them.
            </div>
          ) : (
            stepEntries.map((step, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  value={step.id}
                  onChange={(e) => onUpdateStep(idx, { id: e.target.value })}
                  placeholder={labels.stepContextId}
                  className="w-28 font-mono text-xs"
                />
                <Select
                  value={step.step || undefined}
                  onValueChange={(value) => onUpdateStep(idx, { step: value })}
                >
                  <SelectTrigger className="h-9 flex-1 text-xs">
                    <SelectValue placeholder={labels.stepPickerLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSteps.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-mono text-xs">{s.id}</span>
                        <span className="text-muted-foreground ml-2 text-[10px]">
                          {s.requires.length > 0 ? `← ${s.requires.join(", ")}` : "(no inputs)"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemoveStep(idx)}
                  aria-label="Remove step"
                >
                  <X />
                </Button>
              </div>
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddStep()}
            className="self-start"
            disabled={availableSteps.length === 0}
          >
            <Plus /> {labels.addStep}
          </Button>
        </section>
      </div>

      <Separator className="my-3" />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onApply} disabled={isRefreshing}>
          {isRefreshing ? (
            <>
              <RefreshCw className="animate-spin" /> {labels.refreshing}
            </>
          ) : (
            <>
              <RefreshCw /> {labels.applyContext}
            </>
          )}
        </Button>
        <span className="text-muted-foreground text-xs">
          Applies new keys + steps and refreshes the palette.
        </span>
      </div>
    </Card>
  )
}

function CataloguePanel({
  labels,
  keyCatalog,
  availableSteps,
  unreachableWidgets,
  onSeedKey,
}: {
  labels: Required<LayoutBuilderLabels>
  keyCatalog: KeyCatalogEntry[]
  availableSteps: AvailableStep[]
  unreachableWidgets: UnreachableWidget[]
  onSeedKey: (name: string) => void
}) {
  return (
    <Card className="gap-0 p-3">
      <details open>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none">
          <Library className="size-4" />
          {labels.catalogue}
          <span className="text-muted-foreground text-xs font-normal">
            — {labels.catalogueHint}
          </span>
        </summary>

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              Keys
              <Badge variant="outline">{keyCatalog.length}</Badge>
            </div>
            {keyCatalog.length === 0 ? (
              <div className="text-muted-foreground text-xs italic">{labels.catalogueEmpty}</div>
            ) : (
              <ScrollArea className="max-h-[40vh]">
                <ul className="flex flex-col gap-1 pr-2">
                  {keyCatalog.map((entry) => (
                    <li
                      key={entry.key}
                      className="hover:bg-accent/50 flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono">{entry.key}</span>
                          <Badge
                            variant={entry.inContext ? "default" : "outline"}
                            className="shrink-0 text-[10px]"
                          >
                            {entry.inContext
                              ? labels.catalogueKeyInContext
                              : labels.catalogueKeyNotInContext}
                          </Badge>
                        </div>
                        {(entry.producedBySteps.length > 0 ||
                          entry.consumedBySteps.length > 0 ||
                          entry.consumedByWidgets.length > 0) && (
                          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                            {entry.producedBySteps.length > 0 && (
                              <span>
                                {labels.catalogueProducedBy}:{" "}
                                <span className="font-mono">
                                  {entry.producedBySteps.join(", ")}
                                </span>
                              </span>
                            )}
                            {entry.consumedBySteps.length > 0 && (
                              <span>
                                step {labels.catalogueConsumedBy}:{" "}
                                <span className="font-mono">
                                  {entry.consumedBySteps.join(", ")}
                                </span>
                              </span>
                            )}
                            {entry.consumedByWidgets.length > 0 && (
                              <span>
                                widget {labels.catalogueConsumedBy}:{" "}
                                <span className="font-mono">
                                  {entry.consumedByWidgets.join(", ")}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {!entry.inContext && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="shrink-0"
                          onClick={() => onSeedKey(entry.key)}
                          title={labels.cataloguePickKey}
                        >
                          <Plus />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </section>

          <section>
            <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              Steps
              <Badge variant="outline">{availableSteps.length}</Badge>
            </div>
            {availableSteps.length === 0 ? (
              <div className="text-muted-foreground text-xs italic">No steps registered.</div>
            ) : (
              <ScrollArea className="max-h-[40vh]">
                <ul className="flex flex-col gap-1 pr-2">
                  {availableSteps.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <span className="truncate font-mono">{s.id}</span>
                      <span className="text-muted-foreground">
                        {s.requires.length > 0 ? `← ${s.requires.join(", ")}` : "(no inputs)"}
                        {" → "}
                        {s.produces.length > 0 ? s.produces.join(", ") : "(nothing)"}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </section>
        </div>

        <Separator className="my-3" />

        <div>
          <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            {labels.catalogueUnreachable}
            <Badge variant="outline">{unreachableWidgets.length}</Badge>
          </div>
          {unreachableWidgets.length === 0 ? (
            <div className="text-muted-foreground text-xs italic">
              {labels.catalogueUnreachableEmpty}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
              {unreachableWidgets.map((w) => (
                <li
                  key={w.id}
                  className="bg-muted/20 flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs"
                >
                  <span className="truncate font-mono">{w.id}</span>
                  <span className="text-muted-foreground">
                    {labels.catalogueNeedsKeys}:{" "}
                    <span className="font-mono">{w.missingKeys.join(", ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </Card>
  )
}

function BuilderWorkspace({
  labels,
  activeRows,
  focusedRowIndex,
  dragOverRow,
  setDragOverRow,
  setFocusedRowIndex,
  onAddRow,
  onRemoveRow,
  onMoveRow,
  onSetCellSpan,
  onRemoveCell,
  onAddWidget,
  widgets,
  widgetProps,
  paletteByApp,
  paletteCount,
}: {
  labels: Required<LayoutBuilderLabels>
  activeRows: RowDef[]
  focusedRowIndex: number
  dragOverRow: number | null
  setDragOverRow: (idx: number | null) => void
  setFocusedRowIndex: (idx: number) => void
  onAddRow: () => void
  onRemoveRow: (rowIdx: number) => void
  onMoveRow: (rowIdx: number, direction: -1 | 1) => void
  onSetCellSpan: (rowIdx: number, cellIdx: number, span: number) => void
  onRemoveCell: (rowIdx: number, cellIdx: number) => void
  onAddWidget: (widgetId: string, targetRowIdx?: number) => void
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
  paletteByApp: [string, ReachableWidget[]][]
  paletteCount: number
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 md:col-span-4 lg:col-span-3">
        <Card className="gap-0 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            <span>{labels.palette}</span>
            <Badge variant="outline">{paletteCount}</Badge>
          </div>
          <Separator className="mb-2" />
          {paletteCount === 0 ? (
            <div className="text-muted-foreground text-xs">{labels.paletteEmpty}</div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="flex flex-col gap-3 pr-2">
                {paletteByApp.map(([app, ws]) => (
                  <div key={app} className="flex flex-col gap-1">
                    <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      {app}
                    </div>
                    {ws.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(WIDGET_DRAG_MIME, w.id)
                          e.dataTransfer.effectAllowed = "copy"
                        }}
                        onClick={() => onAddWidget(w.id)}
                        className="hover:bg-accent hover:text-accent-foreground group flex cursor-grab flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors active:cursor-grabbing"
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="truncate font-mono">{w.id}</span>
                          <GripVertical className="text-muted-foreground size-3" />
                        </span>
                        {w.requires.length > 0 && (
                          <span className="text-muted-foreground truncate">
                            requires: {w.requires.join(", ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>
      </aside>

      <section className="col-span-12 md:col-span-8 lg:col-span-9">
        <div className="flex flex-col gap-3">
          {activeRows.map((row, rowIdx) => (
            <BuilderRow
              key={rowIdx}
              labels={labels}
              row={row}
              rowIdx={rowIdx}
              focused={rowIdx === focusedRowIndex}
              isFirst={rowIdx === 0}
              isLast={rowIdx === activeRows.length - 1}
              dragOver={dragOverRow === rowIdx}
              setDragOverRow={setDragOverRow}
              setFocusedRowIndex={setFocusedRowIndex}
              onRemoveRow={onRemoveRow}
              onMoveRow={onMoveRow}
              onSetCellSpan={onSetCellSpan}
              onRemoveCell={onRemoveCell}
              onAddWidget={onAddWidget}
              widgets={widgets}
              widgetProps={widgetProps}
            />
          ))}
          <div>
            <Button variant="outline" size="sm" onClick={onAddRow}>
              <Plus /> {labels.addRow}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function BuilderRow({
  labels,
  row,
  rowIdx,
  focused,
  isFirst,
  isLast,
  dragOver,
  setDragOverRow,
  setFocusedRowIndex,
  onRemoveRow,
  onMoveRow,
  onSetCellSpan,
  onRemoveCell,
  onAddWidget,
  widgets,
  widgetProps,
}: {
  labels: Required<LayoutBuilderLabels>
  row: RowDef
  rowIdx: number
  focused: boolean
  isFirst: boolean
  isLast: boolean
  dragOver: boolean
  setDragOverRow: (idx: number | null) => void
  setFocusedRowIndex: (idx: number) => void
  onRemoveRow: (rowIdx: number) => void
  onMoveRow: (rowIdx: number, direction: -1 | 1) => void
  onSetCellSpan: (rowIdx: number, cellIdx: number, span: number) => void
  onRemoveCell: (rowIdx: number, cellIdx: number) => void
  onAddWidget: (widgetId: string, targetRowIdx?: number) => void
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)

  return (
    <Card
      onClick={() => setFocusedRowIndex(rowIdx)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(WIDGET_DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        setDragOverRow(rowIdx)
      }}
      onDragLeave={(e) => {
        // Only clear if leaving the card itself, not a child element.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOverRow(null)
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(WIDGET_DRAG_MIME)
        setDragOverRow(null)
        if (id) {
          e.preventDefault()
          onAddWidget(id, rowIdx)
        }
      }}
      data-focused={focused}
      className={
        "gap-0 p-3 transition-colors " +
        (focused ? "ring-ring ring-2 ring-offset-1 " : "") +
        (dragOver ? "bg-accent/40" : "")
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Rows3 className="size-3.5" />
          Row {rowIdx + 1}
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5">
            {row.row.length} widget{row.row.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onMoveRow(rowIdx, -1)
            }}
            disabled={isFirst}
            aria-label="Move row up"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onMoveRow(rowIdx, 1)
            }}
            disabled={isLast}
            aria-label="Move row down"
          >
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveRow(rowIdx)
            }}
            aria-label={labels.removeRow}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {row.row.length === 0 ? (
        <div
          className={
            "rounded-md border border-dashed p-4 text-center text-xs transition-colors " +
            (dragOver
              ? "border-primary text-primary"
              : "border-muted-foreground/30 text-muted-foreground")
          }
        >
          {dragOver ? labels.canvasDropHint : labels.canvasEmpty}
        </div>
      ) : (
        <div ref={gridRef} data-row-grid>
          <GridLayout>
            {row.row.map((cell, cellIdx) => {
              const span = cell.span ?? 12
              const Widget = widgets[cell.widget]
              return (
                <GridItem key={`${cell.widget}-${cellIdx}`} span={span}>
                  <div className="border-border bg-card relative overflow-hidden rounded-md border">
                    <div className="bg-muted/40 flex items-center justify-between gap-2 px-2 py-1 text-xs">
                      <span className="text-muted-foreground truncate font-mono">
                        {cell.widget}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground min-w-8 text-center font-mono">
                          {span}/12
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveCell(rowIdx, cellIdx)
                          }}
                          aria-label="Remove widget"
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                    <div className="p-2">
                      {Widget ? (
                        <Widget {...widgetProps} />
                      ) : (
                        <div className="text-muted-foreground rounded border border-dashed p-4 text-center text-xs">
                          Widget "{cell.widget}" not bundled.
                        </div>
                      )}
                    </div>
                    <ResizeHandle
                      rowIdx={rowIdx}
                      cellIdx={cellIdx}
                      span={span}
                      getGridEl={() => gridRef.current}
                      onSetCellSpan={onSetCellSpan}
                    />
                  </div>
                </GridItem>
              )
            })}
          </GridLayout>
        </div>
      )}
    </Card>
  )
}

/**
 * Right-edge grab handle. On pointerDown it captures the pointer, measures
 * the enclosing row's grid width, and converts mouse movement to integer
 * span deltas (1 col = gridWidth / 12).
 */
function ResizeHandle({
  rowIdx,
  cellIdx,
  span,
  getGridEl,
  onSetCellSpan,
}: {
  rowIdx: number
  cellIdx: number
  span: number
  getGridEl: () => HTMLElement | null
  onSetCellSpan: (rowIdx: number, cellIdx: number, span: number) => void
}) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const grid = getGridEl()
      if (!grid) return
      const rect = grid.getBoundingClientRect()
      const colWidth = rect.width / 12
      const startX = e.clientX
      const startSpan = span
      // Shared closure — avoids the mutual dependency between move/up
      // handlers that plagues the useCallback-per-handler pattern.
      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX
        const next = Math.round(startSpan + delta / colWidth)
        onSetCellSpan(rowIdx, cellIdx, Math.max(1, Math.min(12, next)))
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [cellIdx, getGridEl, onSetCellSpan, rowIdx, span],
  )

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className="hover:bg-primary/40 absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none select-none"
      aria-label="Resize widget"
      role="separator"
    />
  )
}

function PreviewPane({
  draft,
  activeTabIndex,
  setActiveTabIndex,
  widgets,
  widgetProps,
}: {
  draft: DraftLayout
  activeTabIndex: number
  setActiveTabIndex: (idx: number) => void
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
}) {
  const rows = draft.kind === "tabs" ? (draft.tabs[activeTabIndex]?.rows ?? []) : draft.rows
  const renderRows = (rs: RowDef[]) => (
    <div className="flex flex-col gap-4">
      {rs.map((row, rowIdx) => (
        <GridLayout key={rowIdx}>
          {row.row.map((cell, cellIdx) => {
            const Widget = widgets[cell.widget]
            return (
              <GridItem key={`${cell.widget}-${cellIdx}`} span={cell.span ?? 12}>
                {Widget ? (
                  <Widget {...widgetProps} />
                ) : (
                  <div className="text-muted-foreground rounded border border-dashed p-4 text-center text-xs">
                    Widget "{cell.widget}" not bundled.
                  </div>
                )}
              </GridItem>
            )
          })}
        </GridLayout>
      ))}
    </div>
  )

  if (draft.kind === "tabs") {
    return (
      <Tabs
        value={draft.tabs[activeTabIndex]?.label ?? ""}
        onValueChange={(label) => {
          const idx = draft.tabs.findIndex((t) => t.label === label)
          if (idx >= 0) setActiveTabIndex(idx)
        }}
      >
        <TabsList>
          {draft.tabs.map((tab) => (
            <TabsTrigger key={tab.label} value={tab.label}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {draft.tabs.map((tab) => (
          <TabsContent key={tab.label} value={tab.label} className="mt-3">
            {renderRows(tab.rows)}
          </TabsContent>
        ))}
      </Tabs>
    )
  }
  return renderRows(rows)
}

function sizeToSpan(size: string): number {
  switch (size) {
    case "quarter":
      return 3
    case "third":
      return 4
    case "half":
      return 6
    case "full":
    case "header":
      return 12
    default:
      return 12
  }
}
