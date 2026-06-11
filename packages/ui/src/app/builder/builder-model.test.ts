import { describe, expect, it } from "vitest"
import type { LayoutConfig } from "@miragon/mcp-toolkit-core"
import {
  cloneRows,
  defaultStepIdFor,
  draftToLayout,
  emptyRows,
  entriesToKeys,
  formatLiveKeyValue,
  initDraft,
  keysToEntries,
  parseKeyValue,
  sizeToSpan,
  toPipelineContext,
  valueTypeLabel,
  type DraftLayout,
  type KeyEntry,
  type WireContext,
} from "./builder-model.js"

describe("emptyRows", () => {
  it("returns a single empty row", () => {
    expect(emptyRows()).toEqual([{ row: [] }])
  })

  it("returns a fresh array each call (no shared reference)", () => {
    expect(emptyRows()).not.toBe(emptyRows())
  })
})

describe("cloneRows", () => {
  it("deep-clones rows and cells", () => {
    const rows = [{ row: [{ widget: "w", span: 6, props: { a: 1 } }] }]
    const clone = cloneRows(rows)
    expect(clone).toEqual(rows)
    expect(clone).not.toBe(rows)
    expect(clone[0]).not.toBe(rows[0])
    expect(clone[0]!.row[0]).not.toBe(rows[0]!.row[0])
  })
})

describe("initDraft", () => {
  it("defaults to a single empty rows draft when given undefined", () => {
    expect(initDraft(undefined)).toEqual({ kind: "rows", rows: [{ row: [] }] })
  })

  it("normalizes a legacy flat-array layout into a rows draft", () => {
    const layout: LayoutConfig = [{ row: [{ widget: "a" }] }]
    expect(initDraft(layout)).toEqual({ kind: "rows", rows: [{ row: [{ widget: "a" }] }] })
  })

  it("keeps a { rows } layout as a rows draft", () => {
    const layout: LayoutConfig = { rows: [{ row: [{ widget: "a", span: 4 }] }] }
    expect(initDraft(layout)).toEqual({ kind: "rows", rows: [{ row: [{ widget: "a", span: 4 }] }] })
  })

  it("maps a { tabs } layout into a tabs draft", () => {
    const layout: LayoutConfig = {
      tabs: [{ label: "T1", rows: [{ row: [{ widget: "a" }] }] }],
    }
    expect(initDraft(layout)).toEqual({
      kind: "tabs",
      tabs: [{ label: "T1", rows: [{ row: [{ widget: "a" }] }] }],
    })
  })

  it("falls back to an empty rows draft for an empty tabs layout", () => {
    expect(initDraft({ tabs: [] })).toEqual({ kind: "rows", rows: [{ row: [] }] })
  })

  it("clones the source rows so later draft edits do not mutate the input", () => {
    const layout: LayoutConfig = { rows: [{ row: [{ widget: "a" }] }] }
    const draft = initDraft(layout)
    if (draft.kind !== "rows") throw new Error("expected rows draft")
    draft.rows[0]!.row.push({ widget: "b" })
    expect(layout).toEqual({ rows: [{ row: [{ widget: "a" }] }] })
  })
})

describe("draftToLayout", () => {
  it("emits a { rows } layout from a rows draft", () => {
    const draft: DraftLayout = { kind: "rows", rows: [{ row: [{ widget: "a", span: 6 }] }] }
    expect(draftToLayout(draft)).toEqual({ rows: [{ row: [{ widget: "a", span: 6 }] }] })
  })

  it("emits a { tabs } layout from a tabs draft", () => {
    const draft: DraftLayout = {
      kind: "tabs",
      tabs: [{ label: "T1", rows: [{ row: [{ widget: "a" }] }] }],
    }
    expect(draftToLayout(draft)).toEqual({
      tabs: [{ label: "T1", rows: [{ row: [{ widget: "a" }] }] }],
    })
  })

  it("clones rows so the emitted layout is detached from the draft", () => {
    const draft: DraftLayout = { kind: "rows", rows: [{ row: [{ widget: "a" }] }] }
    const layout = draftToLayout(draft) as { rows: { row: { widget: string }[] }[] }
    layout.rows[0]!.row.push({ widget: "b" })
    expect(draft.rows).toEqual([{ row: [{ widget: "a" }] }])
  })

  it("round-trips initDraft -> draftToLayout for tabs", () => {
    const layout: LayoutConfig = {
      tabs: [
        { label: "One", rows: [{ row: [{ widget: "a", span: 3 }] }] },
        { label: "Two", rows: [{ row: [] }] },
      ],
    }
    expect(draftToLayout(initDraft(layout))).toEqual(layout)
  })
})

