/**
 * Pure, browser-safe model helpers for the visual LayoutBuilder.
 *
 * Everything here is free of React and `mcp-use`: plain functions over the
 * builder's draft state and the key/step editor. Extracting them out of
 * `layout-builder.tsx` makes the trickiest logic — the
 * `parseKeyValue ↔ keysToEntries ↔ entriesToKeys` round-trip and
 * `draftToLayout` — unit-testable in isolation.
 */
import type { LayoutConfig, PipelineContext, RowDef } from "@miragon/mcp-toolkit-core"
import { normalizeLayout } from "@miragon/mcp-toolkit-core"

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
 * without the editor overwriting their (empty) input.
 */
export function formatLiveKeyValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (value === "") return undefined
  if (typeof value === "string") return `live: ${value}`
  try {
    return `live: ${JSON.stringify(value)}`
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
