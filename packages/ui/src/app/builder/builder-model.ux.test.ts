import { describe, expect, it } from "vitest"
import { createTranslator, type PipelineContext } from "@miragon/mcp-toolkit-core"
import {
  builderSnapshot,
  builderViews,
  displayLabel,
  draftStatus,
  initDraft,
  keyResolverFrom,
  propFieldText,
  renameFieldKeyAction,
  tabTriggerKeyAction,
  toExitCommit,
  viewAfterAdvancedToggle,
  type DraftLayout,
} from "./builder-model.js"

/**
 * The builder's UX model (U18, toolkit#13/#14): human titles with the id as
 * the fallback, props-field labels, the draft status behind Apply / Discard /
 * the unsaved marker, the keyboard rename, and the "Advanced" views.
 */

const translate = createTranslator({
  en: { "orders.title": "Orders", "orders.summary": "Every open order.", blank: "  " },
  de: { "orders.title": "Bestellungen", "orders.summary": "Alle offenen Bestellungen." },
})
const deKeys = keyResolverFrom((key) => translate("de", key))

describe("keyResolverFrom", () => {
  it("returns the translation of a known key, trimmed", () => {
    expect(deKeys("orders.title")).toBe("Bestellungen")
    expect(keyResolverFrom(() => "  Padded  ")("k")).toBe("Padded")
  })

  it("treats the echoed key (the translator's 'unknown') and blank text as unknown", () => {
    expect(deKeys("orders.missing")).toBeUndefined()
    expect(keyResolverFrom((key) => translate("en", key))("blank")).toBeUndefined()
    expect(keyResolverFrom(() => "")("k")).toBeUndefined()
  })
})

describe("displayLabel", () => {
  it("falls back to the id when there is no title, with no hint and no summary", () => {
    expect(displayLabel({}, "demo:raw", "de")).toEqual({ label: "demo:raw" })
    expect(displayLabel({ title: "   " }, "demo:raw", "de")).toEqual({ label: "demo:raw" })
  })

  it("shows the title in the locale, the id as the hint, and the summary", () => {
    const entry = {
      title: { en: "Orders", de: "Bestellungen" },
      summary: { en: "Every open order.", de: "Alle offenen Bestellungen." },
    }
    expect(displayLabel(entry, "demo:orders", "de-DE")).toEqual({
      label: "Bestellungen",
      hint: "demo:orders",
      summary: "Alle offenen Bestellungen.",
    })
    expect(displayLabel(entry, "demo:orders", "en")).toEqual({
      label: "Orders",
      hint: "demo:orders",
      summary: "Every open order.",
    })
  })

  it("keeps a summary without a title (the id stays the label, no hint)", () => {
    expect(displayLabel({ summary: "Every open order." }, "demo:orders", "en")).toEqual({
      label: "demo:orders",
      summary: "Every open order.",
    })
  })

  it("never shows the id twice when the title equals it", () => {
    expect(displayLabel({ title: "demo:orders" }, "demo:orders", "en")).toEqual({
      label: "demo:orders",
    })
  })

  it("resolves the i18n keys first and falls back to the inline text when a key is unknown", () => {
    expect(
      displayLabel(
        { titleKey: "orders.title", summaryKey: "orders.summary", title: "Inline" },
        "demo:orders",
        "de",
        deKeys,
      ),
    ).toEqual({ label: "Bestellungen", hint: "demo:orders", summary: "Alle offenen Bestellungen." })
    expect(
      displayLabel(
        { titleKey: "orders.missing", title: "Inline", summaryKey: "nope", summary: "Text" },
        "demo:orders",
        "de",
        deKeys,
      ),
    ).toEqual({ label: "Inline", hint: "demo:orders", summary: "Text" })
  })

  it("ignores the keys without a resolver", () => {
    expect(displayLabel({ titleKey: "orders.title" }, "demo:orders", "de")).toEqual({
      label: "demo:orders",
    })
  })
})

