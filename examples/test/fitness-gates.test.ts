import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { depcruiseProbe, eslintProbe, runBin, withProbeFiles } from "./helpers/fitness-probe.js"
import { findUndescribedFields } from "./helpers/assert-described.js"

/**
 * Gate self-tests (FITNESS.md: "a gate that has never been red is
 * decoration"). Each case makes a fitness gate fail ON PURPOSE via a probe
 * file at its real location and asserts the gate reports the named rule —
 * so a config refactor that silently disarms a gate turns this suite red.
 *
 * Probe files use the git-ignored `__fitness-probe__` prefix and are removed
 * in `finally`, even when the assertion throws.
 */

const PROBE_TIMEOUT = 120_000

describe("dependency-cruiser source gates fire", () => {
  it(
    "core-no-mcp-use-value, core-no-node-builtins and no-unresolvable",
    { timeout: PROBE_TIMEOUT },
    async () => {
      const probe = "packages/core/src/__fitness-probe__core.ts"
      const { rules } = await withProbeFiles(
        {
          [probe]: [
            'import fs from "node:fs"',
            'import { MCPServer } from "mcp-use"',
            'import "mcp-use/server"',
            "export const probe = { fs, MCPServer }",
          ].join("\n"),
        },
        () => depcruiseProbe(".dependency-cruiser.cjs", [probe]),
      )
      expect(rules).toContain("core-no-mcp-use-value")
      expect(rules).toContain("core-no-node-builtins")
      expect(rules).toContain("no-unresolvable")
    },
  )

  it("no-cycles", { timeout: PROBE_TIMEOUT }, async () => {
    const a = "packages/core/src/__fitness-probe__cycle-a.ts"
    const b = "packages/core/src/__fitness-probe__cycle-b.ts"
    const { rules } = await withProbeFiles(
      {
        [a]: 'import { b } from "./__fitness-probe__cycle-b.js"\nexport const a: string = b',
        [b]: 'import { a } from "./__fitness-probe__cycle-a.js"\nexport const b: string = a',
      },
      () => depcruiseProbe(".dependency-cruiser.cjs", [a, b]),
    )
    expect(rules).toContain("no-cycles")
  })

  it(
    "core-must-not-import-ui (or unresolvable, without the dep)",
    { timeout: PROBE_TIMEOUT },
    async () => {
      // core does not declare ui as a dependency, so the probe import cannot
      // resolve and trips `no-unresolvable`; if someone DID add the dep, the
      // resolved path would trip `core-must-not-import-ui`. Red either way.
      const probe = "packages/core/src/__fitness-probe__ui-import.ts"
      const { rules } = await withProbeFiles(
        { [probe]: 'export { cn } from "@miragon/mcp-toolkit-ui"' },
        () => depcruiseProbe(".dependency-cruiser.cjs", [probe]),
      )
      expect(
        rules.some((r) => r === "core-must-not-import-ui" || r === "no-unresolvable"),
        `expected a red gate, got: ${rules.join(", ")}`,
      ).toBe(true)
    },
  )
})

describe("dependency-cruiser dist reachability gate fires", () => {
  it(
    "flags a transitive node builtin behind a dist barrel",
    { timeout: PROBE_TIMEOUT },
    async () => {
      // A stand-in dist barrel OUTSIDE the real packages: the rule matches any
      // path ending in dist/index.js, so a poisoned fixture proves the gate
      // without touching real build output.
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fitness-dist-"))
      try {
        const distDir = path.join(dir, "dist")
        await fs.mkdir(distDir)
        await fs.writeFile(path.join(distDir, "index.js"), 'import "./inner.js"\n')
        await fs.writeFile(
          path.join(distDir, "inner.js"),
          'import fs from "node:fs"\nexport const leak = fs\n',
        )
        const { rules } = await depcruiseProbe(".dependency-cruiser.dist.cjs", [
          path.join(distDir, "index.js"),
        ])
        expect(rules).toContain("root-barrel-must-not-reach-node-builtins")
      } finally {
        await fs.rm(dir, { recursive: true, force: true })
      }
    },
  )
})

describe("eslint boundary gates fire", () => {
  it("core must not value-import mcp-use", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "packages/core/src/__fitness-probe__eslint.ts"
    const { messages } = await withProbeFiles(
      { [probe]: 'import { MCPServer } from "mcp-use"\nexport const probe = { MCPServer }' },
      () => eslintProbe([probe]),
    )
    expect(messages.some((m) => m.message.includes("browser-bundle-safe"))).toBe(true)
  })

  it("core must not import ui (specifier rule)", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "packages/core/src/__fitness-probe__eslint-ui.ts"
    const { messages } = await withProbeFiles(
      { [probe]: 'export { cn } from "@miragon/mcp-toolkit-ui"' },
      () => eslintProbe([probe]),
    )
    expect(messages.some((m) => m.message.includes("bottom of the dependency graph"))).toBe(true)
  })

  it("ui must not import core/tools", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "packages/ui/src/__fitness-probe__eslint.ts"
    const { messages } = await withProbeFiles(
      {
        [probe]:
          'import { installToolkit } from "@miragon/mcp-toolkit-core/tools"\nexport const probe = { installToolkit }',
      },
      () => eslintProbe([probe]),
    )
    expect(messages.some((m) => m.message.includes("ui must never import core/tools"))).toBe(true)
  })

  it("examples must not value-import ModelContext", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "examples/host-portability/__fitness-probe__.tsx"
    const { messages } = await withProbeFiles(
      {
        [probe]:
          'import { ModelContext } from "mcp-use/react"\nexport const probe = { ModelContext }',
      },
      () => eslintProbe([probe]),
    )
    expect(messages.some((m) => m.message.includes("HostModelContext"))).toBe(true)
  })
})

