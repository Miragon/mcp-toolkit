import { isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"
import { createTranslator, type ReachableWidget, type RowDef } from "@miragon/mcp-toolkit-core"
import { LocaleProvider } from "../../locale/locale-provider.js"
import { TOOLKIT_MESSAGES } from "../../locale/toolkit-messages.js"
import { attribute, decodeEntities, openingTags } from "../../render-scan.js"
import { DialogDescription } from "../../primitives/dialog.js"
import { Button } from "../../primitives/button.js"
import { TabsTrigger } from "../../primitives/tabs.js"
import { LayoutBuilder } from "../layout-builder.js"
import {
  BUILDER_FOCUS_TARGET,
  builderMountFocusTarget,
  buildModeFocusTarget,
  VIEW_FOCUS_TARGET,
} from "../use-build-mode-focus.js"
import { createTabRefocus, type DraftLayout } from "./builder-model.js"
import { DiscardDialog } from "./DiscardDialog.js"
import { SaveDialog } from "./SaveDialog.js"
import { LayoutSurface, TabItem } from "./LayoutSurface.js"
import { PipelineStrip } from "./PipelineStrip.js"
import { REVEAL_ON_INTENT } from "./reveal.js"
import { Toolbar, type ToolbarProps } from "./Toolbar.js"
import { PaletteEmpty, Workspace, type WorkspaceProps } from "./Workspace.js"

/**
 * The builder for people, not developers (U18, toolkit#13/#14), on its SSR
 * markup: widgets by title (the id only as a quiet hint, or as the fallback),
 * no hover-only control, a keyboard rename next to the double-click, the kit
 * focus ring on every control, Apply / Discard / Save as three named actions,
 * the technical parts behind "Advanced", and every builder string from the
 * catalog.
 */

declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>
  }
}

const de = TOOLKIT_MESSAGES.de.builder
const noop = (): void => {}
const translator = createTranslator({
  de: { "demo.keyed.title": "Aus dem Katalog", "demo.keyed.summary": "Titel per Schlüssel." },
})
/**
 * The SSR markup in German, raw: React escapes a `>` inside an attribute
 * (`has-[>svg]:px-2.5`), which keeps the tag scans of `render-scan` honest;
 * `attribute()` and `button()` decode what they return.
 */
const inGerman = (node: ReactElement) =>
  renderToStaticMarkup(
    <LocaleProvider locale="de" translator={translator}>
      {node}
    </LocaleProvider>,
  )

const PALETTE: ReachableWidget[] = [
  {
    id: "demo:orders",
    app: "demo",
    requires: ["demo:customer"],
    size: "full",
    title: { en: "Orders", de: "Bestellungen" },
    summary: { en: "Every open order.", de: "Alle offenen Bestellungen." },
  },
  { id: "demo:keyed", app: "demo", requires: [], size: "half", titleKey: "demo.keyed.title" },
  { id: "demo:raw", app: "demo", requires: [], size: "half" },
]

function workspace(over: Partial<WorkspaceProps> = {}): WorkspaceProps {
  return {
    L: de,
    paletteByApp: [["demo", PALETTE]],
    appDisplayByName: new Map(),
    paletteCount: PALETTE.length,
    paletteLoading: false,
    onOpenDataSources: noop,
    activeRows: [{ row: [{ widget: "demo:orders" }, { widget: "demo:raw" }] }, { row: [] }],
    focusedRowIndex: 0,
    setFocusedRowIndex: noop,
    dragOverRow: null,
    setDragOverRow: noop,
    onAddRow: noop,
    onRemoveRow: noop,
    onMoveRow: noop,
    onSetCellSpan: noop,
    onRemoveCell: noop,
    onAddWidget: noop,
    onConfigureCell: noop,
    propsSchemaByWidgetId: new Map([["demo:orders", { type: "object" }]]),
    displayByWidgetId: new Map(PALETTE.map((w) => [w.id, w])),
    advanced: false,
    widgets: {},
    widgetProps: { keys: {}, context: { keys: {}, steps: {}, errors: [] } },
    ...over,
  }
}

const TABS: DraftLayout = {
  kind: "tabs",
  tabs: [
    { label: "Übersicht", rows: [{ row: [] }] },
    { label: "Details", rows: [{ row: [] }] },
  ],
}

