import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { renderCodegen, toPascalCase, type CodegenConfig } from "./codegen.js"
import type { UpstreamToolDescriptor } from "./fetch-tools.js"

// Deterministic PRNG: a property failure in CI must replay identically on the
// next run, never appear as a fresh random draw (FITNESS.md phase 5c).
fc.configureGlobal({ seed: 42, numRuns: 100 })

describe("toPascalCase (property)", () => {
  // Bug class guarded: the generated type/hook names (BillingApiGetInvoiceInput,
  // useBillingApiGetInvoice, …) must be valid TS identifiers for every
  // well-formed tool name — a separator or lowercase leak here emits
  // uncompilable generated files.
  it("emits an identifier-safe PascalCase name for well-formed tool names", () => {
    const wellFormedName = fc.stringMatching(/^[a-z][a-z0-9]{0,5}([-_ ][a-z0-9]{1,6}){0,3}$/)
    fc.assert(
      fc.property(wellFormedName, (name) => {
        expect(toPascalCase(name)).toMatch(/^[A-Z][A-Za-z0-9]*$/)
      }),
    )
  })

  // Bug class guarded: separators surviving into an emitted identifier, and
  // non-fixpoint renaming (a second pass producing a different name) breaking
  // the build-time ↔ runtime naming contract across regenerations.
  it("strips every separator and is idempotent for arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const out = toPascalCase(input)
        expect(out).not.toMatch(/[-_\s]/)
        expect(toPascalCase(out)).toBe(out)
      }),
    )
  })

  it("pins the degenerate inputs to their ACTUAL (documented-by-test) output", () => {
    // Empty / separator-only names collapse to "" (the caller's problem, but a
    // deterministic one), and leading digits survive un-prefixed — so a
    // digits-first tool name yields a NON-identifier: callers own the
    // "tool names start with a letter" precondition.
    expect(toPascalCase("")).toBe("")
    expect(toPascalCase("-- __")).toBe("")
    expect(toPascalCase("42")).toBe("42")
    expect(toPascalCase("9-lives")).toBe("9Lives")
  })
})

describe("renderCodegen (property)", () => {
  const config: CodegenConfig = {
    proxyName: "billing-api",
    upstreamUrl: "https://billing.example/mcp",
    out: "out",
  }

  const toolNameArb = fc.stringMatching(/^[a-z][a-z0-9]{0,6}(-[a-z0-9]{1,6}){0,2}$/)
  const toolArb: fc.Arbitrary<UpstreamToolDescriptor> = toolNameArb.map((name) => ({
    name,
    inputSchema: { type: "object", properties: { id: { type: "string" } } },
  }))
  // tools/list names are unique per server — duplicates would make ordering
  // among equals unobservable and are not a real upstream shape.
  const toolsArb = fc.uniqueArray(toolArb, { maxLength: 4, selector: (tool) => tool.name })

  /** Deterministic Fisher–Yates driven by a fast-check-supplied seed. */
  function shuffle<T>(items: readonly T[], seed: number): T[] {
    const out = [...items]
    let state = seed + 1
    for (let i = out.length - 1; i > 0; i--) {
      state = (state * 48271) % 2147483647
      const j = state % (i + 1)
      const swap = out[i] as T
      out[i] = out[j] as T
      out[j] = swap
    }
    return out
  }

  // Bug class guarded: the committed generated files are byte-compared in CI
  // (generate --check, the codegen-drift test). Any upstream tools/list order
  // leaking into the rendered output would flap those gates on every
  // regeneration — this is the strongest form of the published determinism
  // contract, over arbitrary tool lists and arbitrary permutations.
  it("renders byte-identical output for every permutation of the tool list", async () => {
    await fc.assert(
      fc.asyncProperty(toolsArb, fc.nat(1000), async (tools, seed) => {
        const shuffled = shuffle(tools, seed)
        const fromOriginal = await renderCodegen(tools, config)
        const fromShuffled = await renderCodegen(shuffled, config)
        expect(fromShuffled.toolsFile).toBe(fromOriginal.toolsFile)
        expect(fromShuffled.hooksFile).toBe(fromOriginal.hooksFile)
        expect(fromShuffled.tools.map((tool) => tool.name)).toEqual(
          fromOriginal.tools.map((tool) => tool.name),
        )
      }),
      // json-schema-to-typescript runs per tool per render — keep the run
      // count modest so the suite stays fast; the seed keeps it deterministic.
      { numRuns: 25 },
    )
  })
})