describe("eslint widget-discipline gates fire", () => {
  it(
    "host access, content[0], palette colours, missing .js extension",
    { timeout: PROBE_TIMEOUT },
    async () => {
      const probe = "examples/modules/tasks/widgets/__fitness-probe__.tsx"
      const contents = [
        'import { boardSummary } from "../store"', // missing .js extension
        'import { useDisplayMode } from "mcp-use/react"', // banned host import
        "export function Probe(props: { result: { content: { text: string }[] } }) {",
        "  const raw = props.result.content[0].text", // banned manual decode
        "  const w = window as unknown as { openai?: { theme?: string } }",
        "  const theme = w.openai", // (typed detour; the raw pattern below is the gate)
        '  if (window.openai) console.warn("host")', // banned window.openai
        '  return <div className="bg-red-500 rounded-[10px]" style={{ color: "#ff0000" }}>',
        "    {raw} {String(theme)} {String(useDisplayMode)} {boardSummary.name}",
        "  </div>",
        "}",
      ].join("\n")
      const { messages } = await withProbeFiles({ [probe]: contents }, () => eslintProbe([probe]))
      const text = messages.map((m) => m.message).join("\n")
      expect(text).toContain("carry the compiled extension")
      expect(text).toContain("useHostBridge()")
      expect(text).toContain("window.openai")
      expect(text).toContain("content[0].text")
      expect(text).toContain("Hard-coded Tailwind palette")
      expect(text).toContain("Arbitrary radius")
    },
  )

  it("templates views are covered by the widget gates", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "templates/minimal-server/views/__fitness-probe__.tsx"
    const { code, messages } = await withProbeFiles(
      {
        [probe]:
          'export function Probe() {\n  return <span className="text-emerald-600">x</span>\n}',
      },
      () => eslintProbe([probe]),
    )
    expect(code).not.toBe(0)
    expect(messages.some((m) => m.message.includes("Hard-coded Tailwind palette"))).toBe(true)
  })

  it("hand-stamped _meta.ui keys are rejected", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "examples/modules/tasks/__fitness-probe__meta.ts"
    const { messages } = await withProbeFiles(
      {
        [probe]:
          'export const probe = { _meta: { "ui/resourceUri": "ui://x", ui: { visible: true } } }',
      },
      () => eslintProbe([probe]),
    )
    const hits = messages.filter((m) => m.message.includes("_meta.ui")).length
    expect(hits).toBeGreaterThanOrEqual(2)
  })
})

describe("templates lint wiring", () => {
  it("pnpm lint:templates lints the template sources", { timeout: PROBE_TIMEOUT }, async () => {
    // 10+ files today; a broken glob or a re-added global ignore would drop to 0.
    const { code, stdout } = await runBin("eslint", ["templates", "--format", "json"])
    expect(code).toBe(0)
    const results = JSON.parse(stdout) as unknown[]
    expect(results.length).toBeGreaterThanOrEqual(5)
  })
})

describe("tool-description gate helper", () => {
  it("reports dotted paths for undescribed fields, recursing into arrays", () => {
    const schema = {
      type: "object",
      properties: {
        described: { type: "string", description: "fine" },
        bare: { type: "string" },
        blank: { type: "string", description: "   " },
        nested: {
          type: "object",
          description: "outer",
          properties: { inner: { type: "number" } },
        },
        list: {
          type: "array",
          description: "rows",
          items: { type: "object", properties: { cell: { type: "string" } } },
        },
      },
    }
    expect(findUndescribedFields(schema)).toEqual(["bare", "blank", "nested.inner", "list[].cell"])
    expect(findUndescribedFields({ type: "object" })).toEqual([])
    expect(findUndescribedFields(undefined)).toEqual([])
  })
})

describe("ratchet metric budgets fire (phase 2)", () => {
  it("max-lines flags a 401-effective-line file", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "packages/core/src/__fitness-probe__long.ts"
    const body = Array.from({ length: 401 }, (_, i) => `export const line${i} = ${i}`).join("\n")
    const { messages } = await withProbeFiles({ [probe]: body }, () => eslintProbe([probe]))
    expect(messages.some((m) => m.ruleId === "max-lines")).toBe(true)
  })

  it("complexity flags a 16-branch function", { timeout: PROBE_TIMEOUT }, async () => {
    const probe = "packages/core/src/__fitness-probe__complex.ts"
    const branches = Array.from({ length: 16 }, (_, i) => `  if (n === ${i}) return ${i}`).join(
      "\n",
    )
    const body = `export function probe(n: number): number {\n${branches}\n  return -1\n}`
    const { messages } = await withProbeFiles({ [probe]: body }, () => eslintProbe([probe]))
    expect(messages.some((m) => m.ruleId === "complexity")).toBe(true)
  })
})