function surface(draft: DraftLayout, editingTabIdx: number | null = null) {
  return (
    <LayoutSurface
      L={de}
      draft={draft}
      activeTabIndex={0}
      setActiveTabIndex={noop}
      editingTabIdx={editingTabIdx}
      setEditingTabIdx={noop}
      renameRejected={false}
      commitRename={() => true}
      onAddTab={noop}
      onRemoveTab={noop}
      workspace={workspace()}
    />
  )
}

function toolbar(over: Partial<ToolbarProps> = {}) {
  return (
    <Toolbar
      L={de}
      previewMode={false}
      isBusy={false}
      status="idle"
      liveKeys={1}
      reachableCount={3}
      unreachableCount={2}
      advanced={false}
      onToggleAdvanced={noop}
      unsaved={false}
      onOpenCatalogue={noop}
      onOpenSave={noop}
      onDiscard={noop}
      onApply={noop}
      hasAnyCell
      {...over}
    />
  )
}

/** The opening tag of the element carrying `data-slot="<slot>"`, in document order. */
function slots(html: string, slot: string): string[] {
  return html.match(new RegExp(`<[a-z]+[^>]*data-slot="${slot}"[^>]*>`, "g")) ?? []
}

/**
 * The button a user knows as `name`: its visible text or its `aria-label`,
 * exactly (a tooltip that merely mentions the word does not count).
 */
function button(html: string, name: string): string | undefined {
  return (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find((b) => {
    const text = decodeEntities(b.replace(/<[^>]*>/g, "")).trim()
    return text === name || attribute(openingTags(b, "button")[0] ?? "", "aria-label") === name
  })
}

/** The opening tag of {@link button}, for its attributes. */
function buttonTag(html: string, name: string): string {
  return openingTags(button(html, name) ?? "", "button")[0] ?? ""
}

/** The slot a `[data-slot="…"]` focus target selects. */
function slotOf(selector: string): string {
  const slot = /^\[data-slot="([^"]+)"\]$/.exec(selector)?.[1]
  if (!slot) throw new Error(`not a data-slot selector: ${selector}`)
  return slot
}

/**
 * Every element of a component's output, children first-class, WITHOUT
 * rendering any component in it: the event wiring of a hook-free component
 * (its handlers are props) is testable without a DOM.
 */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  const out: ReactElement<Record<string, unknown>>[] = []
  const visit = (n: ReactNode) => {
    if (Array.isArray(n)) {
      for (const child of n as ReactNode[]) visit(child)
      return
    }
    if (!isValidElement<Record<string, unknown>>(n)) return
    out.push(n)
    visit(n.props.children as ReactNode)
  }
  visit(node)
  return out
}