describe("parseKeyValue", () => {
  it("returns empty string for blank/whitespace input", () => {
    expect(parseKeyValue("")).toBe("")
    expect(parseKeyValue("   ")).toBe("")
  })

  it("keeps bare words as strings", () => {
    expect(parseKeyValue("hello")).toBe("hello")
  })

  it("keeps bare numbers as strings (IDs are strings here)", () => {
    expect(parseKeyValue("1")).toBe("1")
    expect(parseKeyValue("42")).toBe("42")
  })

  it("parses JSON literals true/false/null", () => {
    expect(parseKeyValue("true")).toBe(true)
    expect(parseKeyValue("false")).toBe(false)
    expect(parseKeyValue("null")).toBeNull()
  })

  it("parses explicit JSON objects, arrays and quoted strings", () => {
    expect(parseKeyValue('{"id":1}')).toEqual({ id: 1 })
    expect(parseKeyValue("[1,2]")).toEqual([1, 2])
    expect(parseKeyValue('"quoted"')).toBe("quoted")
  })

  it("preserves the raw string when an obvious-JSON marker fails to parse", () => {
    expect(parseKeyValue("{not json")).toBe("{not json")
    expect(parseKeyValue("[oops")).toBe("[oops")
  })

  it("does not parse a leading-whitespace number as JSON", () => {
    expect(parseKeyValue("  7 ")).toBe("  7 ")
  })
})

describe("keysToEntries", () => {
  it("returns [] for undefined", () => {
    expect(keysToEntries(undefined)).toEqual([])
  })

  it("leaves plain strings as raw values", () => {
    expect(keysToEntries({ id: "abc" })).toEqual([{ name: "id", rawValue: "abc" }])
  })

  it("JSON-encodes non-string values", () => {
    expect(keysToEntries({ n: 5, b: true, o: { x: 1 } })).toEqual([
      { name: "n", rawValue: "5" },
      { name: "b", rawValue: "true" },
      { name: "o", rawValue: '{"x":1}' },
    ])
  })

  it("wraps strings whose re-parse would change type (e.g. the literal 'true')", () => {
    expect(keysToEntries({ flag: "true" })).toEqual([{ name: "flag", rawValue: '"true"' }])
  })

  it("wraps numeric-looking strings only if they would re-parse to a different value", () => {
    // "1" re-parses to the string "1" (bare numbers stay strings), so no wrapping.
    expect(keysToEntries({ id: "1" })).toEqual([{ name: "id", rawValue: "1" }])
  })

  it("wraps strings that look like JSON objects", () => {
    expect(keysToEntries({ s: '{"a":1}' })).toEqual([{ name: "s", rawValue: '"{\\"a\\":1}"' }])
  })
})

describe("entriesToKeys", () => {
  it("skips entries with blank names", () => {
    const entries: KeyEntry[] = [
      { name: "", rawValue: "x" },
      { name: "  ", rawValue: "y" },
      { name: "k", rawValue: "v" },
    ]
    expect(entriesToKeys(entries)).toEqual({ k: "v" })
  })

  it("parses each raw value via parseKeyValue", () => {
    const entries: KeyEntry[] = [
      { name: "flag", rawValue: "true" },
      { name: "obj", rawValue: '{"a":1}' },
      { name: "id", rawValue: "7" },
    ]
    expect(entriesToKeys(entries)).toEqual({ flag: true, obj: { a: 1 }, id: "7" })
  })

  it("last write wins on duplicate names", () => {
    const entries: KeyEntry[] = [
      { name: "k", rawValue: "first" },
      { name: "k", rawValue: "second" },
    ]
    expect(entriesToKeys(entries)).toEqual({ k: "second" })
  })
})

describe("parseKeyValue <-> keysToEntries <-> entriesToKeys round-trip", () => {
  // Values that survive a full edit cycle unchanged.
  const stableCases: { label: string; keys: Record<string, unknown> }[] = [
    { label: "plain string id", keys: { id: "abc" } },
    { label: "numeric-looking string id", keys: { id: "1" } },
    { label: "literal-string 'true'", keys: { flag: "true" } },
    { label: "literal-string 'null'", keys: { x: "null" } },
    { label: "real boolean", keys: { active: true } },
    { label: "real null", keys: { nothing: null } },
    { label: "object", keys: { scope: { processKey: "leasing" } } },
    { label: "array", keys: { ids: [1, 2, 3] } },
    { label: "string that looks like json", keys: { tpl: '{"a":1}' } },
  ]

  for (const { label, keys } of stableCases) {
    it(`preserves ${label} through one edit cycle`, () => {
      expect(entriesToKeys(keysToEntries(keys))).toEqual(keys)
    })
  }

  // Every case (stable or lossy) is idempotent from the second cycle on, since
  // the first cycle normalizes the value into its stable string/JSON form.
  const allCases: { label: string; keys: Record<string, unknown> }[] = [
    ...stableCases,
    { label: "real top-level number (degrades to string)", keys: { count: 5 } },
    { label: "mixed bag", keys: { id: "1", flag: "true", n: 2, o: { a: 1 } } },
  ]

  for (const { label, keys } of allCases) {
    it(`is idempotent across a second cycle for ${label}`, () => {
      const once = entriesToKeys(keysToEntries(keys))
      const twice = entriesToKeys(keysToEntries(once))
      expect(twice).toEqual(once)
    })
  }

  it("documents that a bare top-level number degrades to a string by design", () => {
    // parseKeyValue intentionally keeps bare numbers as strings (IDs are
    // strings ~99% of the time), so a real number survives only as its text.
    expect(entriesToKeys(keysToEntries({ count: 5 }))).toEqual({ count: "5" })
  })
})

