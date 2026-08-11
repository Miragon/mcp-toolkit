import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { ZodError } from "zod"
import { layoutInputSchema, layoutSchema } from "./layout-schemas.js"
import { normalizeLayout, type LayoutConfig } from "./layout-types.js"

// Deterministic PRNG: a property failure in CI must replay identically on the
// next run, never appear as a fresh random draw (FITNESS.md phase 5c).
fc.configureGlobal({ seed: 42, numRuns: 100 })

// Arbitrary VALID layouts covering all three accepted forms (flat rows array,
// { rows }, { tabs }) with widget/span/props cells. Prop values stay
// JSON-representable so the JSON-string-branch equivalence below is exact.
const propValueArb = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))
const cellArb = fc.record(
  {
    widget: fc.string(),
    span: fc.integer({ min: 1, max: 12 }),
    props: fc.dictionary(
      fc.constantFrom("period", "engine", "processDefinitionKey", "limit"),
      propValueArb,
      { maxKeys: 3 },
    ),
  },
  { requiredKeys: ["widget"] },
)
const rowArb = fc.record({ row: fc.array(cellArb, { maxLength: 3 }) })
const rowsArb = fc.array(rowArb, { maxLength: 3 })
const layoutArb: fc.Arbitrary<LayoutConfig> = fc.oneof(
  rowsArb,
  fc.record({ rows: rowsArb }),
  fc.record({
    tabs: fc.array(fc.record({ label: fc.string(), rows: rowsArb }), { maxLength: 2 }),
  }),
)

describe("normalizeLayout (property)", () => {
  // Bug class guarded: a second normalization pass re-wrapping an already
  // canonical layout (e.g. { rows: { rows: … } }) would corrupt every stored
  // dashboard on re-save — idempotence pins the canonical form as a fixpoint.
  it("is idempotent across all three layout forms", () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const once = normalizeLayout(layout)
        expect(normalizeLayout(once)).toEqual(once)
      }),
    )
  })
})

describe("layoutInputSchema (property)", () => {
  // Bug class guarded: some MCP hosts (observed with claude.ai) serialize the
  // layout argument as a JSON STRING. If the string branch ever drifts from
  // the object branches, every render-view call from such a host breaks while
  // object-form tests stay green — this pins branch equivalence exactly.
  it("parses the JSON-string form identically to the object form", () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const fromObject: unknown = layoutInputSchema.parse(layout)
        const fromString: unknown = layoutInputSchema.parse(JSON.stringify(layout))
        expect(fromString).toEqual(fromObject)
      }),
    )
  })

  // Bug class guarded: junk from a hallucinating model must fail as a ZodError
  // (surfaced to the agent as a tool-input error) — never hang, never yield
  // undefined, never escape as a non-Zod crash into the tool handler.
  it("on arbitrary junk either parses (string branch) or throws a ZodError", () => {
    fc.assert(
      fc.property(
        fc.anything().filter((junk) => !layoutSchema.safeParse(junk).success),
        (junk) => {
          try {
            // A string of valid layout JSON may legitimately parse — but never
            // to undefined (JSON.parse cannot produce it).
            expect(layoutInputSchema.parse(junk)).not.toBeUndefined()
          } catch (err) {
            expect(err).toBeInstanceOf(ZodError)
          }
        },
      ),
    )
  })
})