describe("propFieldText", () => {
  it("labels a bare property with its name, without a hint or help", () => {
    expect(propFieldText("dataKey", { type: "string" }, "de")).toEqual({ label: "dataKey" })
  })

  it("uses the JSON Schema title and description, with the name as the hint", () => {
    expect(
      propFieldText(
        "dataKey",
        { type: "string", title: "Data key", description: "Where the cells live." },
        "de",
      ),
    ).toEqual({ label: "Data key", hint: "dataKey", help: "Where the cells live." })
  })

  it("prefers the x-display title and summary (per locale) over the schema's", () => {
    const prop = {
      type: "string",
      title: "Data key",
      description: "Context key holding the KPI cells.",
      "x-display": {
        title: { en: "Data source", de: "Datenquelle" },
        summary: { en: "Where the figures come from.", de: "Woher die Zahlen kommen." },
      },
    }
    expect(propFieldText("dataKey", prop, "de")).toEqual({
      label: "Datenquelle",
      hint: "dataKey",
      help: "Woher die Zahlen kommen.",
    })
  })

  it("resolves the x-display keys through the translator first", () => {
    const prop = {
      "x-display": { titleKey: "orders.title", summaryKey: "orders.summary", title: "Inline" },
    }
    expect(propFieldText("key", prop, "de", deKeys)).toEqual({
      label: "Bestellungen",
      hint: "key",
      help: "Alle offenen Bestellungen.",
    })
  })

  it("ignores a malformed x-display and non-string schema keywords", () => {
    for (const display of [null, "Datenquelle", ["x"], 3]) {
      expect(
        propFieldText("dataKey", { "x-display": display, title: 7, description: false }, "de"),
      ).toEqual({ label: "dataKey" })
    }
  })

  it("ignores x-display keys that are not strings instead of handing them to the translator", () => {
    const throwing = (key: string) => {
      if (typeof key !== "string") throw new TypeError("not a key")
      return deKeys(key)
    }
    const prop = { "x-display": { titleKey: 42, summaryKey: {}, title: "Daten" } }
    expect(propFieldText("dataKey", prop, "de", throwing)).toEqual({
      label: "Daten",
      hint: "dataKey",
    })
    expect(displayLabel({ titleKey: 7 as unknown as string }, "demo:raw", "de", throwing)).toEqual({
      label: "demo:raw",
    })
  })

  it("has no hint when the resolved label is the property name", () => {
    expect(propFieldText("boxed", { title: "boxed", description: "Card frame." }, "en")).toEqual({
      label: "boxed",
      help: "Card frame.",
    })
  })
})

describe("builderSnapshot + draftStatus", () => {
  const draft = initDraft({ rows: [{ row: [{ widget: "demo:a", span: 6 }] }] })
  const keys = [{ name: "demo:id", rawValue: "42" }]
  const steps = [{ id: "s", step: "demo:load" }]
  const base = builderSnapshot(draft, keys, steps)

  it("is the JSON of what Apply and Save hand on", () => {
    expect(JSON.parse(base)).toEqual({
      layout: { rows: [{ row: [{ widget: "demo:a", span: 6 }] }] },
      keys: { "demo:id": "42" },
      steps: [{ id: "s", step: "demo:load" }],
    })
  })

  it("ignores key and step rows the user has not filled in", () => {
    expect(
      builderSnapshot(
        draft,
        [...keys, { name: " ", rawValue: "x" }],
        [...steps, { id: "step-2", step: "  " }],
      ),
    ).toBe(base)
  })

  it("changes with the layout, a key value and a step", () => {
    const moved: DraftLayout = { kind: "rows", rows: [{ row: [{ widget: "demo:a", span: 4 }] }] }
    expect(builderSnapshot(moved, keys, steps)).not.toBe(base)
    expect(builderSnapshot(draft, [{ name: "demo:id", rawValue: "43" }], steps)).not.toBe(base)
    expect(builderSnapshot(draft, keys, [{ id: "s", step: "demo:other" }])).not.toBe(base)
  })

  it("is unchanged and saved before any edit", () => {
    expect(draftStatus(base, base, null)).toEqual({ changed: false, unsaved: false })
  })

  it("is changed and unsaved after an edit", () => {
    expect(draftStatus("edited", base, null)).toEqual({ changed: true, unsaved: true })
  })

  it("stays changed but no longer unsaved once that draft was saved as a dashboard", () => {
    expect(draftStatus("edited", base, "edited")).toEqual({ changed: true, unsaved: false })
  })

  it("is unsaved again after an edit past the saved dashboard", () => {
    expect(draftStatus("edited-more", base, "edited")).toEqual({ changed: true, unsaved: true })
  })

  it("going back to the pre-edit state after a save is unsaved (the dashboard differs)", () => {
    expect(draftStatus(base, base, "edited")).toEqual({ changed: false, unsaved: true })
  })
})