describe("formatLiveKeyValue", () => {
  it("returns undefined for undefined and empty string", () => {
    expect(formatLiveKeyValue(undefined)).toBeUndefined()
    expect(formatLiveKeyValue("")).toBeUndefined()
  })

  it("prefixes plain strings with 'live: '", () => {
    expect(formatLiveKeyValue("abc")).toBe("live: abc")
  })

  it("JSON-stringifies non-string values", () => {
    expect(formatLiveKeyValue(42)).toBe("live: 42")
    expect(formatLiveKeyValue({ a: 1 })).toBe('live: {"a":1}')
    expect(formatLiveKeyValue(null)).toBe("live: null")
  })

  it("returns undefined when JSON.stringify throws (circular)", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(formatLiveKeyValue(circular)).toBeUndefined()
  })
})

describe("valueTypeLabel", () => {
  it("labels empty input as str", () => {
    expect(valueTypeLabel("")).toBe("str")
  })

  it("labels null/array/object/primitives", () => {
    expect(valueTypeLabel("null")).toBe("null")
    expect(valueTypeLabel("[1,2]")).toBe("arr")
    expect(valueTypeLabel('{"a":1}')).toBe("obj")
    expect(valueTypeLabel("hello")).toBe("str")
    expect(valueTypeLabel("true")).toBe("bool")
  })

  it("labels bare numbers as str because they stay strings", () => {
    expect(valueTypeLabel("5")).toBe("str")
  })

  it("labels explicitly quoted JSON strings as str", () => {
    expect(valueTypeLabel('"x"')).toBe("str")
  })
})

describe("sizeToSpan", () => {
  it("maps known sizes", () => {
    expect(sizeToSpan("quarter")).toBe(3)
    expect(sizeToSpan("third")).toBe(4)
    expect(sizeToSpan("half")).toBe(6)
    expect(sizeToSpan("full")).toBe(12)
    expect(sizeToSpan("header")).toBe(12)
  })

  it("defaults unknown sizes to 12", () => {
    expect(sizeToSpan("wat")).toBe(12)
    expect(sizeToSpan("")).toBe(12)
  })
})

describe("defaultStepIdFor", () => {
  it("uses the part after the colon as the base id", () => {
    expect(defaultStepIdFor("items-app:load", new Set())).toBe("load")
  })

  it("sanitizes ids without a colon", () => {
    expect(defaultStepIdFor("load.step!", new Set())).toBe("load-step-")
  })

  it("suffixes -2, -3, … when the base is taken", () => {
    expect(defaultStepIdFor("app:load", new Set(["load"]))).toBe("load-2")
    expect(defaultStepIdFor("app:load", new Set(["load", "load-2"]))).toBe("load-3")
  })
})

describe("toPipelineContext", () => {
  it("inflates wire stepData into runtime steps with _step set", () => {
    const wire: WireContext = {
      keys: { a: 1 },
      stepIds: ["s1"],
      stepData: {
        s1: { data: { hi: true }, keys: { k: 1 }, _app: "app", _dataType: "type" },
      },
      errors: [{ stepId: "s2", reason: "boom" }],
    }
    expect(toPipelineContext(wire)).toEqual({
      steps: {
        s1: { data: { hi: true }, keys: { k: 1 }, _app: "app", _dataType: "type", _step: "s1" },
      },
      keys: { a: 1 },
      errors: [{ stepId: "s2", reason: "boom" }],
    })
  })

  it("produces an empty steps map when there is no stepData", () => {
    const wire: WireContext = { keys: {}, stepIds: [], stepData: {}, errors: [] }
    expect(toPipelineContext(wire)).toEqual({ steps: {}, keys: {}, errors: [] })
  })
})
