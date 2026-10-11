import { useId, useRef, useState } from "react"
import { Pencil, Plus, X } from "lucide-react"
import { Button } from "../../primitives/button.js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../primitives/tabs.js"
import { FOCUS_RING } from "../../lib/focus-ring.js"
import { cn } from "../../lib/utils.js"
import {
  createTabRefocus,
  renameFieldKeyAction,
  tabTriggerKeyAction,
  type DraftLayout,
} from "./builder-model.js"
import type { LayoutBuilderLabels } from "./labels.js"
import { REVEAL_ON_INTENT } from "./reveal.js"
import { Workspace, type WorkspaceProps } from "./Workspace.js"

// -------------------------------------------------------------------------- //
// Layout surface — single workspace, or the tab strip (with inline rename)
// wrapping one workspace per tab
// -------------------------------------------------------------------------- //

/**
 * The "Layout" view's canvas surface, extracted from `layout-builder.tsx`.
 *
 * Renders either a single `Workspace` (rows draft, with an "Add tab" next to
 * "Add row") or the tab strip plus one `Workspace` per tab (tabs draft). A tab
 * is renamed with F2, Enter on the active tab, a double-click or its pencil
 * button; Enter commits, Escape cancels, and either returns focus to the tab,
 * also when the new name remounts it (see `TabRefocus`, held here by index).
 * All state stays in the LayoutBuilder container — rename feedback included —
 * so unmounting this surface (e.g. switching to the data sources) loses nothing.
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
  /** Commits a rename; `false` when it was rejected and the field stays open. */
  commitRename: (tabIdx: number, label: string) => boolean
  onAddTab: () => void
  onRemoveTab: (tabIdx: number) => void
  workspace: Omit<WorkspaceProps, "onAddTab">
}) {
  const errorId = useId()
  // One per surface, outside the tabs: a tab is keyed by its label, so a
  // rename remounts it, and a focus request held by the tab would go with it.
  const [refocus] = useState(createTabRefocus)
  if (draft.kind !== "tabs") {
    return <Workspace {...workspace} onAddTab={onAddTab} />
  }
  return (
    <Tabs
      value={draft.tabs[activeTabIndex]?.label ?? ""}
      onValueChange={(label) => {
        const idx = draft.tabs.findIndex((t) => t.label === label)
        if (idx >= 0) setActiveTabIndex(idx)
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <TabsList
          aria-label={L.tabsLabel}
          className="flex-wrap group-data-[orientation=horizontal]/tabs:h-auto"
        >
          {draft.tabs.map((tab, idx) => (
            <TabItem
              key={tab.label}
              L={L}
              label={tab.label}
              active={idx === activeTabIndex}
              editing={editingTabIdx === idx}
              renameRejected={renameRejected}
              errorId={errorId}
              onStartRename={() => {
                setActiveTabIndex(idx)
                setEditingTabIdx(idx)
              }}
              onCommitRename={(label) => commitRename(idx, label)}
              onCancelRename={() => setEditingTabIdx(null)}
              onRemove={() => onRemoveTab(idx)}
              {...refocus.forTab(idx)}
            />
          ))}
        </TabsList>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onAddTab}
          aria-label={L.addTab}
          title={L.addTab}
        >
          <Plus aria-hidden="true" />
        </Button>
        <span className="text-muted-foreground text-small ml-2 hidden sm:inline">
          {L.renameHint}
        </span>
      </div>
      {renameRejected && editingTabIdx !== null && (
        <p id={errorId} className="text-danger-ink text-small -mt-1 mb-2" role="alert">
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

// -------------------------------------------------------------------------- //
// One tab: trigger (or the rename field) plus its rename and remove buttons
// -------------------------------------------------------------------------- //

/**
 * One tab. It holds no state of its own (it is keyed by its label, so a
 * rename remounts it): the focus hand-back after a keyboard rename goes
 * through `onRefocus` and `triggerRef` to the surface's `TabRefocus`.
 * Exported for its tests only.
 */
export function TabItem({
  L,
  label,
  active,
  editing,
  renameRejected,
  errorId,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRemove,
  triggerRef,
  onRefocus,
}: {
  L: Required<LayoutBuilderLabels>
  label: string
  active: boolean
  editing: boolean
  renameRejected: boolean
  errorId: string
  onStartRename: () => void
  onCommitRename: (label: string) => boolean
  onCancelRename: () => void
  onRemove: () => void
  /** The trigger's ref callback: it takes the focus back after a keyboard rename. */
  triggerRef: (el: HTMLButtonElement | null) => void
  /** Asks for the focus to come back to this tab's trigger when it mounts again. */
  onRefocus: () => void
}) {
  return (
    <div className="group inline-flex items-center" data-slot="builder-tab">
      {editing ? (
        <RenameField
          L={L}
          initial={label}
          invalid={renameRejected}
          errorId={errorId}
          onCommit={(value, byKeyboard) => {
            const accepted = onCommitRename(value)
            // A pointer commit leaves the focus where the pointer went.
            if (accepted && byKeyboard) onRefocus()
            return accepted
          }}
          onCancel={() => {
            onRefocus()
            onCancelRename()
          }}
        />
      ) : (
        <TabsTrigger
          ref={triggerRef}
          value={label}
          title={L.renameTitle}
          onDoubleClick={onStartRename}
          onKeyDown={(e) => {
            if (tabTriggerKeyAction(e.key, active) !== "rename") return
            e.preventDefault()
            onStartRename()
          }}
        >
          {label}
        </TabsTrigger>
      )}
      <div
        data-slot="builder-tab-actions"
        className={cn("flex items-center", active ? "opacity-100" : REVEAL_ON_INTENT)}
      >
        {!editing && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={L.renameTabNamed(label)}
            title={L.renameTab}
            onClick={onStartRename}
          >
            <Pencil aria-hidden="true" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={L.removeTabNamed(label)}
          title={L.removeTab}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

/**
 * The inline rename field, mounted for one rename. Enter commits (a rejected
 * name keeps it open with the error), Escape cancels; leaving it by pointer
 * commits too. A field that already ended by keyboard ignores the blur that
 * its own unmount may fire.
 */
function RenameField({
  L,
  initial,
  invalid,
  errorId,
  onCommit,
  onCancel,
}: {
  L: Required<LayoutBuilderLabels>
  initial: string
  invalid: boolean
  errorId: string
  onCommit: (value: string, byKeyboard: boolean) => boolean
  onCancel: () => void
}) {
  const ended = useRef(false)
  return (
    <input
      // The field replaces the tab the user just chose to rename: focus follows.
      autoFocus
      defaultValue={initial}
      aria-label={L.renameTab}
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
      onKeyDown={(e) => {
        const action = renameFieldKeyAction(e.key)
        if (action === null) return
        e.preventDefault()
        if (action === "cancel") {
          ended.current = true
          onCancel()
          return
        }
        if (onCommit(e.currentTarget.value, true)) ended.current = true
      }}
      onBlur={(e) => {
        if (!ended.current) onCommit(e.currentTarget.value, false)
      }}
      className={cn(
        "bg-background text-foreground h-7 w-28 rounded-sm border px-1.5 text-sm",
        FOCUS_RING,
        invalid && "border-danger",
      )}
      size={Math.max(initial.length + 1, 6)}
    />
  )
}
