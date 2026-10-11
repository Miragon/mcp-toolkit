import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * Design-system gate (CLAUDE.md "Design-System (verbindlich)"): UI code styles
 * through the ROLE tokens only. brand-lint sees neither Tailwind classes nor
 * oklch() nor TS strings, so this suite is the machine check:
 *
 * - no Tailwind palette utilities (`bg-emerald-500`, `text-amber-700`, …),
 *   no absolute black/white utilities (`bg-black/50`, `text-white`) and no
 *   named CSS colours in styles (`color: "red"`);
 * - no raw colours (hex, rgb(), hsl(), oklch(), …) outside the theme files;
 * - status is never text in its own colour: text takes the tone's `-ink`
 *   (`text-danger-ink`), links take `text-link` (not `text-primary`, which
 *   falls to 3.08:1 on the dark ground); text on a tint is the foreground,
 *   never the ink (`bg-danger-soft text-danger-ink`, CI §3.3);
 * - text is never translucent (`text-muted-foreground/70` drops below 4.5:1);
 * - a class string that switches to the accent/secondary surface switches the
 *   text to that surface's foreground (quiet text drops below 4.5:1 there in
 *   dark);
 * - never `outline-none` (forced-colors mode then shows no focus at all; use
 *   `outline-hidden`, as FOCUS_RING does);
 * - nothing below the type floor (CI §4 "klein", 13 px): no Tailwind
 *   `text-xs` (12 px) in any variant, no arbitrary `text-[…]` size under
 *   13 px / 0.8125 rem, no CSS `font-size` or React `fontSize` under 13 px —
 *   the scale is `text-title` … `text-small` (`MICRO_LABEL` for captions);
 * - no typed icon glyph (arrows, chevrons ‹ ›, check marks, crosses ×, stars,
 *   ⚠ ⚙ ⏱, geometric shapes, ⊞, emoji) in UI source (`.tsx`, `.css`, `.html`
 *   and the toolkit catalogs): function icons are Lucide (CI §11). Typographic
 *   marks stay allowed: "…", "·", "±", "≥", quotes.
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
const DESTRUCTIVE_TEXT = /\btext-destructive(?![-\w])/
const PRIMARY_TEXT = /\btext-primary(?![-\w])/
const TRANSLUCENT_TEXT = /\btext-(?!(?:xs|sm|base|lg|[0-9]?xl)\/)[a-z][a-z-]*\/\d{1,3}\b/
// Tailwind's absolute colours bypass the roles exactly like a palette class
// (the shadcn originals: `bg-black/50` overlay, `text-white` destructive).
const BLACK_WHITE =
  /\b(?:bg|text|border|ring|ring-offset|fill|stroke|from|via|to|outline|divide|shadow|decoration|caret|accent|placeholder)-(?:black|white)(?![-\w])/
