import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * Design-system gate (CLAUDE.md "Design-System (verbindlich)"): UI code styles
 * through the ROLE tokens only. brand-lint sees neither Tailwind classes nor
 * oklch() nor TS strings, so this suite is the machine check:
 *
 * - no Tailwind palette utilities (`bg-emerald-500`, `text-amber-700`, …);
 * - no raw colours (hex, rgb(), hsl(), oklch(), …) outside the theme files;
 * - status is never text in its own colour: text takes the tone's `-ink`
 *   (`text-danger-ink`), links take `text-link` (not `text-primary`, which
 *   falls to 3.08:1 on the dark ground);
 * - text is never translucent (`text-muted-foreground/70` drops below 4.5:1).
 *
 * Scope: every source file of the published packages, the examples and the
 * starter template (tests excluded — they assert on colour literals as data).
 */

const SCAN_ROOTS = [
  "packages/ui/src",
  "packages/core/src",
  "packages/tool-codegen/src",
  "examples",
  "templates",
]
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".html"])
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "reports",
  ".mcp-use",
  ".stryker-tmp",
  "test", // examples/test: fitness suites with deliberate probe strings
])

/**
 * The theme files — the only places colour VALUES may live. Shrink-only:
 * every entry needs a reason, and a stale entry fails below.
 */
const THEME_FILES: Record<string, string> = {
  "packages/ui/src/theme/cd-tokens.generated.css":
    "the vendored Miragon corporate-design tokens (the source of every colour)",
  "packages/ui/src/theme/cd-tokens.ts": "the TS mirror of the vendored tokens (drift-tested)",
  "packages/ui/src/theme/presets.ts":
    "white-label preset values — a brand's colours are data, authored in oklch",
  "examples/widget-playground/CustomerCard.tsx":
    "the documented dependency-free counter-example (inline hex styles are its point)",
}

/** Where raw status/primary text and translucent text are allowed (the tone module itself). */
const TONE_MODULE = "packages/ui/src/lib/tone-utils.ts"

const PALETTE =
  /\b(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const RAW_HEX = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/
const RAW_COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/
// A status colour on an icon (`[&>svg]:text-danger`, SVG currentColor) is the
// colour role, not text — only bare text utilities are flagged.
const STATUS_TEXT = /(?<!svg\]:)\btext-(?:success|warning|danger|info)(?![-\w])/
const DESTRUCTIVE_TEXT = /\btext-destructive\b/
const PRIMARY_TEXT = /\btext-primary(?![-\w])/
const TRANSLUCENT_TEXT = /\btext-(?!(?:xs|sm|base|lg|[0-9]?xl)\/)[a-z][a-z-]*\/\d{1,3}\b/

interface Finding {
  file: string
  line: number
  rule: string
  match: string
}

/** Comments are prose, not styling: blank them out but keep line numbers. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_all, lead: string) => lead)
}

/** Every design-system violation in one file's source. */
function scanSource(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  const themeFile = file in THEME_FILES
  const toneModule = file === TONE_MODULE
  const lines = stripComments(source).split("\n")
  lines.forEach((text, idx) => {
    const check = (rule: string, re: RegExp, applies: boolean) => {
      if (!applies) return
      const hit = re.exec(text)
      if (hit) findings.push({ file, line: idx + 1, rule, match: hit[0] })
    }
    check("palette-utility", PALETTE, !themeFile)
    check("raw-hex", RAW_HEX, !themeFile)
    check("raw-colour-function", RAW_COLOUR_FN, !themeFile)
    check("status-as-text", STATUS_TEXT, !toneModule)
    check("destructive-as-text", DESTRUCTIVE_TEXT, true)
    check("primary-as-text", PRIMARY_TEXT, true)
    check("translucent-text", TRANSLUCENT_TEXT, true)
  })
  return findings
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(rel)
      } else if (
        SCAN_EXTENSIONS.has(path.extname(entry.name)) &&
        !/\.test\.tsx?$/.test(entry.name) &&
        !entry.name.startsWith("__fitness-probe__")
      ) {
        out.push(rel)
      }
    }
  }
  for (const root of SCAN_ROOTS) walk(root)
  return out.sort()
}