describe("knip dead-code gate fires (phase 4)", () => {
  it("flags an unreferenced file", { timeout: PROBE_TIMEOUT }, async () => {
    // Planted in a package source tree — the surface consumers actually get.
    const probe = "packages/core/src/__fitness-probe__dead.ts"
    const { code, stdout } = await withProbeFiles(
      { [probe]: "export const dead = true\n" },
      // --no-gitignore: the probe prefix is deliberately git-ignored, and
      // knip skips git-ignored files by default
      () => runBin("knip", ["--no-gitignore", "--include", "files,dependencies,unlisted"]),
    )
    expect(code).not.toBe(0)
    expect(stdout).toContain("__fitness-probe__dead.ts")
  })

  it("flags an unreferenced gate script too", { timeout: PROBE_TIMEOUT }, async () => {
    // scripts/ is only protected while knip.json lists its entries one by
    // one: an "entry": ["scripts/*.mjs"] glob makes every dead script an
    // entry and this probe goes unnoticed (measured — the gate then exits 0
    // on it). This case is what keeps the glob from coming back.
    const probe = "scripts/__fitness-probe__dead.mjs"
    const { code, stdout } = await withProbeFiles({ [probe]: "export const dead = true\n" }, () =>
      runBin("knip", ["--no-gitignore", "--include", "files,dependencies,unlisted"]),
    )
    expect(code).not.toBe(0)
    expect(stdout).toContain("__fitness-probe__dead.mjs")
  })
})

describe("anti-erosion lint gates fire (phase 5a)", () => {
  it(
    "flags .only, undescribed skip, and constant assertions",
    { timeout: PROBE_TIMEOUT },
    async () => {
      const probe = "examples/modules/tasks/__fitness-probe__anti.test.ts"
      const contents = [
        'import { describe, expect, it } from "vitest"',
        'describe.only("focused", () => {',
        '  it.skip("skipped without a reason", () => {})',
        '  it("constant assert", () => {',
        "    expect(true).toBe(true)",
        "  })",
        "})",
      ].join("\n")
      const { messages } = await withProbeFiles({ [probe]: contents }, () => eslintProbe([probe]))
      const rules = messages.map((m) => m.ruleId)
      expect(rules).toContain("vitest/no-focused-tests")
      expect(rules).toContain("vitest/no-disabled-tests")
      expect(messages.some((m) => m.message.includes("asserts a constant"))).toBe(true)
    },
  )

  it(
    "requires a reason on eslint-disable comments in tests",
    { timeout: PROBE_TIMEOUT },
    async () => {
      const probe = "examples/modules/tasks/__fitness-probe__disable.test.ts"
      const contents = [
        'import { expect, it } from "vitest"',
        'it("x", () => {',
        "  // eslint-disable-next-line no-console",
        '  console.log("hi")',
        "  expect(1 + 1).toBe(2)",
        "})",
      ].join("\n")
      const { messages } = await withProbeFiles({ [probe]: contents }, () => eslintProbe([probe]))
      expect(messages.some((m) => m.ruleId?.includes("require-description"))).toBe(true)
    },
  )
})

describe("test-erosion counter (phase 5a)", () => {
  it("counts it( and test( call sites only", async () => {
    const { countTestCases } = await import("../../scripts/check-test-erosion.mjs")
    expect(countTestCases('it("a", () => {})\ntest("b", () => {})')).toBe(2)
    expect(countTestCases('itIsNot("a")\nlatest("b")')).toBe(0)
    // crude line-level counter: a comment containing "it (" counts too —
    // acceptable, the gate compares totals of the SAME counter on both sides
    expect(countTestCases("// it (comment)")).toBe(1)
    expect(countTestCases("")).toBe(0)
  })
})

describe("flakiness gate grouping (phase 5c)", () => {
  it("groups changed test files by suite, package-relative", async () => {
    const { groupChangedTests } = await import("../../scripts/check-flakiness.mjs")
    expect(
      groupChangedTests([
        "packages/core/src/rest/client.test.ts",
        "packages/ui/src/lib/tone-utils.test.ts",
        "examples/test/smoke.test.ts",
        "packages/core/src/rest/client.ts", // not a test
        "docs/whatever.test.ts", // no suite
      ]),
    ).toEqual([
      { filter: "@miragon/mcp-toolkit-core", files: ["src/rest/client.test.ts"] },
      { filter: "@miragon/mcp-toolkit-ui", files: ["src/lib/tone-utils.test.ts"] },
      { filter: "@miragon/mcp-toolkit-examples", files: ["test/smoke.test.ts"] },
    ])
    expect(groupChangedTests([])).toEqual([])
  })
})
