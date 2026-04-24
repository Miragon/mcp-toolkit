import { useCallback, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Minus, Plus, Rows3, Save, Sparkles, Trash2, X } from "lucide-react"
import type {
  LayoutConfig,
  PipelineContext,
  PipelineStepRef,
  ReachableWidget,
  RowDef,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs.js"
import type { WidgetComponent } from "./widget-renderer.js"

export interface LayoutBuilderLabels {
  title?: string
  palette?: string
  paletteEmpty?: string
  canvasEmpty?: string
  addRow?: string
  addTab?: string
  removeRow?: string
  renameTab?: string
  removeTab?: string
  render?: string
  save?: string
  saveDialogTitle?: string
  saveDialogDescription?: string
  saveNameLabel?: string
  saveDescriptionLabel?: string
  saveConfirm?: string
  cancel?: string
}

const DEFAULT_LABELS: Required<LayoutBuilderLabels> = {
  title: "View Builder",
  palette: "Available widgets",
  paletteEmpty: "No widgets match the current key set. Add steps or seed keys to unlock more.",
  canvasEmpty: "Pick a widget from the palette to add it to the canvas.",
  addRow: "Add row",
  addTab: "Add tab",
  removeRow: "Remove row",
  renameTab: "Rename tab",
  removeTab: "Remove tab",
  render: "Render view",
  save: "Save dashboard",
  saveDialogTitle: "Save dashboard",
  saveDialogDescription:
    "Persists the current layout along with the keys and steps that populate it.",
  saveNameLabel: "Name",
  saveDescriptionLabel: "Description",
  saveConfirm: "Save",
  cancel: "Cancel",
}

type DraftLayout = { kind: "rows"; rows: RowDef[] } | { kind: "tabs"; tabs: DraftTab[] }
interface DraftTab {
  label: string
  rows: RowDef[]
}

export interface LayoutBuilderProps {
  /** Optional draft layout to resume editing. */
  initialLayout?: LayoutConfig
  title?: string
  /** Initial keys that seeded the builder (passed back on save/render). */
  initialKeys?: Record<string, unknown>
  /** Steps that were declared on the open-view-builder call (passed back on save/render). */
  initialSteps?: PipelineStepRef[]
  /** Live pipeline context — used for WYSIWYG preview of the draft layout. */
  context: PipelineContext
  /** Widgets whose `requires` are satisfied by the current key set. */
  reachableWidgets: ReachableWidget[]
  /** Merged widget-component map (host-bundled + remote-loaded). */
  widgets: Record<string, WidgetComponent>
  /** Bridge to the MCP host for save / render round-trips. */
  callTool: (name: string, args: object) => Promise<unknown>
  /** Override the default refresh tool name. Mirrors `McpAppView`. */
  refreshToolName?: string
  /** Override the default render tool name. Mirrors `McpAppView`. */
  renderToolName?: string
  /** Override the default save tool name. Mirrors the registered `save-dashboard`. */
  saveToolName?: string
  /** Optional existing dashboard id when resuming a saved layout. */
  dashboardId?: string
  labels?: LayoutBuilderLabels
  /**
   * Called with the resulting `structuredContent` after the render tool
   * fires successfully. Hosts typically pipe this into the top-level
   * `setViewData` so the Builder swaps into the rendered view.
   */
  onRendered?: (viewData: unknown) => void
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

export function LayoutBuilder({
  initialLayout,
  title,
  initialKeys,
  initialSteps,
  context,
  reachableWidgets,
  widgets,
  callTool,
  renderToolName = "render-view",
  saveToolName = "save-dashboard",
  dashboardId,
  labels,
  onRendered,
  onSaved,
}: LayoutBuilderProps) {
  const L = { ...DEFAULT_LABELS, ...labels }
  const [draft, setDraft] = useState<DraftLayout>(() => initDraft(initialLayout))
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [focusedRowIndex, setFocusedRowIndex] = useState(0)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(title ?? "")
  const [saveDescription, setSaveDescription] = useState("")
  const [isBusy, setBusy] = useState(false)

  const widgetById = useMemo(() => {
    const map = new Map<string, ReachableWidget>()
    for (const w of reachableWidgets) map.set(w.id, w)
    return map
  }, [reachableWidgets])

  const paletteByApp = useMemo(() => {
    const groups = new Map<string, ReachableWidget[]>()
    for (const w of reachableWidgets) {
      if (!groups.has(w.app)) groups.set(w.app, [])
      groups.get(w.app)!.push(w)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [reachableWidgets])

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

  const addWidgetToFocusedRow = useCallback(
    (widgetId: string) => {
      const widget = widgetById.get(widgetId)
      if (!widget) return
      const defaultSpan = sizeToSpan(widget.size)
      mutateActiveRows((rows) => {
        const safeRows = rows.length > 0 ? rows : emptyRows()
        const idx = Math.min(Math.max(focusedRowIndex, 0), safeRows.length - 1)
        const next = safeRows.map((r, i) =>
          i === idx ? { row: [...r.row, { widget: widgetId, span: defaultSpan }] } : r,
        )
        return next
      })
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

  const renderDraftLayout = useCallback(async () => {
    setBusy(true)
    try {
      const layout = draftToLayout(draft)
      const result = (await callTool(renderToolName, {
        keys: initialKeys,
        steps: initialSteps,
        layout,
        title,
      })) as { structuredContent?: unknown }
      if (result.structuredContent && onRendered) onRendered(result.structuredContent)
    } finally {
      setBusy(false)
    }
  }, [callTool, draft, initialKeys, initialSteps, onRendered, renderToolName, title])

  const saveDraft = useCallback(async () => {
    if (!saveName.trim()) return
    setBusy(true)
    try {
      const layout = draftToLayout(draft)
      const result = (await callTool(saveToolName, {
        id: dashboardId,
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        keys: initialKeys,
        steps: initialSteps,
        layout,
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
    initialKeys,
    initialSteps,
    onSaved,
    saveDescription,
    saveName,
    saveToolName,
    title,
  ])

  const widgetProps: WidgetProps = { keys: context.keys, context }

  const hasAnyCell = activeRows.some((r) => r.row.length > 0)

  const canvas = (
    <div className="flex flex-col gap-3">
      {activeRows.map((row, rowIdx) => (
        <Card
          key={rowIdx}
          onClick={() => setFocusedRowIndex(rowIdx)}
          data-focused={rowIdx === focusedRowIndex}
          className={
            "gap-0 p-3 transition-colors " +
            (rowIdx === focusedRowIndex ? "ring-ring ring-2 ring-offset-1" : "")
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
                  moveRow(rowIdx, -1)
                }}
                disabled={rowIdx === 0}
                aria-label="Move row up"
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  moveRow(rowIdx, 1)
                }}
                disabled={rowIdx === activeRows.length - 1}
                aria-label="Move row down"
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  removeRow(rowIdx)
                }}
                aria-label={L.removeRow}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          {row.row.length === 0 ? (
            <div className="border-muted-foreground/30 text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
              Empty row — click a widget in the palette to add it here.
            </div>
          ) : (
            <GridLayout>
              {row.row.map((cell, cellIdx) => {
                const span = cell.span ?? 12
                const Widget = widgets[cell.widget]
                return (
                  <GridItem key={`${cell.widget}-${cellIdx}`} span={span}>
                    <div className="border-border bg-card overflow-hidden rounded-md border">
                      <div className="bg-muted/40 flex items-center justify-between gap-2 px-2 py-1 text-xs">
                        <span className="text-muted-foreground truncate font-mono">
                          {cell.widget}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCellSpan(rowIdx, cellIdx, span - 1)
                            }}
                            disabled={span <= 1}
                            aria-label="Decrease span"
                          >
                            <Minus />
                          </Button>
                          <span className="min-w-8 text-center font-mono">{span}/12</span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCellSpan(rowIdx, cellIdx, span + 1)
                            }}
                            disabled={span >= 12}
                            aria-label="Increase span"
                          >
                            <Plus />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeCell(rowIdx, cellIdx)
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
                    </div>
                  </GridItem>
                )
              })}
            </GridLayout>
          )}
        </Card>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus /> {L.addRow}
        </Button>
        <Button variant="outline" size="sm" onClick={addTab}>
          <Plus /> {L.addTab}
        </Button>
      </div>
    </div>
  )

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
            onClick={() => {
              void renderDraftLayout()
            }}
            disabled={isBusy || !hasAnyCell}
          >
            {L.render}
          </Button>
          <Button size="sm" onClick={() => setSaveOpen(true)} disabled={isBusy || !hasAnyCell}>
            <Save /> {L.save}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-12 md:col-span-4 lg:col-span-3">
          <Card className="gap-0 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium">
              <span>{L.palette}</span>
              <Badge variant="outline">{reachableWidgets.length}</Badge>
            </div>
            <Separator className="mb-2" />
            {reachableWidgets.length === 0 ? (
              <div className="text-muted-foreground text-xs">{L.paletteEmpty}</div>
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
                          onClick={() => addWidgetToFocusedRow(w.id)}
                          className="hover:bg-accent hover:text-accent-foreground group flex flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors"
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="truncate font-mono">{w.id}</span>
                            <Plus className="text-muted-foreground group-hover:text-foreground size-3" />
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
                  {idx === activeTabIndex ? canvas : null}
                </TabsContent>
              ))}
            </Tabs>
          ) : hasAnyCell ? (
            canvas
          ) : (
            <div className="border-muted-foreground/30 text-muted-foreground flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-sm">
              <Rows3 className="size-5" />
              {L.canvasEmpty}
              {canvas}
            </div>
          )}
        </section>
      </div>

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