describe("design-system gate (role tokens only)", () => {
  const files = sourceFiles()

  it("scans the real source tree (the walker is alive)", () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files).toContain("packages/ui/src/primitives/button.tsx")
    expect(files).toContain("packages/ui/src/theme.css")
    expect(files).toContain("templates/minimal-server/views/shared/styles.css")
  })

  it("finds no palette utility, raw colour, status-as-text or translucent text", () => {
    const findings = files.flatMap((file) =>
      scanSource(file, fs.readFileSync(path.join(REPO_ROOT, file), "utf8")),
    )
    expect(
      findings.map((f) => `${f.file}:${f.line} ${f.rule} "${f.match}"`),
      "Use the role tokens: bg-primary, text-link, border-input, ring-focus, " +
        "the tone maps (TONE_SOFT/TONE_TEXT/TONE_DOT/TONE_BORDER/TONE_ICON) — " +
        "colour values live only in the theme files.",
    ).toEqual([])
  })

  it("keeps the theme-file allowlist free of stale entries", () => {
    for (const file of Object.keys(THEME_FILES)) {
      expect(fs.existsSync(path.join(REPO_ROOT, file)), file).toBe(true)
    }
    expect(fs.existsSync(path.join(REPO_ROOT, TONE_MODULE))).toBe(true)
  })
})

// The self-tests feed the scanner off-palette colours on purpose.
/* brand-lint-disable */
describe("design-system gate fires (self-test — a gate never red is decoration)", () => {
  const rulesOf = (source: string, file = "packages/ui/src/components/Probe.tsx") =>
    scanSource(file, source).map((f) => f.rule)

  it("flags Tailwind palette utilities in any variant", () => {
    expect(rulesOf('<span className="bg-emerald-500" />')).toContain("palette-utility")
    expect(rulesOf('cn("dark:text-amber-400")')).toContain("palette-utility")
    expect(rulesOf('"border-slate-50/30"')).toContain("palette-utility")
  })

  it("flags raw hex and colour functions, but not issue refs or entities", () => {
    expect(rulesOf('style={{ color: "#ff0000" }}')).toContain("raw-hex")
    expect(rulesOf("--x: #FFF;")).toContain("raw-hex")
    expect(rulesOf('background: "rgba(0, 0, 0, 0.5)"')).toContain("raw-colour-function")
    expect(rulesOf("--primary: oklch(0.5 0.2 264);")).toContain("raw-colour-function")
    expect(rulesOf("see mcp-toolkit#178 and &#123;")).toEqual([])
  })

  it("flags status, destructive and primary as text colours — not their -ink/-foreground roles", () => {
    expect(rulesOf('"text-success"')).toContain("status-as-text")
    expect(rulesOf('"hover:text-danger font-medium"')).toContain("status-as-text")
    expect(rulesOf('"text-destructive"')).toContain("destructive-as-text")
    expect(rulesOf('"text-primary underline"')).toContain("primary-as-text")
    expect(
      rulesOf('"text-danger-ink text-primary-foreground bg-success border-warning text-link"'),
    ).toEqual([])
  })

  it("allows a raw status colour only on icons or in the tone module (TONE_ICON)", () => {
    expect(rulesOf('"text-success"', TONE_MODULE)).toEqual([])
    expect(rulesOf('"[&>svg]:text-danger [&_svg]:text-warning"')).toEqual([])
  })

  it("flags translucent text but not font-size/line-height shorthands", () => {
    expect(rulesOf('"text-muted-foreground/70"')).toContain("translucent-text")
    expect(rulesOf('"text-foreground/60 hover:text-foreground"')).toContain("translucent-text")
    expect(rulesOf('"text-sm/6 text-2xl/tight"')).toEqual([])
  })

  it("lets colour values through only in the theme files", () => {
    const file = "packages/ui/src/theme/cd-tokens.ts"
    expect(rulesOf('blau: "#335DE5",', file)).toEqual([])
    expect(rulesOf('primary: "oklch(0.52 0.21 264)",', "packages/ui/src/theme/presets.ts")).toEqual(
      [],
    )
  })

  it("ignores comments but keeps URLs and line numbers intact", () => {
    expect(rulesOf("/* bg-red-500 was here */\n// text-amber-600 too")).toEqual([])
    const findings = scanSource("x.tsx", '/*\n*/\nconst u = "https://x.dev"; const c = "#abcdef"')
    expect(findings).toEqual([{ file: "x.tsx", line: 3, rule: "raw-hex", match: "#abcdef" }])
  })
})
/* brand-lint-enable */