describe("titles: the palette and the canvas speak user words", () => {
  const html = inGerman(<Workspace {...workspace()} />)
  const items = html.match(/<button[^>]*data-slot="builder-palette-item"[\s\S]*?<\/button>/g) ?? []

  it("names a titled widget by its title in the locale, with its summary and a quiet mono id", () => {
    const orders = items.find((i) => i.includes("demo:orders")) ?? ""
    expect(orders).toMatch(/font-medium">Bestellungen</)
    expect(orders).toContain("Alle offenen Bestellungen.")
    // A quiet mono id at the 13 px floor of the type scale, never 12 px.
    const id = /<span class="([^"]*)">demo:orders</.exec(orders)?.[1]?.split(" ") ?? []
    expect(id).toContain("font-mono")
    expect(id).toContain("text-small")
  })

  it("resolves a titleKey through the LocaleProvider's translator", () => {
    const keyed = items.find((i) => i.includes("demo:keyed")) ?? ""
    expect(keyed).toMatch(/font-medium">Aus dem Katalog</)
  })

  it("falls back to the id as the title when there is none, and never shows it twice", () => {
    const raw = items.find((i) => i.includes("demo:raw")) ?? ""
    expect(raw).toMatch(/font-medium">demo:raw</)
    expect(raw.split("demo:raw")).toHaveLength(2)
  })

  it("keeps the required keys (data-source vocabulary) out of the basic palette", () => {
    expect(html).not.toContain("demo:customer")
    expect(html).not.toContain(`${de.catalogueNeedsKeys} `)
    const advanced = inGerman(<Workspace {...workspace({ advanced: true })} />)
    expect(advanced).toContain(`${de.catalogueNeedsKeys} <span class="font-mono">demo:customer`)
  })

  it("titles the canvas cells; the id joins them only in advanced mode", () => {
    expect(html).toMatch(/truncate font-medium">Bestellungen</)
    expect(html).toMatch(/truncate font-medium">demo:raw</)
    expect(html).not.toMatch(/truncate font-mono">demo:orders</)
    const advanced = inGerman(<Workspace {...workspace({ advanced: true })} />)
    expect(advanced).toMatch(/truncate font-mono">demo:orders</)
  })

  it("marks the row new elements go to in words, not by colour alone", () => {
    const rows = slots(html, "builder-row")
    expect(rows).toHaveLength(2)
    expect(attribute(rows[0] ?? "", "data-target")).toBe("")
    expect(attribute(rows[1] ?? "", "data-target")).toBeUndefined()
    expect(html.split(de.rowTarget)).toHaveLength(2)
  })

  it("offers Add tab next to Add row, outside the palette (no overlap)", () => {
    const withTab = inGerman(<Workspace {...workspace({ onAddTab: noop })} />)
    const aside = /<aside[\s\S]*?<\/aside>/.exec(withTab)?.[0] ?? ""
    expect(aside).not.toContain(de.addTab)
    const canvas = /<section[\s\S]*<\/section>/.exec(withTab)?.[0] ?? ""
    expect(canvas).toContain(`${de.addRow}</button>`)
    expect(canvas).toContain(`${de.addTab}</button>`)
    // The palette scrolls in its own box instead of overflowing a fixed one.
    expect(aside).toMatch(/lg:overflow-y-auto/)
  })
})

describe("palette groups: headed by the app's title, the namespace only in advanced mode", () => {
  const titled = (over: Partial<WorkspaceProps> = {}) =>
    inGerman(
      <Workspace
        {...workspace({
          appDisplayByName: new Map([["demo", { title: { en: "Demo shop", de: "Vorführladen" } }]]),
          ...over,
        })}
      />,
    )
  const headings = (html: string) =>
    (html.match(/<div[^>]*data-slot="builder-palette-group"[^>]*>[\s\S]*?<\/div>/g) ?? []).map(
      (h) =>
        decodeEntities(h.replace(/<[^>]*>/g, " "))
          .replace(/\s+/g, " ")
          .trim(),
    )

  it("shows no heading for an untitled app (its name is a technical namespace)", () => {
    expect(headings(inGerman(<Workspace {...workspace()} />))).toEqual([])
  })

  it("heads an untitled app's group with its name in advanced mode", () => {
    expect(headings(inGerman(<Workspace {...workspace({ advanced: true })} />))).toEqual(["demo"])
  })

  it("heads a titled app's group with its title in the locale, the name joining only in advanced mode", () => {
    expect(headings(titled())).toEqual(["Vorführladen"])
    const advanced = titled({ advanced: true })
    expect(headings(advanced)).toEqual(["Vorführladen demo"])
    expect(advanced).toMatch(/font-mono font-normal">demo</)
  })

  it("resolves an app's titleKey through the LocaleProvider's translator", () => {
    const keyed = inGerman(
      <Workspace
        {...workspace({ appDisplayByName: new Map([["demo", { titleKey: "demo.keyed.title" }]]) })}
      />,
    )
    expect(headings(keyed)).toEqual(["Aus dem Katalog"])
  })
})

describe("no hover-only controls (CI §12)", () => {
  const html = inGerman(<Workspace {...workspace()} />)

  it("reveals row actions on hover, focus inside the row and on touch; the target row shows them", () => {
    const actions = slots(html, "builder-row-actions")
    expect(actions).toHaveLength(2)
    expect(attribute(actions[0] ?? "", "class")).toContain("opacity-100")
    expect(attribute(actions[0] ?? "", "class")).not.toContain("opacity-0")
    const quiet = attribute(actions[1] ?? "", "class") ?? ""
    for (const cls of REVEAL_ON_INTENT.split(" ")) expect(quiet).toContain(cls)
  })

  it("REVEAL_ON_INTENT never hides without its focus and touch companions", () => {
    const classes = REVEAL_ON_INTENT.split(" ")
    expect(classes).toContain("opacity-0")
    expect(classes).toContain("group-focus-within:opacity-100")
    expect(classes).toContain("focus-within:opacity-100")
    expect(classes).toContain("[@media(hover:none)]:opacity-100")
  })

  it("gives every tab visible rename and remove buttons with the tab's name", () => {
    const tabs = inGerman(surface(TABS))
    for (const label of ["Übersicht", "Details"]) {
      expect(button(tabs, de.renameTabNamed(label))).toBeDefined()
      expect(button(tabs, de.removeTabNamed(label))).toBeDefined()
    }
    const actions = slots(tabs, "builder-tab-actions")
    expect(attribute(actions[0] ?? "", "class")).toContain("opacity-100")
    expect(attribute(actions[0] ?? "", "class")).not.toContain("opacity-0")
    for (const cls of REVEAL_ON_INTENT.split(" ")) {
      expect(attribute(actions[1] ?? "", "class")).toContain(cls)
    }
  })

  it("names the keyboard rename on every tab, and swaps the tab for a labelled field while renaming", () => {
    const tabs = inGerman(surface(TABS))
    const triggers = openingTags(tabs, "button").filter((t) => attribute(t, "role") === "tab")
    expect(triggers).toHaveLength(2)
    for (const t of triggers) expect(attribute(t, "title")).toBe(de.renameTitle)
    expect(tabs).toContain(de.renameHint)

    const editing = inGerman(surface(TABS, 1))
    const input = openingTags(editing, "input")[0] ?? ""
    expect(attribute(input, "aria-label")).toBe(de.renameTab)
    expect(attribute(input, "value")).toBe("Details")
    // The field is not nested inside the tab button (no interactive in interactive).
    expect(editing).not.toMatch(/<button[^>]*role="tab"[^>]*>(?:(?!<\/button>)[\s\S])*<input/)
    expect(
      openingTags(editing, "button").filter((t) => attribute(t, "role") === "tab"),
    ).toHaveLength(1)
  })

  it("puts the kit focus ring on every builder control", () => {
    const markup = [
      html,
      inGerman(<Workspace {...workspace({ advanced: true, onAddTab: noop })} />),
      inGerman(surface(TABS)),
      inGerman(surface(TABS, 0)),
      inGerman(toolbar({ advanced: true })),
    ].join("")
    const controls = [
      ...openingTags(markup, "button"),
      ...openingTags(markup, "input"),
      ...openingTags(markup, "div").filter((t) => attribute(t, "role") === "separator"),
      ...openingTags(markup, "h2").filter((t) => attribute(t, "tabindex") === "-1"),
    ]
    expect(controls.length).toBeGreaterThan(20)
    for (const tag of controls)
      expect(attribute(tag, "class"), tag).toContain("focus-visible:ring-focus")
  })
})

describe("data sources (advanced): pickers name the choice, not the whole option", () => {
  const html = inGerman(
    <PipelineStrip
      L={de}
      keyEntries={[{ name: "demo:customerId", rawValue: "c-1" }]}
      stepEntries={[{ id: "customer", step: "demo:resolve-customer" }]}
      keyCatalog={[
        {
          key: "demo:customerId",
          producedBySteps: [],
          consumedBySteps: ["demo:resolve-customer"],
          consumedByWidgets: [],
          inContext: true,
        },
      ]}
      availableSteps={[
        {
          id: "demo:resolve-customer",
          app: "demo",
          dataType: "demo:customer",
          requires: ["demo:customerId"],
          produces: ["demo:customer"],
          title: { en: "Customer", de: "Kunde" },
        },
      ]}
      stepsByApp={[]}
      liveKeys={{}}
      onAddKey={noop}
      onUpdateKey={noop}
      onRemoveKey={noop}
      onAddStep={noop}
      onUpdateStep={noop}
      onRemoveStep={noop}
      status="idle"
    />,
  )
  const triggerText = (name: string) => {
    const trigger = (
      html.match(/<button\b[^>]*role="combobox"[^>]*>[\s\S]*?<\/button>/g) ?? []
    ).find((b) => attribute(openingTags(b, "button")[0] ?? "", "aria-label") === name)
    return decodeEntities((trigger ?? "").replace(/<[^>]*>/g, "")).trim()
  }

  it("shows the chosen key without its consumers", () => {
    expect(triggerText(de.keyName)).toBe("demo:customerId")
  })

  it("shows the chosen step by its title, with its contract in words beneath", () => {
    expect(triggerText(de.stepPickerLabel)).toBe("Kunde")
    expect(html).toContain(`${de.catalogueNeedsKeys} <span class="font-mono">demo:customerId`)
    expect(html).toContain(`${de.stepProvides} <span class="font-mono">demo:customer<`)
  })
})

describe("toolbar: Apply, Discard and Save as dashboard are three different things", () => {
  it("leads with Apply (primary), Discard and Save as dashboard beside it", () => {
    const html = inGerman(toolbar())
    const apply = buttonTag(html, de.apply)
    expect(attribute(apply, "data-variant")).toBe("default")
    expect(attribute(apply, "title")).toBe(de.applyHint)
    expect(attribute(buttonTag(html, de.discard), "title")).toBe(de.discardHint)
    const save = buttonTag(html, de.save)
    expect(attribute(save, "data-variant")).toBe("outline")
    expect(attribute(save, "title")).toBe(de.saveHint)
  })

  it("has no Apply without a view to apply to, but keeps Discard, which then resets", () => {
    const html = inGerman(toolbar({ onApply: undefined }))
    expect(button(html, de.apply)).toBeUndefined()
    expect(button(html, de.discard)).toBeDefined()
    // Nothing is left there: the tooltip says what Discard does instead.
    expect(attribute(buttonTag(html, de.discard), "title")).toBe(de.discardHintStandalone)
    expect(de.discardHintStandalone).not.toBe(de.discardHint)
  })

  it("marks unsaved changes in a live region that is always mounted", () => {
    const clean = inGerman(toolbar())
    const region = slots(clean, "builder-unsaved")[0] ?? ""
    expect(attribute(region, "role")).toBe("status")
    expect(clean).not.toContain(de.unsavedChanges)
    expect(inGerman(toolbar({ unsaved: true }))).toContain(de.unsavedChanges)
  })

  it("keeps the catalogue and the data-source stats behind the Advanced toggle", () => {
    const basic = inGerman(toolbar())
    expect(attribute(buttonTag(basic, de.advanced), "aria-pressed")).toBe("false")
    expect(button(basic, de.catalogue)).toBeUndefined()
    expect(basic).not.toContain(de.statsReachable)
    const advanced = inGerman(toolbar({ advanced: true }))
    expect(attribute(buttonTag(advanced, de.advanced), "aria-pressed")).toBe("true")
    expect(button(advanced, de.catalogue)).toBeDefined()
    expect(advanced).toContain(de.statsReachable)
  })

  it("names the mode in words next to the title, with no status-tinted tile before it", () => {
    // A mode is no status (CI §3.3), and a tinted icon tile before a title is
    // the pattern WidgetHeader.icon deprecates (anti-slop U2).
    for (const previewMode of [false, true]) {
      const html = inGerman(toolbar({ previewMode }))
      const lead = html.slice(0, html.indexOf("<h2"))
      expect(lead, `previewMode ${previewMode}`).not.toMatch(
        /bg-(?:success|warning|danger|info)-soft/,
      )
      expect(lead, `previewMode ${previewMode}`).not.toContain("<svg")
      expect(html).toContain(previewMode ? de.previewBadge : de.builderBadge)
    }
  })

  it("titles the builder with the focus target of the hand-off from the view", () => {
    const title = slots(inGerman(toolbar()), slotOf(BUILDER_FOCUS_TARGET))
    expect(title).toHaveLength(1)
    expect(title[0]?.startsWith("<h2")).toBe(true)
    expect(attribute(title[0] ?? "", "tabindex")).toBe("-1")
  })
})

describe("save dialog: points to Apply only where there is one", () => {
  const description = (canApply: boolean) =>
    elements(
      SaveDialog({
        L: de,
        open: true,
        onOpenChange: noop,
        canApply,
        name: "",
        setName: noop,
        description: "",
        setDescription: noop,
        onSubmit: () => Promise.resolve(),
        busy: false,
        error: null,
      }),
    ).find((e) => e.type === DialogDescription)?.props.children

  it("names Apply as the way to change the view when the builder has one", () => {
    expect(description(true)).toBe(de.saveDialogDescription)
    expect(de.saveDialogDescription).toContain(de.apply)
  })

  it("leaves Apply out in a builder without a view to apply to", () => {
    expect(description(false)).toBe(de.saveDialogDescriptionStandalone)
    expect(de.saveDialogDescriptionStandalone).not.toContain(de.apply)
  })
})

describe("palette: a loading state first, then the elements or an empty state for people", () => {
  it("shows a loading state, no count and no empty text while the catalogue is on its way", () => {
    const html = inGerman(
      <Workspace {...workspace({ paletteByApp: [], paletteCount: 0, paletteLoading: true })} />,
    )
    expect(slots(html, "builder-palette-loading")).toHaveLength(1)
    expect(html).toMatch(new RegExp(`role="status"[^>]*>${de.paletteLoading}<`))
    expect(html).not.toContain(de.paletteEmpty)
    expect(html).not.toContain('data-slot="badge"')
  })

  it("says there are no elements yet without data-source words, and offers the data sources", () => {
    const html = inGerman(<Workspace {...workspace({ paletteByApp: [], paletteCount: 0 })} />)
    expect(slots(html, "builder-palette-empty")).toHaveLength(1)
    expect(html).toContain(de.paletteEmpty)
    for (const word of [de.keyName, de.stepsHeader, "Schritt"]) {
      expect(de.paletteEmpty).not.toContain(word)
    }
    expect(button(html, de.openDataSources)).toBeDefined()
    expect(html).not.toContain(de.paletteLoading)
  })

  it("opens the data sources from the empty palette", () => {
    const onOpenDataSources = vi.fn<() => void>()
    const actions = elements(PaletteEmpty({ L: de, onOpenDataSources })).filter(
      (e) => e.type === Button,
    )
    expect(actions).toHaveLength(1)
    expect(actions[0]?.props.onClick).toBe(onOpenDataSources)
  })

  it("lists the elements once they are there", () => {
    const html = inGerman(<Workspace {...workspace()} />)
    expect(slots(html, "builder-palette-loading")).toEqual([])
    expect(slots(html, "builder-palette-empty")).toEqual([])
    expect(slots(html, "builder-palette-item")).toHaveLength(PALETTE.length)
  })
})

describe("discard confirmation: says what the view loses", () => {
  const dialog = (changesSaved: boolean, onConfirm = noop) =>
    elements(DiscardDialog({ L: de, open: true, onOpenChange: noop, changesSaved, onConfirm }))
  const description = (changesSaved: boolean) =>
    dialog(changesSaved).find((e) => e.type === DialogDescription)?.props.children

  it("calls the changes lost when no saved dashboard holds them", () => {
    expect(description(false)).toBe(de.discardDialogDescription)
  })

  it("says the saved dashboard keeps them when one does", () => {
    expect(description(true)).toBe(de.discardDialogDescriptionSaved)
    expect(de.discardDialogDescriptionSaved).toContain("Dashboard")
  })

  it("discards on its destructive button only", () => {
    const onConfirm = vi.fn<() => void>()
    const destructive = dialog(false, onConfirm).filter((e) => e.props.variant === "destructive")
    expect(destructive).toHaveLength(1)
    expect(destructive[0]?.props.onClick).toBe(onConfirm)
  })
})

describe("tab rename by keyboard: the focus comes back, also under a new name", () => {
  const base = {
    L: de,
    active: true,
    renameRejected: false,
    errorId: "rename-error",
    onCancelRename: noop,
    onRemove: noop,
  }
  const trigger = (item: ReactNode) => elements(item).find((e) => e.type === TabsTrigger)
  const field = (item: ReactNode) =>
    elements(item).find((e) => typeof e.props.onCommit === "function")

  it("starts the rename with F2, and with Enter on the active tab only", () => {
    const onStartRename = vi.fn<() => void>()
    const props = { ...base, label: "Details", editing: false, onStartRename }
    const keyDown = (active: boolean, key: string) => {
      const item = TabItem({
        ...props,
        active,
        onCommitRename: () => true,
        triggerRef: noop,
        onRefocus: noop,
      })
      const preventDefault = vi.fn<() => void>()
      ;(trigger(item)?.props.onKeyDown as (e: object) => void)({ key, preventDefault })
      return preventDefault
    }
    expect(keyDown(false, "F2")).toHaveBeenCalledOnce()
    expect(keyDown(true, "Enter")).toHaveBeenCalledOnce()
    expect(onStartRename).toHaveBeenCalledTimes(2)
    expect(keyDown(false, "Enter")).not.toHaveBeenCalled()
    expect(keyDown(true, "ArrowRight")).not.toHaveBeenCalled()
    expect(onStartRename).toHaveBeenCalledTimes(2)
  })

  it("Enter with a NEW name focuses the renamed tab, which is a new tab (keyed by its label)", () => {
    const refocus = createTabRefocus()
    const onCommitRename = vi.fn<(label: string) => boolean>(() => true)
    const editing = TabItem({
      ...base,
      label: "Details",
      editing: true,
      onStartRename: noop,
      onCommitRename,
      ...refocus.forTab(1),
    })
    expect(
      (field(editing)?.props.onCommit as (v: string, k: boolean) => boolean)("Kosten", true),
    ).toBe(true)
    expect(onCommitRename).toHaveBeenCalledExactlyOnceWith("Kosten")
    // React mounts the renamed tab afresh; its trigger attaches through the surface's hand-back.
    const renamed = TabItem({
      ...base,
      label: "Kosten",
      editing: false,
      onStartRename: noop,
      onCommitRename,
      ...refocus.forTab(1),
    })
    const focus = vi.fn<() => void>()
    ;(trigger(renamed)?.props.ref as (el: object) => void)({ focus })
    expect(focus).toHaveBeenCalledOnce()
  })

  it("Escape asks for the focus back too; a pointer commit and a rejected name do not", () => {
    const onRefocus = vi.fn<() => void>()
    const onCancelRename = vi.fn<() => void>()
    const item = (accepted: boolean) =>
      TabItem({
        ...base,
        label: "Details",
        editing: true,
        onStartRename: noop,
        onCommitRename: () => accepted,
        onCancelRename,
        triggerRef: noop,
        onRefocus,
      })
    const commit = (accepted: boolean, byKeyboard: boolean) =>
      (field(item(accepted))?.props.onCommit as (v: string, k: boolean) => boolean)("X", byKeyboard)
    expect(commit(true, false)).toBe(true)
    expect(commit(false, true)).toBe(false)
    expect(onRefocus).not.toHaveBeenCalled()
    ;(field(item(true))?.props.onCancel as () => void)()
    expect(onRefocus).toHaveBeenCalledOnce()
    expect(onCancelRename).toHaveBeenCalledOnce()
  })
})

describe("LayoutBuilder: the data sources sit behind Advanced", () => {
  const rows = [{ row: [] }] satisfies RowDef[]

  it("shows only the layout and the preview by default", () => {
    const html = inGerman(
      <LayoutBuilder
        initialLayout={{ rows }}
        widgets={{}}
        callTool={() => Promise.resolve({})}
        onExit={noop}
      />,
    )
    const tabs = (html.match(/<button[^>]*role="tab"[\s\S]*?<\/button>/g) ?? []).map((t) =>
      t.replace(/<[^>]+>/g, "").trim(),
    )
    expect(tabs).toEqual([de.viewLayoutTab, de.viewPreviewTab])
    expect(button(html, de.apply)).toBeDefined()
  })

  it("labels Apply with a consumer's override of the deprecated `done`, unless `apply` is set", () => {
    const props = { widgets: {}, callTool: () => Promise.resolve({}), onExit: noop }
    expect(
      button(inGerman(<LayoutBuilder {...props} labels={{ done: "Fertig" }} />), "Fertig"),
    ).toBeDefined()
    const both = inGerman(<LayoutBuilder {...props} labels={{ done: "Fertig", apply: "Los" }} />)
    expect(button(both, "Los")).toBeDefined()
    expect(button(both, "Fertig")).toBeUndefined()
  })

  it("labels Apply with a LocaleProvider override of the deprecated `done` too", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" toolkitMessages={{ builder: { done: "Finish" } }}>
        <LayoutBuilder widgets={{}} callTool={() => Promise.resolve({})} onExit={noop} />
      </LocaleProvider>,
    )
    expect(button(html, "Finish")).toBeDefined()
    expect(button(html, TOOLKIT_MESSAGES.en.builder.apply)).toBeUndefined()
  })

  it("shows the palette's loading state, not the empty state, before the catalogue answers", () => {
    const html = inGerman(<LayoutBuilder widgets={{}} callTool={() => new Promise(noop)} />)
    expect(slots(html, "builder-palette-loading")).toHaveLength(1)
    expect(html).not.toContain(de.emptyHintTitle)
    expect(html).not.toContain(de.paletteEmpty)
  })

  it("offers Discard but no Apply when embedded without onExit", () => {
    const html = inGerman(<LayoutBuilder widgets={{}} callTool={() => Promise.resolve({})} />)
    expect(button(html, de.apply)).toBeUndefined()
    expect(button(html, de.discard)).toBeDefined()
  })
})

describe("focus hand-off between the view and the builder", () => {
  it("moves to the builder's title on entry and back to the edit button on exit", () => {
    expect(buildModeFocusTarget(false, true)).toBe(BUILDER_FOCUS_TARGET)
    expect(buildModeFocusTarget(true, false)).toBe(VIEW_FOCUS_TARGET)
    expect(BUILDER_FOCUS_TARGET).toBe('[data-slot="builder-title"]')
    expect(VIEW_FOCUS_TARGET).toBe('[data-slot="view-edit"]')
  })

  it("stays put when build mode did not switch", () => {
    expect(buildModeFocusTarget(false, false)).toBeNull()
    expect(buildModeFocusTarget(true, true)).toBeNull()
  })

  it("puts an embedded builder's focus on its title after a Discard reset, not on first mount", () => {
    expect(builderMountFocusTarget(0)).toBeNull()
    expect(builderMountFocusTarget(1)).toBe(BUILDER_FOCUS_TARGET)
    expect(builderMountFocusTarget(5)).toBe(BUILDER_FOCUS_TARGET)
  })
})

// -------------------------------------------------------------------------- //
// Static gates over the builder sources
// -------------------------------------------------------------------------- //

const VIEW_SOURCE =
  import.meta.glob(["../mcp-app-view.tsx"], { query: "?raw", import: "default", eager: true })[
    "../mcp-app-view.tsx"
  ] ?? ""

/** The argument texts of every call to `callee` in a source. */
function callsTo(file: string, source: string, callee: string): string[][] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[][] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === callee) {
      found.push(node.arguments.map((a) => a.getText(sf)))
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const BUILDER_SOURCES = import.meta.glob(
  ["./*.tsx", "!./*.test.tsx", "../layout-builder.tsx", "../widget-props-sheet.tsx"],
  { query: "?raw", import: "default", eager: true },
)

/** JSX elements that handle a double-click but no key (a pointer-only rename). */
function doubleClickWithoutKeys(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const names = node.attributes.properties.map((p) =>
        ts.isJsxAttribute(p) ? p.name.getText(sf) : "",
      )
      if (names.includes("onDoubleClick") && !names.includes("onKeyDown")) {
        found.push(`${file}: <${node.tagName.getText(sf)}>`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

describe("builder source gates", () => {
  it("scans the builder sources", () => {
    expect(Object.keys(BUILDER_SOURCES)).toContain("./LayoutSurface.tsx")
    expect(Object.keys(BUILDER_SOURCES)).toContain("../layout-builder.tsx")
    expect(Object.keys(BUILDER_SOURCES).length).toBeGreaterThan(12)
  })

  it("hides a control only through REVEAL_ON_INTENT (never opacity-0 behind hover alone)", () => {
    const offenders = Object.entries(BUILDER_SOURCES).filter(([, src]) => /\bopacity-0\b/.test(src))
    expect(offenders.map(([file]) => file)).toEqual([])
  })

  it("wires the focus hand-off: McpAppView across build mode, LayoutBuilder after a reset", () => {
    // McpAppView moves the focus between the edit button and the builder's title.
    expect(callsTo("mcp-app-view.tsx", VIEW_SOURCE, "useBuildModeFocus")).toEqual([
      ["buildMode", "frameRef"],
    ])
    expect(VIEW_SOURCE).toMatch(/<div ref=\{frameRef\}[^>]*data-slot="mcp-app-view"/)
    // LayoutBuilder focuses its title after a Discard reset, through its root element.
    const builder = BUILDER_SOURCES["../layout-builder.tsx"] ?? ""
    expect(callsTo("layout-builder.tsx", builder, "builderMountFocusTarget")).toEqual([
      ["generation"],
    ])
    expect(callsTo("layout-builder.tsx", builder, "useFocusOnMount")).toEqual([["mountFocus"]])
    expect(builder).toMatch(/<div ref=\{rootRef\}/)
    // The gate sees a call it looks for.
    expect(callsTo("self.tsx", "useBuildModeFocus(a, b)", "useBuildModeFocus")).toEqual([
      ["a", "b"],
    ])
  })

  it("pairs every double-click with a keyboard path", () => {
    const offenders = Object.entries(BUILDER_SOURCES).flatMap(([file, src]) =>
      doubleClickWithoutKeys(file, src),
    )
    expect(offenders).toEqual([])
    expect(
      doubleClickWithoutKeys("self.tsx", "const A = () => <b onDoubleClick={f} />").length,
    ).toBe(1)
  })

  it("renders every builder and props-sheet catalog string somewhere (no dead copy)", () => {
    const all = Object.values(BUILDER_SOURCES).join("\n")
    const builderKeys = Object.keys(TOOLKIT_MESSAGES.en.builder)
    const unused = builderKeys.filter((key) => !new RegExp(`\\.${key}\\b`).test(all))
    expect(unused).toEqual([])
    const sheet = BUILDER_SOURCES["../widget-props-sheet.tsx"] ?? ""
    const sheetKeys = Object.keys(TOOLKIT_MESSAGES.en.propsSheet)
    expect(sheetKeys.filter((key) => !new RegExp(`\\b${key}\\b`).test(sheet))).toEqual([])
  })
})
