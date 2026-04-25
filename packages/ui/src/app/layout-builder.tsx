import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownToLine,
  ArrowRightToLine,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Eye,
  GripVertical,
  Layers,
  Library,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
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
import { cn } from "../lib/utils.js"
import { Badge } from "../primitives/badge.js"
import { Button } from "../primitives/button.js"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select.js"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../primitives/sheet.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs.js"
import type { WidgetComponent } from "./widget-renderer.js"

// -------------------------------------------------------------------------- //
// Types & labels
// -------------------------------------------------------------------------- //

export interface LayoutBuilderLabels {
  title?: string
  builderBadge?: string
  previewBadge?: string
  catalogue?: string
  save?: string
  viewLayoutTab?: string
  viewPipelineTab?: string
  viewPreviewTab?: string
  saveDialogTitle?: string
  saveDialogDescription?: string
  saveNameLabel?: string
  saveDescriptionLabel?: string
  saveConfirm?: string
  cancel?: string
  pipelineHeader?: string
  keysHeader?: string
  stepsHeader?: string
  keyName?: string
  keyValue?: string
  stepContextId?: string
  stepPickerLabel?: string
  addKey?: string
  addStep?: string
  emptyKeys?: string
  emptySteps?: string
  statusUpToDate?: string
  statusPending?: string
  statusRefreshing?: string
  paletteHeader?: string
  paletteEmpty?: string
  canvasEmpty?: string
  canvasDropHint?: string
  addRow?: string
  addTab?: string
  removeRow?: string
  renameTab?: string
  removeTab?: string
  tabsLabel?: string
  catalogueDescription?: string
  catalogueKeys?: string
  catalogueSteps?: string
  catalogueUnreachable?: string
  catalogueUnreachableEmpty?: string
  catalogueProducedBy?: string
  catalogueConsumedBy?: string
  catalogueNeedsKeys?: string
  cataloguePickKey?: string
  catalogueAddProducingStep?: string
  catalogueLive?: string
  catalogueMissing?: string
}

const DEFAULT_LABELS: Required<LayoutBuilderLabels> = {
  title: "View Builder",
  builderBadge: "Builder",
  previewBadge: "Preview",
  catalogue: "Catalogue",
  save: "Save",
  viewLayoutTab: "Layout",
  viewPipelineTab: "Pipeline",
  viewPreviewTab: "Preview",
  saveDialogTitle: "Save dashboard",
  saveDialogDescription:
    "Persists the current layout along with the keys and steps that populate it.",
  saveNameLabel: "Name",
  saveDescriptionLabel: "Description",
  saveConfirm: "Save dashboard",
  cancel: "Cancel",
  pipelineHeader: "Pipeline",
  keysHeader: "Keys",
  stepsHeader: "Steps",
  keyName: "key",
  keyValue: 'value, "literal", true, {…}',
  stepContextId: "ctx id",
  stepPickerLabel: "pick a step",
  addKey: "Add key",
  addStep: "Add step",
  emptyKeys: "No keys seeded.",
  emptySteps: "No steps configured.",
  statusUpToDate: "Up to date",
  statusPending: "Applying soon…",
  statusRefreshing: "Applying…",
  paletteHeader: "Palette",
  paletteEmpty: "No widgets reachable yet — seed a key or add a step.",
  canvasEmpty: "Drag a widget here, or click one in the palette.",
  canvasDropHint: "Drop to add",
  addRow: "Add row",
  addTab: "Add tab",
  removeRow: "Remove row",
  renameTab: "Rename tab",
  removeTab: "Remove tab",
  tabsLabel: "Tabs",
  catalogueDescription:
    "Every key and widget the framework knows about, whether or not it's reachable right now.",
  catalogueKeys: "Keys",
  catalogueSteps: "Steps",
  catalogueUnreachable: "Unreachable widgets",
  catalogueUnreachableEmpty: "Every registered widget is reachable.",
  catalogueProducedBy: "produced by",
  catalogueConsumedBy: "consumed by",
  catalogueNeedsKeys: "needs",
  cataloguePickKey: "Add as key",
  catalogueAddProducingStep: "Add producing step",
  catalogueLive: "live",
  catalogueMissing: "missing",
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
  initialLayout?: LayoutConfig
  title?: string
  initialKeys?: Record<string, unknown>
  initialSteps?: PipelineStepRef[]
  context: PipelineContext
  reachableWidgets: ReachableWidget[]
  unreachableWidgets?: UnreachableWidget[]
  availableSteps: AvailableStep[]
  keyCatalog?: KeyCatalogEntry[]
  widgets: Record<string, WidgetComponent>
  callTool: (name: string, args: object) => Promise<unknown>
  builderToolName?: string
  saveToolName?: string
  dashboardId?: string
  labels?: LayoutBuilderLabels
  onSaved?: (result: { id: string; name: string }) => void
}