// A named CSS colour as a style value (`color: "red"`, `background: white`).
const NAMED_COLOUR =
  /\b(?:color|background|background-color|backgroundColor|border-color|borderColor|fill|stroke|outline-color|outlineColor)\s*:\s*["']?(?:black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|navy|teal|maroon|silver|lime|aqua|fuchsia|olive)\b/
// CI §3.3: on a tint the text is the foreground; the ink is for plain surfaces.
const INK_ON_TINT =
  /\bbg-(success|warning|danger|info)-soft\b.*\btext-\1-ink\b|\btext-(success|warning|danger|info)-ink\b.*\bbg-\2-soft\b/
const OUTLINE_NONE = /\boutline-none\b/
/** The CI's smallest size (§4 "klein"); `TYPE_FLOOR_PX` in packages/ui/src/lib/typography.ts. */
const TYPE_FLOOR_PX = 13
const TEXT_XS = /(?<![\w-])text-xs(?![-\w])/
const ARBITRARY_SIZE = /\btext-\[(\d*\.?\d+)(px|rem)\]/g
const CSS_FONT_SIZE = /\bfont-size\s*:\s*(\d*\.?\d+)(px|rem)\b/g
const STYLE_FONT_SIZE = /\bfontSize\s*:\s*["'`]?(\d*\.?\d+)(px|rem)?\b/g
/**
 * Typed icon glyphs: the arrows blocks, single guillemets used as chevrons,
 * the multiplication sign as a close glyph, dingbats (✓ ✕ ✦), miscellaneous
 * symbols (⚠ ⚙ ★), technical symbols (⏱ ⏵), geometric shapes (▶ ◆ ▦), the
 * boxed operators (⊞ ⊡) and the emoji planes.
 */
const ICON_GLYPH =
  /[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2039\u203A\u00D7\u2700-\u27BF\u2600-\u26FF\u2300-\u23FF\u25A0-\u25FF\u2295-\u22A1\u2B00-\u2BFF]|[\u{1F300}-\u{1FAFF}]/u
/** Where a typed glyph would reach the screen: markup, styles and the toolkit's catalogs. */
const GLYPH_SCOPE = /\.(?:tsx|css|html)$|^packages\/ui\/src\/locale\/messages-[a-z]+\.ts$/

/** The px a CSS length stands for (rem at the 16 px default). */
const toPx = (value: string, unit: string | undefined) =>
  unit === "rem" ? Number(value) * 16 : Number(value)

/** The first font size on a line that falls below the floor, as written. */
function sizeBelowFloor(line: string): string | undefined {
  const xs = TEXT_XS.exec(line)
  if (xs) return xs[0]
  for (const re of [ARBITRARY_SIZE, CSS_FONT_SIZE, STYLE_FONT_SIZE]) {
    for (const m of line.matchAll(re)) {
      if (toPx(m[1] ?? "", m[2]) < TYPE_FLOOR_PX) return m[0]
    }
  }
  return undefined
}

/**
 * Files that still break a rule here, by rule — the builder's UX pass (T4
 * builder) took out the typed glyphs but predates the 13 px floor, so its
 * files keep 12 px text until a type pass. SHRINK-ONLY: fix a file and
 * remove its rule; a stale entry (the file is clean of that rule, or gone)
 * fails below.
 */
const RULE_EXEMPTIONS: Record<string, { rules: string[]; reason: string }> = {
  "packages/ui/src/app/builder/BuilderBanners.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px)",
  },
  "packages/ui/src/app/builder/CanvasRow.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px)",
  },
  "packages/ui/src/app/builder/CatalogueSheet.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px): 12 px ids and step contracts",
  },
  "packages/ui/src/app/builder/LayoutSurface.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px)",
  },
  "packages/ui/src/app/builder/PipelineStrip.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px): 12 px step chips",
  },
  "packages/ui/src/app/builder/Toolbar.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px)",
  },
  "packages/ui/src/app/builder/Workspace.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px): 12 px palette ids and hints",
  },
  "packages/ui/src/app/layout-builder.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px)",
  },
  "packages/ui/src/app/widget-props-sheet.tsx": {
    rules: ["text-below-floor"],
    reason: "13 px floor pending (the T4 builder pass kept 12 px)",
  },
}
/** A surface utility (with its variant prefix) whose text must switch with it. */
const LIFTED_SURFACE = /((?:[\w&>*[\]=.()/@-]+:)*)bg-(accent|secondary)(?:\/\d{1,3})?(?![-\w])/g
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")

/** The string literals on one source line (class strings live in them). */
function stringLiterals(line: string): string[] {
  return [...line.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  )
}

/**
 * The first class string that puts a lifted surface (`bg-accent`,
 * `hover:bg-secondary`, …) without the surface's own text colour under the
 * same variant (or unprefixed): quiet text on those dark lifts is 3.66:1.
 */
