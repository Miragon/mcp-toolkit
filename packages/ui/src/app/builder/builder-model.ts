/**
 * Pure, browser-safe model helpers for the visual LayoutBuilder.
 *
 * Everything here is free of React and `mcp-use`: plain functions over the
 * builder's draft state and the key/step editor. Extracting them out of
 * `layout-builder.tsx` makes the trickiest logic — the
 * `parseKeyValue ↔ keysToEntries ↔ entriesToKeys` round-trip and
 * `draftToLayout` — unit-testable in isolation.
 */
import type {
  DisplayText,
  LayoutConfig,
  PipelineContext,
  PipelineStepRef,
  RowDef,
} from "@miragon/mcp-toolkit-core"
import {
  normalizeLayout,
  PROPS_SCHEMA_DISPLAY_KEYWORD,
  resolveLocalizedText,
} from "@miragon/mcp-toolkit-core"

// -------------------------------------------------------------------------- //
// Draft types
// -------------------------------------------------------------------------- //

export interface DraftTab {
  label: string
  rows: RowDef[]
}

export type DraftLayout = { kind: "rows"; rows: RowDef[] } | { kind: "tabs"; tabs: DraftTab[] }

export interface KeyEntry {
  name: string
  rawValue: string
}

/**
 * Wire shape of the `context` payload `get-builder-catalogue` returns.
 * Carries `stepIds` plus keyed `stepData` rather than the runtime
 * `PipelineContext` shape; `toPipelineContext` inflates it.
 */
export interface WireContext {
  keys: Record<string, unknown>
  stepIds: string[]
  stepData: Record<
    string,
    { data: unknown; keys: Record<string, unknown>; _app: string; _dataType: string }
  >
  errors: { stepId: string; reason: string }[]
}

// -------------------------------------------------------------------------- //
// Draft <-> layout conversions
// -------------------------------------------------------------------------- //

export function emptyRows(): RowDef[] {
  return [{ row: [] }]
}

export function cloneRows(rows: RowDef[]): RowDef[] {
  return rows.map((r) => ({ row: r.row.map((c) => ({ ...c })) }))
}