// -------------------------------------------------------------------------- //
// Helpers
// -------------------------------------------------------------------------- //

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

/**
 * Parses a value the user typed into a key field.
 *
 * Only treats the input as JSON when there's an *obvious* JSON marker
 * (`{`, `[`, `"`) or it's a literal `true` / `false` / `null`. Bare
 * numbers and bare words stay as strings, because IDs in this builder
 * are strings ~99% of the time and `id = "1"` typed without quotes was
 * silently turning into the number `1` and breaking widgets.
 *
 * Users who really want a primitive number / boolean / object can still
 * type `[1,2]`, `{"id":1}`, `true` etc. with explicit JSON syntax.
 */
function parseKeyValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === "") return ""
  const first = trimmed[0]
  const looksLikeJson = first === "{" || first === "[" || first === '"'
  const isLiteral = trimmed === "true" || trimmed === "false" || trimmed === "null"
  if (!looksLikeJson && !isLiteral) return raw
  try {
    return JSON.parse(trimmed)
  } catch {
    return raw
  }
}

/**
 * Inverse of `parseKeyValue`. Round-trip safe: any value whose plain
 * string form would change type when re-parsed (e.g. the literal string
 * `"true"`) is wrapped in JSON quotes so the next edit cycle preserves
 * the original type.
 */
function keysToEntries(keys: Record<string, unknown> | undefined): KeyEntry[] {
  if (!keys) return []
  return Object.entries(keys).map(([name, value]) => {
    if (typeof value === "string") {
      const reparsed = parseKeyValue(value)
      if (typeof reparsed !== "string" || reparsed !== value) {
        return { name, rawValue: JSON.stringify(value) }
      }
      return { name, rawValue: value }
    }
    return { name, rawValue: JSON.stringify(value) }
  })
}

/**
 * Compact preview of a value as it currently lives in the pipeline.
 * Used as the placeholder when the editor's `rawValue` is empty so the
 * user can see what the server is actually working with right now
 * without the editor overwriting their (empty) input.
 */
function formatLiveKeyValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (value === "") return undefined
  if (typeof value === "string") return `live: ${value}`
  try {
    return `live: ${JSON.stringify(value)}`
  } catch {
    return undefined
  }
}

