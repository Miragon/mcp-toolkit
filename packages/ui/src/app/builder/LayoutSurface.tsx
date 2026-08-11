import { Plus, X } from "lucide-react"
import { Button } from "../../primitives/button.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../primitives/tabs.js"
import { cn } from "../../lib/utils.js"
import type { DraftLayout } from "./builder-model.js"
import type { LayoutBuilderLabels } from "./labels.js"
import { Workspace, type WorkspaceProps } from "./Workspace.js"

// -------------------------------------------------------------------------- //
// Layout surface — single workspace, or the tab strip (with inline rename)
// wrapping one workspace per tab
// -------------------------------------------------------------------------- //

/**
 * The "Layout" view's canvas surface, extracted from `layout-builder.tsx`.
 *
 * Renders either a single `Workspace` (rows draft) or the tab strip with
 * the inline-rename editor plus one `Workspace` per tab (tabs draft). All
 * state stays in the LayoutBuilder container — rename feedback included —
 * so unmounting this surface (e.g. switching to the Pipeline view) loses
 * nothing. Props in, callbacks out; the shared `workspace` bag is spread
 * into `<Workspace>` untouched so its memo semantics are unchanged.
 */
export function LayoutSurface({
  L,
  draft,
  activeTabIndex,
  setActiveTabIndex,
  editingTabIdx,
  setEditingTabIdx,
  renameRejected,
  commitRename,
  onAddTab,
  onRemoveTab,
  workspace,
}: {
  L: Required<LayoutBuilderLabels>
  draft: DraftLayout
  activeTabIndex: number
  setActiveTabIndex: (idx: number) => void
  editingTabIdx: number | null
  setEditingTabIdx: (idx: number | null) => void
  renameRejected: boolean
  commitRename: (tabIdx: number, label: string) => void
  onAddTab: () => void
  onRemoveTab: (tabIdx: number) => void
  workspace: Omit<WorkspaceProps, "showAddTabButton" | "onAddTab">
}) {
  if (draft.kind !== "tabs") {
    return <Workspace {...workspace} showAddTabButton onAddTab={onAddTab} />
  }
  return (
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
                  onRemoveTab(idx)
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
          onClick={onAddTab}
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
          {idx === activeTabIndex ? <Workspace {...workspace} /> : null}
        </TabsContent>
      ))}
    </Tabs>
  )
}