export function initDraft(layout: LayoutConfig | undefined): DraftLayout {
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

export function draftToLayout(draft: DraftLayout): LayoutConfig {
  if (draft.kind === "tabs") {
    return { tabs: draft.tabs.map((t) => ({ label: t.label, rows: cloneRows(t.rows) })) }
  }
  return { rows: cloneRows(draft.rows) }
}

// -------------------------------------------------------------------------- //
// Key value parsing
// -------------------------------------------------------------------------- //

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
export function parseKeyValue(raw: string): unknown {
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
export function keysToEntries(keys: Record<string, unknown> | undefined): KeyEntry[] {
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

export function entriesToKeys(entries: KeyEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const entry of entries) {
    if (!entry.name.trim()) continue
    out[entry.name] = parseKeyValue(entry.rawValue)
  }
  return out
}

/**
 * Compact preview of a value as it currently lives in the pipeline.
 * Used as the placeholder when the editor's `rawValue` is empty so the
 * user can see what the server is actually working with right now
 * without the editor overwriting their (empty) input. `prefix` is the
 * localized word for "live" (the builder passes its catalog's).
 */
export function formatLiveKeyValue(value: unknown, prefix = "live"): string | undefined {
  if (value === undefined) return undefined
  if (value === "") return undefined
  if (typeof value === "string") return `${prefix}: ${value}`
  try {
    return `${prefix}: ${JSON.stringify(value)}`
  } catch {
    return undefined
  }
}

export function valueTypeLabel(raw: string): string {
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

// -------------------------------------------------------------------------- //
// Layout sizing & step ids
// -------------------------------------------------------------------------- //

export function sizeToSpan(size: string): number {
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

export function defaultStepIdFor(stepId: string, takenIds: Set<string>): string {
  const base = stepId.split(":")[1] || stepId.replace(/[^a-z0-9]/gi, "-")
  if (!takenIds.has(base)) return base
  let i = 2
  while (takenIds.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

// -------------------------------------------------------------------------- //
// Context inflation
// -------------------------------------------------------------------------- //

/**
 * Inflates the wire-shape `context` (which carries `stepIds` and
 * keyed `stepData`) into the runtime `PipelineContext` shape that
 * `WidgetRenderer` expects.
 */
export function toPipelineContext(ctx: WireContext): PipelineContext {
  const steps: PipelineContext["steps"] = {}
  for (const [id, result] of Object.entries(ctx.stepData)) {
    steps[id] = { ...result, _step: id }
  }
  return { steps, keys: ctx.keys, errors: ctx.errors }
}

// -------------------------------------------------------------------------- //
// Display text — what the builder calls a widget, a step or a props field
// -------------------------------------------------------------------------- //

/** Resolves an i18n key in the active locale; `undefined` when it is unknown. */
export type DisplayKeyResolver = (key: string) => string | undefined

/**
 * A {@link DisplayKeyResolver} over a translate function that echoes unknown
 * keys (the `createTranslator` / `useTranslate` contract): the echo, or a
 * blank result, means "unknown", so the caller falls back to its inline text.
 */
export function keyResolverFrom(translate: (key: string) => string): DisplayKeyResolver {
  return (key) => {
    const text = translate(key).trim()
    return text.length > 0 && text !== key ? text : undefined
  }
}

/**
 * The i18n key's text when the resolver knows it, else the inline (per-locale)
 * text. Display text crosses the wire (the catalogue, a `propsSchema`), so a
 * key that is not a string is ignored instead of reaching the translator.
 */
function keyedText(
  key: unknown,
  text: DisplayText["title"],
  locale: string,
  resolveKey: DisplayKeyResolver | undefined,
): string | undefined {
  const viaKey = typeof key === "string" && resolveKey ? resolveKey(key) : undefined
  return viaKey ?? resolveLocalizedText(text, locale)
}

/** How the builder names one entry: a label, the technical id as a quiet hint, a one-liner. */
export interface DisplayLabel {
  /** The name people read: the entry's title, else its id. */
  label: string
  /** The technical id, set only when the label is a real title (so it is never shown twice). */
  hint?: string
  /** The one-line summary, when the entry has one. */
  summary?: string
}

/**
 * The builder's name for a widget or a step: its `titleKey` (when `resolveKey`
 * knows it), its `title` in `locale`, else the id. The id comes back as `hint`
 * only next to a real title. The `description` is the LLM's text and never
 * appears here.
 */
export function displayLabel(
  entry: DisplayText,
  id: string,
  locale: string,
  resolveKey?: DisplayKeyResolver,
): DisplayLabel {
  const title = keyedText(entry.titleKey, entry.title, locale, resolveKey)
  const summary = keyedText(entry.summaryKey, entry.summary, locale, resolveKey)
  return {
    label: title ?? id,
    ...(title !== undefined && title !== id ? { hint: id } : {}),
    ...(summary !== undefined ? { summary } : {}),
  }
}

/** A props-sheet field: its label, the raw property name as a hint, and its help line. */
export interface PropFieldText {
  label: string
  /** The property name, set only when the label differs from it. */
  hint?: string
  help?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * The props sheet's text for one `propsSchema` property. Label: the
 * `x-display` title (key or text), else the standard JSON Schema `title`,
 * else the property name. Help: the `x-display` summary, else the property's
 * `description`.
 */
export function propFieldText(
  name: string,
  prop: Record<string, unknown>,
  locale: string,
  resolveKey?: DisplayKeyResolver,
): PropFieldText {
  const raw = prop[PROPS_SCHEMA_DISPLAY_KEYWORD]
  const display: DisplayText = isRecord(raw) ? raw : {}
  const schemaTitle = typeof prop.title === "string" ? prop.title : undefined
  const label =
    keyedText(display.titleKey, display.title, locale, resolveKey) ??
    resolveLocalizedText(schemaTitle, locale) ??
    name
  const schemaHelp = typeof prop.description === "string" ? prop.description : undefined
  const help =
    keyedText(display.summaryKey, display.summary, locale, resolveKey) ??
    resolveLocalizedText(schemaHelp, locale)
  return {
    label,
    ...(label !== name ? { hint: name } : {}),
    ...(help !== undefined ? { help } : {}),
  }
}

// -------------------------------------------------------------------------- //
// Draft status — what Apply, Discard and the unsaved marker compare
// -------------------------------------------------------------------------- //

/**
 * Whether the draft holds at least one element on ANY tab, not only the
 * active one: a new, still empty tab must not disable "Save as dashboard" or
 * the preview while another tab has content.
 */
export function draftHasCells(draft: DraftLayout): boolean {
  const rows = draft.kind === "tabs" ? draft.tabs.flatMap((t) => t.rows) : draft.rows
  return rows.some((r) => r.row.length > 0)
}

/**
 * A comparable fingerprint of what Apply and Save hand on: the layout, the
 * keys (blank names dropped, values parsed) and the steps that name a step.
 * An empty key or step row the user has not filled in changes nothing.
 */
export function builderSnapshot(
  draft: DraftLayout,
  keyEntries: KeyEntry[],
  stepEntries: PipelineStepRef[],
): string {
  return JSON.stringify({
    layout: draftToLayout(draft),
    keys: entriesToKeys(keyEntries),
    steps: stepEntries.filter((s) => s.step.trim().length > 0),
  })
}

/** What Apply hands to `onExit`: the draft, plus the live context it was previewed with. */
export interface BuilderExitCommit {
  layout: LayoutConfig
  keys?: Record<string, unknown>
  steps?: PipelineStepRef[]
  title?: string
  context?: WireContext
}

/**
 * The commit of Apply: the layout, keys and steps exactly as a save would send
 * them, and the live context in its wire shape (`stepIds` + keyed `stepData`)
 * so the view renders the just-built layout without another round trip.
 */
export function toExitCommit(
  draft: DraftLayout,
  keyEntries: KeyEntry[],
  stepEntries: PipelineStepRef[],
  title: string | undefined,
  live: PipelineContext,
): BuilderExitCommit {
  return {
    layout: draftToLayout(draft),
    keys: entriesToKeys(keyEntries),
    steps: stepEntries.filter((s) => s.step.trim().length > 0),
    title,
    context: {
      keys: live.keys,
      stepIds: Object.keys(live.steps),
      stepData: Object.fromEntries(
        Object.entries(live.steps).map(([id, result]) => [
          id,
          { data: result.data, keys: result.keys, _app: result._app, _dataType: result._dataType },
        ]),
      ),
      errors: live.errors,
    },
  }
}

export interface DraftStatus {
  /**
   * The draft differs from the view as it was before editing: what Discard
   * takes out of the view, so it decides whether Discard asks first.
   */
  changed: boolean
  /**
   * The draft has changes that would be lost: it differs from the view before
   * editing AND from the last saved dashboard (a draft equal to either one
   * loses nothing). Drives the unsaved marker and tells the discard
   * confirmation whether a dashboard keeps the changes.
   */
  unsaved: boolean
}

/** Compares the current {@link builderSnapshot} with the pre-edit one and the last saved one. */
export function draftStatus(current: string, baseline: string, saved: string | null): DraftStatus {
  const changed = current !== baseline
  return { changed, unsaved: changed && current !== saved }
}

// -------------------------------------------------------------------------- //
// Leaving — Apply commits, Discard restores (asking first when the view loses changes)
// -------------------------------------------------------------------------- //

/** The builder's leave actions, built by {@link builderLeave}. */
export interface BuilderLeave {
  /** Apply: hands the commit to `onExit`. Absent without `onExit` (no view to apply to). */
  apply?: () => void
  /** Discard: asks first when the view would lose changes, else leaves at once. */
  discard: () => void
  /** Discard without asking (the confirmation's own action). */
  discardNow: () => void
}

/**
 * The builder's leave actions. Apply hands `commit()` to `onExit`. Discard
 * calls `onExit()` WITHOUT a commit, so the view stays as it was before
 * editing; without `onExit` it calls `onReset()`, which restores the draft in
 * place. Discard asks first (`confirm`) only when the draft `changed` the
 * view: a draft that matches the view before editing loses nothing, even when
 * it differs from a saved dashboard.
 */
export function builderLeave({
  changed,
  onExit,
  onReset,
  commit,
  confirm,
}: {
  changed: boolean
  onExit?: (commit?: BuilderExitCommit) => void
  onReset: () => void
  commit: () => BuilderExitCommit
  confirm: () => void
}): BuilderLeave {
  // Never hands its own arguments on: a click event must not reach `onExit` as a commit.
  const discardNow = () => {
    if (onExit) onExit()
    else onReset()
  }
  return {
    ...(onExit ? { apply: () => onExit(commit()) } : {}),
    discard: () => {
      if (changed) confirm()
      else discardNow()
    },
    discardNow,
  }
}

// -------------------------------------------------------------------------- //
// Keyboard — tab rename without a double-click
// -------------------------------------------------------------------------- //

/**
 * What a key press on a tab trigger does: F2 renames any tab; Enter renames
 * the tab that is already active (on another tab Enter keeps selecting it,
 * the tabs' own behaviour). `null` leaves the key to the tabs.
 */
export function tabTriggerKeyAction(key: string, isActive: boolean): "rename" | null {
  if (key === "F2") return "rename"
  if (key === "Enter" && isActive) return "rename"
  return null
}

/** What a key press in a tab's rename field does: Enter commits, Escape cancels. */
export function renameFieldKeyAction(key: string): "commit" | "cancel" | null {
  if (key === "Enter") return "commit"
  if (key === "Escape") return "cancel"
  return null
}

/**
 * Hands the focus back to a tab once its rename field closes by keyboard.
 * The tab strip holds it, by the tab's INDEX: a rename that changes the label
 * mounts a new tab, so a request held by the tab itself would go with the old
 * one and leave the focus on the document body.
 */
export interface TabRefocus {
  /** The trigger of tab `tabIdx` takes the focus the next time it attaches. */
  request: (tabIdx: number) => void
  /** The ref callback of tab `tabIdx`'s trigger: focuses it once while a request for it is open. */
  attach: (tabIdx: number, el: { focus: () => void } | null) => void
  /** The two props that wire tab `tabIdx` to this hand-back: its trigger's ref and its request. */
  forTab: (tabIdx: number) => TabRefocusProps
}

/** What one tab gets from {@link TabRefocus.forTab}. */
export interface TabRefocusProps {
  triggerRef: (el: { focus: () => void } | null) => void
  onRefocus: () => void
}

/** A {@link TabRefocus} with no open request. */
export function createTabRefocus(): TabRefocus {
  let pending: number | null = null
  const request = (tabIdx: number) => {
    pending = tabIdx
  }
  const attach = (tabIdx: number, el: { focus: () => void } | null) => {
    if (el === null || pending !== tabIdx) return
    pending = null
    el.focus()
  }
  return {
    request,
    attach,
    forTab: (tabIdx) => ({
      triggerRef: (el) => attach(tabIdx, el),
      onRefocus: () => request(tabIdx),
    }),
  }
}

// -------------------------------------------------------------------------- //
// Views — the data sources live behind "Advanced"
// -------------------------------------------------------------------------- //

export type BuilderView = "layout" | "pipeline" | "preview"

/** The builder's views in tab order: the data sources ("pipeline") only in advanced mode. */
export function builderViews(advanced: boolean): BuilderView[] {
  return advanced ? ["layout", "pipeline", "preview"] : ["layout", "preview"]
}

/** The view to show after advanced mode switches: a view that is now hidden falls back to the layout. */
export function viewAfterAdvancedToggle(view: BuilderView, advanced: boolean): BuilderView {
  return builderViews(advanced).includes(view) ? view : "layout"
}