function valueTypeLabel(raw: string): string {
  if (raw === "") return "str"
  const v = parseKeyValue(raw)
  if (v === null) return "null"
  if (Array.isArray(v)) return "arr"
  if (typeof v === "object") return "obj"
  switch (typeof v) {
    case "string":
      return "str"
    case "number":
      return "num"
    case "boolean":
      return "bool"
    default:
      return (typeof v as string).slice(0, 4)
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

function defaultStepIdFor(stepId: string, takenIds: Set<string>): string {
  const base = stepId.split(":")[1] || stepId.replace(/[^a-z0-9]/gi, "-")
  if (!takenIds.has(base)) return base
  let i = 2
  while (takenIds.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

// -------------------------------------------------------------------------- //
// Main component
// -------------------------------------------------------------------------- //

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

  // ── Draft layout ────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<DraftLayout>(() => initDraft(initialLayout))
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [focusedRowIndex, setFocusedRowIndex] = useState(0)
  const [view, setView] = useState<"layout" | "pipeline" | "preview">("layout")
  const [catalogueOpen, setCatalogueOpen] = useState(false)

  // ── Keys + steps editor state ───────────────────────────────────────────
  const [keyEntries, setKeyEntries] = useState<KeyEntry[]>(() => keysToEntries(initialKeys))
  const [stepEntries, setStepEntries] = useState<PipelineStepRef[]>(() => initialSteps ?? [])

  // ── Live snapshots from open-view-builder responses ─────────────────────
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

  // ── Refresh status (for the auto-apply chip) ────────────────────────────
  type RefreshStatus = "idle" | "pending" | "refreshing"
  const [status, setStatus] = useState<RefreshStatus>("idle")

  // ── Save dialog ─────────────────────────────────────────────────────────
  const [isBusy, setBusy] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(title ?? "")
  const [saveDescription, setSaveDescription] = useState("")

  // ── DnD ──────────────────────────────────────────────────────────────────
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)

  // ── Derived ─────────────────────────────────────────────────────────────
  const widgetById = useMemo(() => {
    const map = new Map<string, ReachableWidget>()
    for (const w of liveReachable) map.set(w.id, w)
    return map
  }, [liveReachable])

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

  // ── Layout mutations ────────────────────────────────────────────────────
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
      return { kind: "tabs", tabs: prev.tabs.map((t, i) => (i === tabIdx ? { ...t, label } : t)) }
    })
  }, [])

  const removeTab = useCallback((tabIdx: number) => {
    setDraft((prev) => {
      if (prev.kind !== "tabs") return prev
      const tabs = prev.tabs.filter((_, i) => i !== tabIdx)
      setActiveTabIndex((idx) => Math.max(0, Math.min(idx, tabs.length - 1)))
      if (tabs.length === 0) return { kind: "rows", rows: emptyRows() }
      if (tabs.length === 1) return { kind: "rows", rows: tabs[0].rows }
      return { kind: "tabs", tabs }
    })
  }, [])

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

  // ── Refresh + auto-apply ────────────────────────────────────────────────
  const refreshBuilder = useCallback(async () => {
    setStatus("refreshing")
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
      setStatus("idle")
    }
  }, [builderToolName, callTool, draft, keyEntries, stepEntries, title])

  // Auto-apply on key/step edits, debounced. Skip the very first render (we
  // already have fresh server-side state from the props). The ref pattern
  // keeps the effect dependent on only `keyEntries` / `stepEntries` — without
  // it, every layout edit would also retrigger the apply because
  // `refreshBuilder`'s identity depends on `draft` etc.
  const refreshRef = useRef(refreshBuilder)
  useEffect(() => {
    refreshRef.current = refreshBuilder
  }, [refreshBuilder])
  const skipFirstAutoApply = useRef(true)
  useEffect(() => {
    if (skipFirstAutoApply.current) {
      skipFirstAutoApply.current = false
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

  // ── Smart action: add a producing step for a missing key ────────────────
  const addProducingStepFor = useCallback(
    (key: string) => {
      const producer = liveCatalog.find((c) => c.key === key)?.producedBySteps[0]
      if (!producer) return
      addStep(producer)
    },
    [addStep, liveCatalog],
  )

  const widgetProps: WidgetProps = { keys: liveContext.keys, context: liveContext }
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
          <div className="ml-auto flex items-center gap-1">
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
        </div>
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
        hasAnyCell={hasAnyCell}
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
        onOpenChange={setSaveOpen}
        name={saveName}
        setName={setSaveName}
        description={saveDescription}
        setDescription={setSaveDescription}
        onSubmit={saveDraft}
        busy={isBusy}
      />
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
// Toolbar — sticky top, dense status row + actions
// -------------------------------------------------------------------------- //

function Toolbar({
  L,
  previewMode,
  isBusy,
  status,
  liveKeys,
  reachableCount,
  unreachableCount,
  onOpenCatalogue,
  onOpenSave,
  hasAnyCell,
}: {
  L: Required<LayoutBuilderLabels>
  previewMode: boolean
  isBusy: boolean
  status: "idle" | "pending" | "refreshing"
  liveKeys: number
  reachableCount: number
  unreachableCount: number
  onOpenCatalogue: () => void
  onOpenSave: () => void
  hasAnyCell: boolean
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-b px-1 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md",
            previewMode ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary",
          )}
          aria-hidden="true"
        >
          {previewMode ? <Eye className="size-3.5" /> : <Layers className="size-3.5" />}
        </span>
        <h2 className="text-sm font-semibold tracking-tight">{L.title}</h2>
        <Badge variant={previewMode ? "outline" : "secondary"} className="font-normal">
          {previewMode ? L.previewBadge : L.builderBadge}
        </Badge>
      </div>

      <div className="text-muted-foreground hidden items-center gap-3 text-[11px] sm:flex">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>
            <span className="text-foreground font-medium">{liveKeys}</span> live
          </span>
        </span>
        <span className="bg-border h-3 w-px" aria-hidden="true" />
        <span>
          <span className="text-foreground font-medium">{reachableCount}</span> reachable
        </span>
        {unreachableCount > 0 && (
          <>
            <span className="bg-border h-3 w-px" aria-hidden="true" />
            <span>
              <span className="text-foreground font-medium">{unreachableCount}</span> unreachable
            </span>
          </>
        )}
        <StatusChip status={status} L={L} />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onOpenCatalogue}>
          <Library /> {L.catalogue}
        </Button>
        <Button size="sm" onClick={onOpenSave} disabled={isBusy || !hasAnyCell}>
          <Save /> {L.save}
        </Button>
      </div>
    </header>
  )
}