describe("toExitCommit", () => {
  it("hands on the layout, parsed keys, filled steps, the title and the wire context", () => {
    const live: PipelineContext = {
      keys: { "demo:id": "42" },
      steps: {
        s: { data: { n: 1 }, keys: { k: 1 }, _app: "demo", _step: "s", _dataType: "demo:t" },
      },
      errors: [{ stepId: "t", reason: "down" }],
    }
    expect(
      toExitCommit(
        initDraft({ tabs: [{ label: "A", rows: [{ row: [{ widget: "demo:a" }] }] }] }),
        [
          { name: "demo:id", rawValue: "42" },
          { name: "", rawValue: "x" },
        ],
        [
          { id: "s", step: "demo:load" },
          { id: "step-2", step: "" },
        ],
        "Ops",
        live,
      ),
    ).toEqual({
      layout: { tabs: [{ label: "A", rows: [{ row: [{ widget: "demo:a" }] }] }] },
      keys: { "demo:id": "42" },
      steps: [{ id: "s", step: "demo:load" }],
      title: "Ops",
      context: {
        keys: { "demo:id": "42" },
        stepIds: ["s"],
        stepData: { s: { data: { n: 1 }, keys: { k: 1 }, _app: "demo", _dataType: "demo:t" } },
        errors: [{ stepId: "t", reason: "down" }],
      },
    })
  })
})

describe("keyboard rename", () => {
  it("F2 renames any tab; Enter renames only the active one", () => {
    expect(tabTriggerKeyAction("F2", false)).toBe("rename")
    expect(tabTriggerKeyAction("F2", true)).toBe("rename")
    expect(tabTriggerKeyAction("Enter", true)).toBe("rename")
    expect(tabTriggerKeyAction("Enter", false)).toBeNull()
  })

  it("leaves every other key to the tabs", () => {
    for (const key of [" ", "ArrowRight", "Delete", "f2", "Escape"]) {
      expect(tabTriggerKeyAction(key, true)).toBeNull()
    }
  })

  it("commits on Enter, cancels on Escape, ignores the rest in the field", () => {
    expect(renameFieldKeyAction("Enter")).toBe("commit")
    expect(renameFieldKeyAction("Escape")).toBe("cancel")
    for (const key of ["a", "Tab", "F2", " "]) expect(renameFieldKeyAction(key)).toBeNull()
  })
})

describe("builder views", () => {
  it("shows the data sources only in advanced mode", () => {
    expect(builderViews(false)).toEqual(["layout", "preview"])
    expect(builderViews(true)).toEqual(["layout", "pipeline", "preview"])
  })

  it("keeps a still visible view and moves off the hidden data sources", () => {
    expect(viewAfterAdvancedToggle("preview", false)).toBe("preview")
    expect(viewAfterAdvancedToggle("layout", false)).toBe("layout")
    expect(viewAfterAdvancedToggle("pipeline", false)).toBe("layout")
    expect(viewAfterAdvancedToggle("pipeline", true)).toBe("pipeline")
    expect(viewAfterAdvancedToggle("preview", true)).toBe("preview")
  })
})
