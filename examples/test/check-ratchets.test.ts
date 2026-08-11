import { describe, expect, it } from "vitest"
import { compareRatchets } from "../../scripts/check-ratchets.mjs"

/**
 * Negative tests for the phase-2b ratchet self-protection: every forbidden
 * direction must produce a violation, every allowed one must not. The CLI
 * wrapper (merge-base resolution, trailer escape) is exercised manually and
 * in CI; the direction policy lives in this pure function.
 */

describe("coverage-thresholds policy (raise-only)", () => {
  const oldJson = { core: { statements: 91, branches: 86 } }

  it("flags a lowered floor", () => {
    const violations = compareRatchets("ratchets/coverage-thresholds.json", oldJson, {
      core: { statements: 88, branches: 86 },
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("core.statements: 91 -> 88")
    expect(violations[0]).toContain("raise-only")
  })

  it("accepts a raised floor", () => {
    expect(
      compareRatchets("ratchets/coverage-thresholds.json", oldJson, {
        core: { statements: 95, branches: 86 },
      }),
    ).toEqual([])
  })

  it("flags a removed metric and a removed package", () => {
    expect(
      compareRatchets("ratchets/coverage-thresholds.json", oldJson, { core: { branches: 86 } }),
    ).toHaveLength(1)
    expect(compareRatchets("ratchets/coverage-thresholds.json", oldJson, {})).toHaveLength(1)
  })

  it("ignores the $comment key", () => {
    expect(
      compareRatchets(
        "ratchets/coverage-thresholds.json",
        { $comment: "a", ...oldJson },
        { $comment: "b", ...oldJson },
      ),
    ).toEqual([])
  })
})

describe("eslint-ratchets policy (shrink-only debt)", () => {
  const oldJson = { "max-lines": { "a.ts": 500 }, complexity: { "b.ts": 20 } }

  it("flags a new entry", () => {
    const violations = compareRatchets("ratchets/eslint-ratchets.json", oldJson, {
      "max-lines": { "a.ts": 500, "c.ts": 410 },
      complexity: { "b.ts": 20 },
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('new max-lines entry "c.ts"')
  })

  it("flags a raised entry", () => {
    const violations = compareRatchets("ratchets/eslint-ratchets.json", oldJson, {
      "max-lines": { "a.ts": 510 },
      complexity: { "b.ts": 20 },
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('"a.ts": 500 -> 510')
  })

  it("accepts lowering and removal", () => {
    expect(
      compareRatchets("ratchets/eslint-ratchets.json", oldJson, {
        "max-lines": { "a.ts": 450 },
        complexity: {},
      }),
    ).toEqual([])
  })
})

describe("stryker policy (break raise-only, mutate grow-only)", () => {
  const oldJson = { mutate: ["src/a.ts", "src/b.ts"], thresholds: { break: 60 } }

  it("flags a lowered break", () => {
    const violations = compareRatchets("packages/core/stryker.config.json", oldJson, {
      mutate: ["src/a.ts", "src/b.ts"],
      thresholds: { break: 50 },
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("60 -> 50")
  })

  it("flags a shrunken mutate allowlist without a break raise", () => {
    const violations = compareRatchets("packages/core/stryker.config.json", oldJson, {
      mutate: ["src/a.ts"],
      thresholds: { break: 60 },
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("measuring less")
  })

  it("accepts shrinking the allowlist together with a break raise", () => {
    expect(
      compareRatchets("packages/core/stryker.config.json", oldJson, {
        mutate: ["src/a.ts"],
        thresholds: { break: 70 },
      }),
    ).toEqual([])
  })

  it("accepts growing the allowlist", () => {
    expect(
      compareRatchets("packages/core/stryker.config.json", oldJson, {
        mutate: ["src/a.ts", "src/b.ts", "src/c.ts"],
        thresholds: { break: 60 },
      }),
    ).toEqual([])
  })

  it("treats config deletion as a violation", () => {
    expect(compareRatchets("packages/core/stryker.config.json", oldJson, null)).not.toEqual([])
  })
})

describe("knip policy (ignore lists shrink-only)", () => {
  const oldJson = {
    ignore: ["legacy.ts"],
    workspaces: { "packages/ui": { ignoreDependencies: ["left-pad"] } },
  }

  it("flags a grown top-level ignore list", () => {
    const violations = compareRatchets("knip.json", oldJson, {
      ...oldJson,
      ignore: ["legacy.ts", "new-dead.ts"],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("new-dead.ts")
  })

  it("flags a grown nested workspace ignore list", () => {
    const violations = compareRatchets("knip.json", oldJson, {
      ignore: ["legacy.ts"],
      workspaces: { "packages/ui": { ignoreDependencies: ["left-pad", "right-pad"] } },
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("right-pad")
  })

  it("accepts shrinking", () => {
    expect(
      compareRatchets("knip.json", oldJson, {
        ignore: [],
        workspaces: { "packages/ui": { ignoreDependencies: [] } },
      }),
    ).toEqual([])
  })
})

describe("ui-catalog allowlist policy (shrink-only)", () => {
  const rel = "packages/ui/ui-catalog.allowlist.json"
  const oldJson = {
    allow: [{ export: "DialogPortal", reason: "primitive sub-part below catalog granularity" }],
  }

  it("flags a new exemption", () => {
    const violations = compareRatchets(rel, oldJson, {
      allow: [...oldJson.allow, { export: "NewThing", reason: "no time to catalogue" }],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('new allowlist entry "NewThing"')
  })

  it("accepts removal (catalogued or un-exported)", () => {
    expect(compareRatchets(rel, oldJson, { allow: [] })).toEqual([])
  })

  it("accepts a reworded reason for an existing entry", () => {
    expect(
      compareRatchets(rel, oldJson, { allow: [{ export: "DialogPortal", reason: "clearer why" }] }),
    ).toEqual([])
  })
})

describe("introduction is allowed", () => {
  it("a file absent on the base branch produces no violations", () => {
    expect(
      compareRatchets("ratchets/coverage-thresholds.json", null, { core: { lines: 1 } }),
    ).toEqual([])
    expect(compareRatchets("packages/core/stryker.config.json", undefined, { mutate: [] })).toEqual(
      [],
    )
  })
})

describe("stryker negated-glob direction (found by the phase-5b false positive)", () => {
  const oldJson = { mutate: ["src/*.ts", "!src/untested.ts"], thresholds: { break: 60 } }

  it("removing a negation GROWS the surface — allowed without a break raise", () => {
    expect(
      compareRatchets("packages/core/stryker.config.json", oldJson, {
        mutate: ["src/*.ts"],
        thresholds: { break: 60 },
      }),
    ).toEqual([])
  })

  it("adding a negation SHRINKS the surface — violation without a break raise", () => {
    const violations = compareRatchets("packages/core/stryker.config.json", oldJson, {
      mutate: ["src/*.ts", "!src/untested.ts", "!src/also-out.ts"],
      thresholds: { break: 60 },
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("!src/also-out.ts")
  })

  it("adding a positive glob grows — allowed", () => {
    expect(
      compareRatchets("packages/core/stryker.config.json", oldJson, {
        mutate: ["src/*.ts", "!src/untested.ts", "src/extra/*.ts"],
        thresholds: { break: 60 },
      }),
    ).toEqual([])
  })
})

describe("render-allowlist policy (shrink-only)", () => {
  const oldJson = { components: [{ name: "Dialog", reason: "portal cannot SSR" }] }

  it("flags a new entry", () => {
    const violations = compareRatchets("ratchets/render-allowlist.json", oldJson, {
      components: [
        { name: "Dialog", reason: "portal cannot SSR" },
        { name: "Table", reason: "lazy" },
      ],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('"Table"')
    expect(violations[0]).toContain("RENDER_CASES")
  })

  it("accepts shrinking and introduction", () => {
    expect(compareRatchets("ratchets/render-allowlist.json", oldJson, { components: [] })).toEqual(
      [],
    )
    expect(
      compareRatchets("ratchets/render-allowlist.json", null, {
        components: [{ name: "X", reason: "r" }],
      }),
    ).toEqual([])
  })
})