function surfaceWithoutItsText(line: string): string | undefined {
  for (const literal of stringLiterals(line)) {
    for (const m of literal.matchAll(LIFTED_SURFACE)) {
      const [whole, prefix = "", surface] = m
      const text = `text-${surface}-foreground`
      const own = new RegExp(`(?:^|\\s)${escapeRegExp(prefix)}${text}(?![-\\w])`)
      const base = new RegExp(`(?:^|\\s)${text}(?![-\\w])`)
      if (!own.test(literal) && !base.test(literal)) return whole
    }
  }
  return undefined
}

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
    check("black-white-utility", BLACK_WHITE, !themeFile)
    check("named-colour", NAMED_COLOUR, !themeFile)
    check("raw-hex", RAW_HEX, !themeFile)
    check("raw-colour-function", RAW_COLOUR_FN, !themeFile)
    check("status-as-text", STATUS_TEXT, !toneModule)
    check("ink-on-tint", INK_ON_TINT, true)
    check("destructive-as-text", DESTRUCTIVE_TEXT, true)
    check("primary-as-text", PRIMARY_TEXT, true)
    check("translucent-text", TRANSLUCENT_TEXT, true)
    check("outline-none", OUTLINE_NONE, true)
    check("icon-glyph", ICON_GLYPH, GLYPH_SCOPE.test(file))
    const small = sizeBelowFloor(text)
    if (small) findings.push({ file, line: idx + 1, rule: "text-below-floor", match: small })
    const surface = surfaceWithoutItsText(text)
    if (surface) {
      findings.push({ file, line: idx + 1, rule: "surface-without-its-text", match: surface })
    }
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

  const allFindings = () =>
    files.flatMap((file) => scanSource(file, fs.readFileSync(path.join(REPO_ROOT, file), "utf8")))
  const exempt = (f: Finding) => RULE_EXEMPTIONS[f.file]?.rules.includes(f.rule) ?? false

  it("finds no palette utility, raw colour, status-as-text, text below 13 px or typed glyph", () => {
    expect(
      allFindings()
        .filter((f) => !exempt(f))
        .map((f) => `${f.file}:${f.line} ${f.rule} "${f.match}"`),
      "Use the role tokens: bg-primary, text-link, border-input, ring-focus, " +
        "the tone maps (TONE_SOFT/TONE_INK/TONE_DOT/TONE_BORDER/TONE_ICON) — " +
        "colour values live only in the theme files. Type: the scale text-title … " +
        "text-small (13 px floor, MICRO_LABEL for captions). Icons: Lucide, never a typed glyph.",
    ).toEqual([])
  })

  it("keeps the rule exemptions free of stale entries (shrink-only)", () => {
    const findings = allFindings()
    for (const [file, { rules, reason }] of Object.entries(RULE_EXEMPTIONS)) {
      expect(reason, file).toBeTruthy()
      expect(fs.existsSync(path.join(REPO_ROOT, file)), file).toBe(true)
      for (const rule of rules) {
        expect(
          findings.some((f) => f.file === file && f.rule === rule),
          `${file} no longer breaks "${rule}" — remove it from RULE_EXEMPTIONS`,
        ).toBe(true)
      }
    }
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
      rulesOf(
        '"text-danger-ink text-primary-foreground text-destructive-foreground bg-success border-warning text-link"',
      ),
    ).toEqual([])
  })

  it("allows a raw status colour only on icons or in the tone module (TONE_ICON)", () => {
    expect(rulesOf('"text-success"', TONE_MODULE)).toEqual([])
    expect(rulesOf('"[&>svg]:text-danger [&_svg]:text-warning"')).toEqual([])
  })

  it("flags Tailwind's absolute black/white and named CSS colours, not role utilities", () => {
    expect(rulesOf('"bg-black/50 fixed inset-0"')).toContain("black-white-utility")
    expect(rulesOf('"bg-destructive text-white hover:bg-destructive/90"')).toContain(
      "black-white-utility",
    )
    expect(rulesOf('"ring-offset-white dark:bg-white"')).toContain("black-white-utility")
    expect(rulesOf('style={{ color: "red" }}')).toContain("named-colour")
    expect(rulesOf("  background: white;")).toContain("named-colour")
    expect(
      rulesOf('"bg-scrim text-destructive-foreground bg-background whitespace-nowrap"'),
    ).toEqual([])
    expect(rulesOf('style={{ color: "inherit", fill: "currentColor" }}')).toEqual([])
  })

  it("flags the ink on a tint (text on -soft is the foreground, CI §3.3)", () => {
    expect(rulesOf('"bg-danger-soft text-danger-ink border-danger"')).toContain("ink-on-tint")
    expect(rulesOf('"text-info-ink rounded bg-info-soft"')).toContain("ink-on-tint")
    expect(rulesOf('"bg-danger-soft text-foreground"')).toEqual([])
    expect(rulesOf('<p className="text-danger-ink">')).toEqual([])
  })

  it("flags outline-none (no focus at all in forced-colors mode), not outline-hidden", () => {
    expect(rulesOf('"outline-none focus-visible:ring-2"')).toContain("outline-none")
    expect(rulesOf('"focus-visible:outline-none"')).toContain("outline-none")
    expect(rulesOf('"outline-hidden focus-visible:ring-2 focus-visible:ring-focus"')).toEqual([])
  })

  it("flags a lifted surface whose class string keeps quiet text (accent/secondary)", () => {
    expect(rulesOf('"hover:bg-accent text-muted-foreground"')).toContain("surface-without-its-text")
    expect(rulesOf('"bg-accent font-medium"')).toContain("surface-without-its-text")
    expect(rulesOf('"data-[state=on]:bg-secondary/80"')).toContain("surface-without-its-text")
    expect(rulesOf('"hover:bg-accent hover:text-accent-foreground"')).toEqual([])
    expect(rulesOf('"bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80"')).toEqual(
      [],
    )
    expect(
      rulesOf('(active ? "bg-accent text-accent-foreground" : "text-muted-foreground")'),
    ).toEqual([])
    expect(rulesOf('"hover:bg-muted text-muted-foreground"')).toEqual([])
  })

  it("flags translucent text but not font-size/line-height shorthands", () => {
    expect(rulesOf('"text-muted-foreground/70"')).toContain("translucent-text")
    expect(rulesOf('"text-foreground/60 hover:text-foreground"')).toContain("translucent-text")
    expect(rulesOf('"text-sm/6 text-2xl/tight"')).toEqual([])
  })

  it("flags text below the 13 px floor: text-xs, small arbitrary sizes, CSS and style sizes", () => {
    expect(rulesOf('"text-xs font-medium"')).toContain("text-below-floor")
    expect(rulesOf('cn("sm:text-xs")')).toContain("text-below-floor")
    expect(rulesOf('"text-xs/5"')).toContain("text-below-floor")
    expect(rulesOf('"text-[11px] uppercase"')).toContain("text-below-floor")
    expect(rulesOf('"text-[0.75rem]"')).toContain("text-below-floor")
    expect(rulesOf("  font-size: 12px;")).toContain("text-below-floor")
    expect(rulesOf("style={{ fontSize: 11 }}")).toContain("text-below-floor")
    expect(rulesOf('style={{ fontSize: "10px" }}')).toContain("text-below-floor")
    expect(
      rulesOf(
        '"text-small text-dense text-sm text-[13px] text-[0.8125rem] max-w-xs text-xsmall" fontSize: 13 font-size: 1rem',
      ),
    ).toEqual([])
  })

  it("flags typed icon glyphs in markup and catalogs, not typographic marks or other files", () => {
    const glyphs = ["→", "←", "↗", "›", "‹", "×", "✓", "✕", "✦", "⚠", "⚙", "⏱", "▶", "◆", "⊞"]
    for (const glyph of [...glyphs, "↻", "⟳", "★", "🚀"]) {
      expect(rulesOf(`<span>${glyph}</span>`), glyph).toContain("icon-glyph")
    }
    expect(rulesOf('loadMore: "Load more →",', "packages/ui/src/locale/messages-en.ts")).toContain(
      "icon-glyph",
    )
    expect(rulesOf('<p>Loading… · ±0 · ≥3 · „Ops“ · "x"</p>')).toEqual([])
    // Server code and plain .ts helpers (tool descriptions for the model) are out of scope.
    expect(rulesOf('description: "a → b",', "packages/core/src/tools/x.ts")).toEqual([])
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
