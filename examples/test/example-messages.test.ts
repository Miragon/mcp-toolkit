import { describe, expect, it } from "vitest"
import { ORDER_CARD_TEXT, orderCardText } from "../host-portability/messages.js"
import {
  ARTICLES_TEXT,
  articlesText,
  formatPublished,
} from "../modules/articles/widgets/messages.js"
import {
  ORDERS_TEXT,
  formatDay,
  formatEuro,
  ordersText,
} from "../modules/orders/widgets/messages.js"
import { TASKS_TEXT, tasksText } from "../modules/tasks/widgets/messages.js"

/**
 * The reference widgets' en/de catalogs follow the same rules as the
 * toolkit's own catalog (`packages/ui/src/locale/toolkit-messages.test.ts`):
 * both languages have the same shape, every string keeps the house copy rules
 * (no dash as a connector, "…" never "...", AI not KI, "CIB seven"), German
 * speaks with du, English is in sentence case, and German is a translation,
 * not a copy. brand-lint reads no TypeScript strings; this does.
 */

const SAMPLE_ORDER = {
  id: "ORD-4471",
  customer: "Miravelo Leasing GmbH",
  status: "shipped" as const,
  total: 12480.5,
  currency: "EUR",
  items: 7,
  eta: "2026-06-12",
  trackingUrl: "https://tracking.example/ORD-4471",
}

/** Sample arguments for the function-valued messages, by key. */
const SAMPLES: Record<string, unknown[]> = {
  taskCount: [3, "3"],
  orderCount: [1, "1"],
  updatedAt: ["10:57"],
  addPrompt: ["show_tasks_board"],
  statusCellLabel: ["To do", "2"],
  shown: ["4"],
  completeTask: ["Draft the onboarding guide"],
  inTotal: ["4"],
  byline: ["Ada", "May 21, 2026"],
  askPrompt: [SAMPLE_ORDER, "Shipped", "Jun 12"],
}

const CATALOGS = {
  tasks: TASKS_TEXT,
  orders: ORDERS_TEXT,
  articles: ARTICLES_TEXT,
  "order card": ORDER_CARD_TEXT,
} as const

/** Every message of a catalog as `[path, rendered text]`, nested records flattened. */
function flatten(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]]
  if (typeof value === "function") {
    const key = path.split(".").pop() ?? ""
    const args = SAMPLES[key]
    if (!args) throw new Error(`No SAMPLES entry for the message function "${path}"`)
    return [[path, String((value as (...a: unknown[]) => unknown)(...args))]]
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => flatten(v, path ? `${path}.${k}` : k))
  }
  throw new Error(`Unexpected catalog value at "${path}"`)
}

/** The structure of a catalog: the same keys and value kinds, values left out. */
function shape(value: unknown): unknown {
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
  }
  return typeof value
}

/** Strings German shares with English on purpose (loanwords, names). */
const LOANWORDS = new Set(["Live", "Status"])

for (const [name, catalog] of Object.entries(CATALOGS)) {
  describe(`${name} catalog`, () => {
    it("ships en and de with the same keys and value kinds", () => {
      expect(shape(catalog.de)).toEqual(shape(catalog.en))
    })

    for (const locale of ["en", "de"] as const) {
      it(`${locale}: keeps the copy rules (no dash connector, "…", AI, CIB seven)`, () => {
        for (const [path, text] of flatten(catalog[locale])) {
          expect(text.trim(), path).toBe(text)
          expect(text.length, path).toBeGreaterThan(0)
          expect(text, path).not.toMatch(/—| – | - /)
          expect(text, path).not.toContain("...")
          expect(text, path).not.toMatch(/\bKI\b/)
          expect(text, path).not.toMatch(/CIB Seven|CIB SEVEN/)
        }
      })
    }

    it("de speaks with du, never Sie/Ihnen/Ihr or an impersonal 'man'", () => {
      for (const [path, text] of flatten(catalog.de)) {
        expect(text, path).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/)
        expect(text, path).not.toMatch(/\bman\b/)
      }
    })

    it("en is in sentence case: no two capitalised words in a row within a sentence", () => {
      const capitalised = (word: string) => /^[A-Z][a-z]/.test(word)
      for (const [path, text] of flatten(catalog.en)) {
        // Proper names in sample arguments are not the catalog's words.
        const words = text.replace(/Miravelo Leasing GmbH|ORD-\d+/g, "x").split(/\s+/)
        for (let i = 1; i < words.length; i++) {
          const prev = words[i - 1] ?? ""
          const word = words[i] ?? ""
          const pair = capitalised(prev) && !/[.!?:]$/.test(prev) && capitalised(word)
          expect(pair, `${path}: "${prev} ${word}"`).toBe(false)
        }
      }
    })

    it("de is a translation: only loanwords equal the English text", () => {
      const en = new Map(flatten(catalog.en))
      const same = flatten(catalog.de).filter(([path, text]) => en.get(path) === text)
      for (const [path, text] of same) expect(LOANWORDS.has(text), `${path}: "${text}"`).toBe(true)
    })
  })
}

describe("catalog choice by locale tag", () => {
  const pickers = [tasksText, ordersText, articlesText, orderCardText]

  it("picks German for any German tag and English for every other language", () => {
    for (const pick of pickers) {
      for (const tag of ["de", "de-DE", "de_AT", " DE-ch "]) expect(pick(tag)).toBe(pick("de"))
      for (const tag of ["en", "en-US", "fr-FR", "", "deu"]) expect(pick(tag)).toBe(pick("en"))
      expect(pick("de")).not.toBe(pick("en"))
    }
  })
})

describe("plurals pick the word for the count", () => {
  it("in both languages", () => {
    expect(TASKS_TEXT.en.taskCount(1, "1")).toBe("1 task")
    expect(TASKS_TEXT.en.taskCount(4, "4")).toBe("4 tasks")
    expect(TASKS_TEXT.de.taskCount(1, "1")).toBe("1 Aufgabe")
    expect(TASKS_TEXT.de.taskCount(0, "0")).toBe("0 Aufgaben")
    expect(ORDERS_TEXT.en.orderCount(1, "1")).toBe("1 order")
    expect(ORDERS_TEXT.de.orderCount(1234, "1.234")).toBe("1.234 Bestellungen")
  })
})

describe("example formatters", () => {
  it("format euro amounts in the widget's locale and fall back to English for a bad tag", () => {
    expect(formatEuro(199800, "en-US")).toBe("€1,998.00")
    // Intl puts a no-break space before the euro sign.
    expect(formatEuro(199800, "de-DE")).toBe("1.998,00\u00a0€")
    expect(formatEuro(8900, "not a tag")).toBe("€89.00")
  })

  it("format dates in the widget's locale and keep an unparsable value verbatim", () => {
    expect(formatDay("2026-06-03T09:30:00.000Z", "en-US")).toBe("Jun 3, 2026")
    expect(formatDay("2026-06-03T09:30:00.000Z", "de-DE")).toBe("03.06.2026")
    expect(formatDay("soon", "de-DE")).toBe("soon")
    expect(formatPublished("2026-05-21", "en-US")).toBe("May 21, 2026")
    expect(formatPublished("2026-05-21", "de-DE")).toBe("21.05.2026")
    expect(formatPublished("someday", "en-US")).toBe("someday")
  })
})