function StatusChip({
  status,
  L,
}: {
  status: "idle" | "pending" | "refreshing"
  L: Required<LayoutBuilderLabels>
}) {
  if (status === "idle") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <CircleDot className="size-3" />
        {L.statusUpToDate}
      </span>
    )
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
        {L.statusPending}
      </span>
    )
  }
  return (
    <span className="text-primary inline-flex items-center gap-1.5">
      <Loader2 className="size-3 animate-spin" />
      {L.statusRefreshing}
    </span>
  )
}

// -------------------------------------------------------------------------- //
// Pipeline strip — compact horizontal Keys + Steps
// -------------------------------------------------------------------------- //

function PipelineStrip({
  L,
  keyEntries,
  stepEntries,
  keyCatalog,
  availableSteps,
  stepsByApp,
  liveKeys,
  onAddKey,
  onUpdateKey,
  onRemoveKey,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  status,
}: {
  L: Required<LayoutBuilderLabels>
  keyEntries: KeyEntry[]
  stepEntries: PipelineStepRef[]
  keyCatalog: KeyCatalogEntry[]
  availableSteps: AvailableStep[]
  stepsByApp: [string, AvailableStep[]][]
  liveKeys: Record<string, unknown>
  onAddKey: (prefilledName?: string) => void
  onUpdateKey: (idx: number, patch: Partial<KeyEntry>) => void
  onRemoveKey: (idx: number) => void
  onAddStep: (stepId?: string) => void
  onUpdateStep: (idx: number, patch: Partial<PipelineStepRef>) => void
  onRemoveStep: (idx: number) => void
  status: "idle" | "pending" | "refreshing"
}) {
  const stepLookup = useMemo(() => {
    const map = new Map<string, AvailableStep>()
    for (const s of availableSteps) map.set(s.id, s)
    return map
  }, [availableSteps])

  return (
    <section className="bg-muted/30 -mx-1 rounded-lg border px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
          {L.pipelineHeader}
        </span>
        <span className="text-muted-foreground/60 text-[10px]">· auto-applies on edit</span>
        <div className="ml-auto text-[11px]">
          <StatusChip status={status} L={L} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold">
            <ArrowRightToLine className="size-3" />
            {L.keysHeader}
            <Badge variant="outline" className="px-1.5 text-[10px]">
              {keyEntries.length}
            </Badge>
          </div>
          {keyEntries.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-xs italic">
              {L.emptyKeys}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {keyEntries.map((entry, idx) => {
                const livePreview = formatLiveKeyValue(liveKeys[entry.name])
                const usedNames = new Set(
                  keyEntries.map((e, i) => (i === idx ? "" : e.name)).filter(Boolean),
                )
                const pickable = keyCatalog.filter(
                  (c) => c.key === entry.name || !usedNames.has(c.key),
                )
                return (
                  <li key={idx} className="grid grid-cols-2 items-center gap-1">
                    <Select
                      value={entry.name || undefined}
                      onValueChange={(value) => onUpdateKey(idx, { name: value })}
                    >
                      <SelectTrigger className="h-7 min-w-0 font-mono text-xs">
                        <SelectValue placeholder={L.keyName} />
                      </SelectTrigger>
                      <SelectContent>
                        {pickable.length === 0 ? (
                          <div className="text-muted-foreground px-2 py-1.5 text-xs italic">
                            No more keys available.
                          </div>
                        ) : (
                          pickable.map((c) => (
                            <SelectItem key={c.key} value={c.key} className="py-1.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-xs">{c.key}</span>
                                {c.consumedByWidgets.length + c.consumedBySteps.length > 0 && (
                                  <span className="text-muted-foreground/80 font-mono text-[10px]">
                                    → {[...c.consumedByWidgets, ...c.consumedBySteps].join(", ")}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="flex min-w-0 items-center gap-1">
                      <div className="relative min-w-0 flex-1">
                        <Input
                          value={entry.rawValue}
                          onChange={(e) => onUpdateKey(idx, { rawValue: e.target.value })}
                          placeholder={livePreview ?? L.keyValue}
                          className="h-7 pr-10 font-mono text-xs"
                        />
                        <span
                          className="text-muted-foreground/70 pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[10px] tabular-nums"
                          title="parsed type"
                        >
                          {valueTypeLabel(entry.rawValue)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRemoveKey(idx)}
                        aria-label="Remove key"
                      >
                        <X />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onAddKey()}
            className="text-muted-foreground hover:text-foreground self-start"
          >
            <Plus /> {L.addKey}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold">
            <ArrowDownToLine className="size-3" />
            {L.stepsHeader}
            <Badge variant="outline" className="px-1.5 text-[10px]">
              {stepEntries.length}
            </Badge>
          </div>
          {stepEntries.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-xs italic">
              {L.emptySteps}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {stepEntries.map((step, idx) => {
                const meta = stepLookup.get(step.step)
                return (
                  <li key={idx} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <Input
                        value={step.id}
                        onChange={(e) => onUpdateStep(idx, { id: e.target.value })}
                        placeholder={L.stepContextId}
                        className="h-7 w-24 font-mono text-xs"
                      />
                      <Select
                        value={step.step || undefined}
                        onValueChange={(value) => onUpdateStep(idx, { step: value })}
                      >
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder={L.stepPickerLabel} />
                        </SelectTrigger>
                        <SelectContent>
                          {stepsByApp.map(([app, items]) => (
                            <div key={app}>
                              <div className="text-muted-foreground px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
                                {app}
                              </div>
                              {items.map((s) => (
                                <SelectItem key={s.id} value={s.id} className="py-2">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-mono text-xs">{s.id}</span>
                                    <div className="text-muted-foreground flex flex-wrap gap-x-2 text-[10px]">
                                      <span className="font-mono">
                                        ←{" "}
                                        {s.requires.length ? s.requires.join(", ") : "(no inputs)"}
                                      </span>
                                      <span className="font-mono">
                                        → {s.produces.length ? s.produces.join(", ") : "(none)"}
                                      </span>
                                    </div>
                                  </div>
                                </SelectItem>
                              ))}
                            </div>
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
                    {meta && (
                      <div className="text-muted-foreground/80 ml-1 flex flex-wrap gap-x-2 pl-24 text-[10px]">
                        <span className="font-mono">
                          ← {meta.requires.length ? meta.requires.join(", ") : "(no inputs)"}
                        </span>
                        <span className="font-mono">
                          → {meta.produces.length ? meta.produces.join(", ") : "(none)"}
                        </span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onAddStep()}
            disabled={availableSteps.length === 0}
            className="text-muted-foreground hover:text-foreground self-start"
          >
            <Plus /> {L.addStep}
          </Button>
        </div>
      </div>
    </section>
  )
}

// -------------------------------------------------------------------------- //
// Workspace — palette + canvas (palette sticky on lg+)
// -------------------------------------------------------------------------- //

function Workspace({
  L,
  paletteByApp,
  paletteCount,
  activeRows,
  focusedRowIndex,
  setFocusedRowIndex,
  dragOverRow,
  setDragOverRow,
  onAddRow,
  onRemoveRow,
  onMoveRow,
  onSetCellSpan,
  onRemoveCell,
  onAddWidget,
  widgets,
  widgetProps,
  showAddTabButton,
  onAddTab,
}: {
  L: Required<LayoutBuilderLabels>
  paletteByApp: [string, ReachableWidget[]][]
  paletteCount: number
  activeRows: RowDef[]
  focusedRowIndex: number
  setFocusedRowIndex: (idx: number) => void
  dragOverRow: number | null
  setDragOverRow: (idx: number | null) => void
  onAddRow: () => void
  onRemoveRow: (rowIdx: number) => void
  onMoveRow: (rowIdx: number, direction: -1 | 1) => void
  onSetCellSpan: (rowIdx: number, cellIdx: number, span: number) => void
  onRemoveCell: (rowIdx: number, cellIdx: number) => void
  onAddWidget: (widgetId: string, targetRowIdx?: number) => void
  widgets: Record<string, WidgetComponent>
  widgetProps: WidgetProps
  showAddTabButton?: boolean
  onAddTab?: () => void
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 lg:col-span-3 xl:col-span-2">
        <div className="lg:sticky lg:top-16">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
            {L.paletteHeader}
            <Badge variant="outline" className="px-1.5 text-[10px]">
              {paletteCount}
            </Badge>
          </div>
          {paletteCount === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
              {L.paletteEmpty}
            </div>
          ) : (
            <ScrollArea className="lg:max-h-[70vh]">
              <div className="flex flex-col gap-3 pr-1">
                {paletteByApp.map(([app, ws]) => (
                  <div key={app} className="flex flex-col gap-1">
                    <div className="text-muted-foreground/80 text-[10px] font-semibold tracking-wide uppercase">
                      {app}
                    </div>
                    {ws.map((w) => (
                      <PaletteItem key={w.id} w={w} onClick={() => onAddWidget(w.id)} />
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {showAddTabButton && onAddTab && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onAddTab}
              className="text-muted-foreground hover:text-foreground mt-3"
            >
              <Plus /> {L.addTab}
            </Button>
          )}
        </div>
      </aside>

      <section className="col-span-12 lg:col-span-9 xl:col-span-10">
        <div className="flex flex-col gap-3">
          {activeRows.map((row, rowIdx) => (
            <CanvasRow
              key={rowIdx}
              L={L}
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
          <Button variant="outline" size="sm" onClick={onAddRow} className="self-start text-xs">
            <Plus /> {L.addRow}
          </Button>
        </div>
      </section>
    </div>
  )
}

function PaletteItem({ w, onClick }: { w: ReachableWidget; onClick: () => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(WIDGET_DRAG_MIME, w.id)
        e.dataTransfer.effectAllowed = "copy"
      }}
      onClick={onClick}
      className="hover:bg-accent hover:text-accent-foreground group bg-background/50 flex cursor-grab flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors active:cursor-grabbing"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate font-mono">{w.id}</span>
        <GripVertical className="text-muted-foreground/40 group-hover:text-muted-foreground size-3" />
      </span>
      {w.requires.length > 0 && (
        <span className="text-muted-foreground/80 truncate font-mono text-[10px]">
          ← {w.requires.join(", ")}
        </span>
      )}
    </button>
  )
}

// -------------------------------------------------------------------------- //
// Canvas row — drop target + per-cell controls + resize handle
// -------------------------------------------------------------------------- //

function CanvasRow({
  L,
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
  L: Required<LayoutBuilderLabels>
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
    <div
      onClick={() => setFocusedRowIndex(rowIdx)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(WIDGET_DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        setDragOverRow(rowIdx)
      }}
      onDragLeave={(e) => {
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
      className={cn(
        "group relative rounded-lg border-l-2 px-3 py-2 transition-colors",
        focused
          ? "border-l-primary bg-card"
          : "bg-background hover:bg-card/60 border-l-transparent",
        dragOver && "bg-primary/5 border-l-primary",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
          <span className="font-mono">row {rowIdx + 1}</span>
          <span className="bg-muted/60 rounded px-1 py-0.5 text-[10px]">
            {row.row.length} {row.row.length === 1 ? "widget" : "widgets"}
          </span>
        </div>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
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
            aria-label={L.removeRow}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {row.row.length === 0 ? (
        <div
          className={cn(
            "rounded-md border border-dashed py-6 text-center text-[11px] transition-colors",
            dragOver
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          {dragOver ? L.canvasDropHint : L.canvasEmpty}
        </div>
      ) : (
        <div ref={gridRef} data-row-grid>
          <GridLayout>
            {row.row.map((cell, cellIdx) => {
              const span = cell.span ?? 12
              const Widget = widgets[cell.widget]
              return (
                <GridItem key={`${cell.widget}-${cellIdx}`} span={span}>
                  <div className="border-border bg-card relative overflow-hidden rounded-md border shadow-sm">
                    <div className="text-muted-foreground bg-muted/30 flex items-center justify-between gap-2 border-b px-2 py-1 text-[10px]">
                      <span className="truncate font-mono">{cell.widget}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-muted-foreground/80 font-mono">{span}/12</span>
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
                        <div className="text-muted-foreground rounded border border-dashed p-3 text-center text-[11px]">
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
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Resize handle
// -------------------------------------------------------------------------- //

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
      className="hover:bg-primary/40 absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none"
      aria-label="Resize widget"
      role="separator"
    />
  )
}

// -------------------------------------------------------------------------- //
// Catalogue Sheet — slides in from the right
// -------------------------------------------------------------------------- //

function CatalogueSheet({
  L,
  open,
  onOpenChange,
  keyCatalog,
  availableSteps,
  unreachableWidgets,
  onSeedKey,
  onAddProducingStep,
}: {
  L: Required<LayoutBuilderLabels>
  open: boolean
  onOpenChange: (open: boolean) => void
  keyCatalog: KeyCatalogEntry[]
  availableSteps: AvailableStep[]
  unreachableWidgets: UnreachableWidget[]
  onSeedKey: (name: string) => void
  onAddProducingStep: (key: string) => void
}) {
  const producerOf = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const e of keyCatalog) map.set(e.key, e.producedBySteps[0])
    return map
  }, [keyCatalog])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Library className="size-4" />
            {L.catalogue}
          </SheetTitle>
          <SheetDescription>{L.catalogueDescription}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <CatalogueSectionHeader title={L.catalogueKeys} count={keyCatalog.length} />
              {keyCatalog.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">No keys registered.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {keyCatalog.map((entry) => (
                    <li
                      key={entry.key}
                      className="hover:bg-accent/40 flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate font-mono">{entry.key}</span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 text-[10px]",
                            entry.inContext
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              entry.inContext ? "bg-emerald-500" : "bg-muted-foreground/40",
                            )}
                          />
                          {entry.inContext ? L.catalogueLive : L.catalogueMissing}
                        </span>
                      </div>
                      {(entry.producedBySteps.length > 0 ||
                        entry.consumedBySteps.length > 0 ||
                        entry.consumedByWidgets.length > 0) && (
                        <div className="text-muted-foreground/80 flex flex-col gap-0.5 text-[10px]">
                          {entry.producedBySteps.length > 0 && (
                            <span>
                              {L.catalogueProducedBy}{" "}
                              <span className="font-mono">{entry.producedBySteps.join(", ")}</span>
                            </span>
                          )}
                          {entry.consumedBySteps.length > 0 && (
                            <span>
                              step {L.catalogueConsumedBy}{" "}
                              <span className="font-mono">{entry.consumedBySteps.join(", ")}</span>
                            </span>
                          )}
                          {entry.consumedByWidgets.length > 0 && (
                            <span>
                              widget {L.catalogueConsumedBy}{" "}
                              <span className="font-mono">
                                {entry.consumedByWidgets.join(", ")}
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                      {!entry.inContext && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <Button variant="ghost" size="xs" onClick={() => onSeedKey(entry.key)}>
                            <Plus /> {L.cataloguePickKey}
                          </Button>
                          {producerOf.get(entry.key) && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onAddProducingStep(entry.key)}
                            >
                              <ArrowDownToLine /> {L.catalogueAddProducingStep}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <CatalogueSectionHeader title={L.catalogueSteps} count={availableSteps.length} />
              {availableSteps.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">No steps registered.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {availableSteps.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <span className="truncate font-mono">{s.id}</span>
                      <div className="text-muted-foreground/80 flex flex-wrap gap-x-3 text-[10px]">
                        <span className="font-mono">
                          ← {s.requires.length ? s.requires.join(", ") : "(no inputs)"}
                        </span>
                        <span className="font-mono">
                          → {s.produces.length ? s.produces.join(", ") : "(none)"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <CatalogueSectionHeader
                title={L.catalogueUnreachable}
                count={unreachableWidgets.length}
              />
              {unreachableWidgets.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  {L.catalogueUnreachableEmpty}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {unreachableWidgets.map((w) => {
                    const candidate = w.missingKeys
                      .map((k) => ({ key: k, step: producerOf.get(k) }))
                      .find((c) => c.step)
                    return (
                      <li
                        key={w.id}
                        className="bg-muted/20 flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs"
                      >
                        <span className="truncate font-mono">{w.id}</span>
                        <span className="text-muted-foreground/80 text-[10px]">
                          {L.catalogueNeedsKeys}{" "}
                          <span className="font-mono">{w.missingKeys.join(", ")}</span>
                        </span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {w.missingKeys.map((k) => (
                            <Button key={k} variant="ghost" size="xs" onClick={() => onSeedKey(k)}>
                              <Plus />
                              <span className="font-mono">{k}</span>
                            </Button>
                          ))}
                          {candidate && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => onAddProducingStep(candidate.key)}
                            >
                              <ArrowDownToLine /> {L.catalogueAddProducingStep}
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function CatalogueSectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
        {title}
      </span>
      <span className="bg-border h-px flex-1" aria-hidden="true" />
      <Badge variant="outline" className="px-1.5 text-[10px]">
        {count}
      </Badge>
    </div>
  )
}

// -------------------------------------------------------------------------- //
// Save dialog
// -------------------------------------------------------------------------- //

function SaveDialog({
  L,
  open,
  onOpenChange,
  name,
  setName,
  description,
  setDescription,
  onSubmit,
  busy,
}: {
  L: Required<LayoutBuilderLabels>
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  onSubmit: () => Promise<void>
  busy: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{L.saveDialogTitle}</DialogTitle>
          <DialogDescription>{L.saveDialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{L.saveNameLabel}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Invoice overview"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{L.saveDescriptionLabel}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{L.cancel}</Button>
          </DialogClose>
          <Button
            disabled={!name.trim() || busy}
            onClick={() => {
              void onSubmit()
            }}
          >
            {L.saveConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -------------------------------------------------------------------------- //
// Preview pane
// -------------------------------------------------------------------------- //

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
  return renderRows(draft.rows)
}
