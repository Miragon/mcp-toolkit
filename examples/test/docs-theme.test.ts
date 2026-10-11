import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  compareSpecificity,
  maxSpecificity,
  rootCascade,
  simpleSelectors,
  specificity,
  splitSelectors,
  subjectCompound,
  type Specificity,
} from "./helpers/css-cascade.js"
import {
  contrast,
  createColourResolver,
  cssBlocks,
  layer,
  over,
  type CssBlock,
  type Decls,
} from "./helpers/css-colour.js"
import { REPO_ROOT } from "./helpers/fitness-probe.js"

/**
 * The docs site's Miragon theme (`docs/.vitepress/theme`), held to the CI the
 * same way the UI package's theme is:
 *
 * - the vendored token file is the UI package's copy byte for byte (which
 *   `packages/ui/src/theme/cd-tokens.test.ts` pins to the skill's file), so
 *   a CI bump that re-vendors one copy and forgets the other fails here;
 * - the wordmarks and the Komet are the CI's files, unchanged;
 * - the mapping (`custom.css`) holds no colour of its own (in light not even
 *   a mixed grey), lets no light value win on a dark page in cascade order,
 *   and every text/surface pair VitePress renders from it reaches WCAG AA
 *   (text 4.5:1, focus ring and field rims 3:1) on doc pages in both modes
 *   and on the forced-dark landing, computed through VitePress' own
 *   variables; code in a status block keeps a chip of its own;
 * - the rules the variables alone don't show: the focus ring itself (and no
 *   VitePress focus rule outranking it), the landing's white wordmark and
 *   Shiki's dark tokens.
 */

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8")
const THEME = "docs/.vitepress/theme"
const VITEPRESS_VARS = "docs/node_modules/vitepress/dist/client/theme-default/styles/vars.css"

const docsTokens = read(`${THEME}/cd-tokens.generated.css`)
const uiTokens = read("packages/ui/src/theme/cd-tokens.generated.css")
const customCss = read(`${THEME}/custom.css`)
const themeIndex = read(`${THEME}/index.ts`)
const config = read("docs/.vitepress/config.ts")

/** The CI version the vendored file names in its marker line. */
const BRAND_VERSION = /miragon-brand (\d+\.\d+\.\d+)/.exec(docsTokens)?.[1] ?? "unknown"

/** The CI files under docs/public/logo with their sha256 (the CI's bytes). */
const LOGOS: Record<string, string> = {
  "miragon-logo-gruen.svg": "bc815e0698689546771e629139d86ac9dfbe29dc5618cd5e2910e6079629eae3",
  "miragon-logo-weiss.svg": "a235870d9347600d83f4294b4a31799338ead399f1351dc8880809efcc8621fd",
  "miragon-komet-blau.svg": "c44c4a00f93f4255442bb70afeb8dbcb7eaae6af331ff04b6c685b6d20f587c9",
}

/** corporate-design's logo directory in a reachable plugin checkout, or null (CI). */
function findLogoDir(): string | null {
  const home = os.homedir()
  let entries: string[]
  try {
    entries = fs.readdirSync(home).filter((name) => name.startsWith(".claude"))
  } catch {
    return null
  }
  const rel = ["plugins", "cache", "miragon-agent-skills", "miragon-brand", BRAND_VERSION]
  const tail = ["skills", "corporate-design", "assets", "logo"]
  const dir = entries.map((d) => path.join(home, d, ...rel, ...tail)).find((d) => fs.existsSync(d))
  return dir ?? null
}

describe("docs theme: vendored CI assets", () => {
  it("vendors the UI package's token file byte for byte", () => {
    expect(BRAND_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(docsTokens, "re-copy packages/ui/src/theme/cd-tokens.generated.css").toBe(uiTokens)
  })

  it("ships the CI's wordmarks and Komet unchanged (pinned hashes)", () => {
    for (const [file, sha] of Object.entries(LOGOS)) {
      const bytes = fs.readFileSync(path.join(REPO_ROOT, "docs/public/logo", file))
      expect(createHash("sha256").update(bytes).digest("hex"), file).toBe(sha)
    }
  })

  it("matches the skill's logo files when a plugin checkout is reachable", () => {
    const dir = findLogoDir()
    if (!dir) {
      console.warn(`docs logos: no miragon-brand ${BRAND_VERSION} checkout, pinned hashes hold`)
      return
    }
    for (const file of Object.keys(LOGOS)) {
      const vendored = fs.readFileSync(path.join(REPO_ROOT, "docs/public/logo", file))
      expect(vendored.equals(fs.readFileSync(path.join(dir, file))), file).toBe(true)
    }
  })
})

describe("docs theme: wiring and product name", () => {
  it("loads VitePress, then the tokens, then the mapping; Geist instead of Inter", () => {
    // VitePress first: at equal specificity the mapping's rules (the focus
    // ring) win by coming later, which the focus tests below rely on.
    const vitepress = themeIndex.indexOf('from "vitepress/theme-without-fonts"')
    expect(vitepress).toBeGreaterThan(-1)
    for (const font of ["@fontsource-variable/geist", "@fontsource-variable/geist-mono"]) {
      expect(themeIndex).toContain(`import "${font}"`)
    }
    const tokens = themeIndex.indexOf('import "./cd-tokens.generated.css"')
    expect(tokens).toBeGreaterThan(vitepress)
    expect(themeIndex.indexOf('import "./custom.css"')).toBeGreaterThan(tokens)
  })

  it("names the product, shows the wordmarks and the Komet favicon", () => {
    expect(config).toMatch(/\btitle: "Miragon MCP Toolkit"/)
    expect(read("docs/index.md")).toMatch(/^ {2}name: Miragon MCP Toolkit$/m)
    for (const file of [...config.matchAll(/["`](?:\$\{base\})?\/?(logo\/[\w-]+\.svg)["`]/g)]) {
      expect(fs.existsSync(path.join(REPO_ROOT, "docs/public", file[1] ?? "")), file[1]).toBe(true)
    }
    expect(config).toContain('light: "/logo/miragon-logo-gruen.svg"')
    expect(config).toContain('dark: "/logo/miragon-logo-weiss.svg"')
    expect(config).toContain("href: `${base}logo/miragon-komet-blau.svg`")
  })

  it("highlights code in the Shiki pair whose every token reaches AA on the code surfaces", () => {
    // Measured on --cd-grau and the dark lift (comments are the lowest: 4.72:1
    // and 4.98:1); the default github-light/-dark pair drops to 3.27:1 / 3.06:1.
    expect(config).toContain(
      'theme: { light: "github-light-high-contrast", dark: "github-dark-default" }',
    )
  })

  it("colours the browser chrome with --cd-blau", () => {
    const blau = /--cd-blau:\s*(#[0-9A-Fa-f]{6});/.exec(docsTokens)?.[1]
    expect(config).toContain(`["meta", { name: "theme-color", content: "${blau}" }]`)
  })
})

// ── The mapping ─────────────────────────────────────────────────────────────

const TOKENS = cssBlocks(docsTokens)
const CD = layer(TOKENS, ":root")
const VP = cssBlocks(read(VITEPRESS_VARS))
const DOCS = cssBlocks(customCss)
/** Every `:root` block of the mapping: the light appearance. */
const LIGHT = layer(DOCS, ":root")
/** The stylesheets in the order the theme loads them (index.ts). */
const SHEETS = [VP, TOKENS, DOCS]

/** Variables the light block sets that are not colours (the same in both modes). */
const MODE_INVARIANT = new Set([
  "--vp-font-family-base",
  "--vp-font-family-mono",
  "--vp-nav-logo-height",
])

/** The root selectors each page state matches (`.dark` from the toggle, `:has(.VPHome)` on the landing). */
const ROOT_STATES: Record<string, string[]> = {
  "light doc page": [":root"],
  "dark doc page": [":root", ".dark"],
  "landing, light toggle": [":root", ":root:has(.VPHome)"],
  "landing, dark toggle": [":root", ".dark", ":root:has(.VPHome)"],
}

/** The blocks each page state applies, in cascade order (specificity, then source order). */
const cascade = (state: string): CssBlock[] =>
  rootCascade(SHEETS, new Set(ROOT_STATES[state] ?? []))

/** The variable layers each page state applies, lowest priority first. */
const SCENARIOS: Record<string, Decls[]> = Object.fromEntries(
  Object.keys(ROOT_STATES).map((state) => [state, cascade(state).map((block) => block.decls)]),
)

type Pair = { fg: string; on: string[]; min: number }
const text = (fg: string, ...on: string[]): Pair => ({ fg, on: ["--vp-c-bg", ...on], min: 4.5 })
const rim = (fg: string, ...on: string[]): Pair => ({ fg, on: ["--vp-c-bg", ...on], min: 3 })

const SURFACES = [[], ["--vp-c-bg-alt"], ["--vp-c-bg-soft"], ["--vp-c-bg-elv"]]
const BLOCKS = ["info", "note", "tip", "important", "warning", "danger", "caution", "details"]
const TONES = ["tip", "important", "warning", "danger", "caution"]
/** The status blocks: a tint (or the dark lift), a rim, and a code chip of their own. */
const STATUS_BLOCKS = ["note", ...TONES]
const BADGES = ["info", "tip", "warning", "danger"]
const BUTTON_STATES = ["", "hover-", "active-"]

/** Every foreground/surface pair VitePress draws from the mapped variables. */
const PAIRS: Pair[] = [
  ...SURFACES.flatMap((on) =>
    ["--vp-c-text-1", "--vp-c-text-2", "--vp-c-text-3", "--vp-c-brand-1"].map((fg) =>
      text(fg, ...on),
    ),
  ),
  text("--vp-c-brand-2"),
  text("--vp-home-hero-name-color"),
  ...["brand", "alt"].flatMap((kind) =>
    BUTTON_STATES.map((s) => text(`--vp-button-${kind}-${s}text`, `--vp-button-${kind}-${s}bg`)),
  ),
  text("--vp-code-color", "--vp-code-bg"),
  text("--vp-code-link-color", "--vp-code-bg"),
  ...["--vp-code-block-color", "--vp-code-lang-color", "--vp-code-line-number-color"].map((fg) =>
    text(fg, "--vp-code-block-bg"),
  ),
  text("--vp-code-tab-text-color", "--vp-code-tab-bg"),
  ...BLOCKS.map((b) => text(`--vp-custom-block-${b}-text`, `--vp-custom-block-${b}-bg`)),
  ...TONES.flatMap((t) => [
    text(`--vp-c-${t}-1`, `--vp-custom-block-${t}-bg`),
    text(`--vp-c-${t}-2`, `--vp-custom-block-${t}-bg`),
    text(`--vp-c-${t}-1`, `--vp-custom-block-${t}-bg`, `--vp-custom-block-${t}-code-bg`),
  ]),
  // Code in a status block takes the block's text colour (custom.css), on its chip.
  ...STATUS_BLOCKS.map((b) =>
    text(
      `--vp-custom-block-${b}-text`,
      `--vp-custom-block-${b}-bg`,
      `--vp-custom-block-${b}-code-bg`,
    ),
  ),
  text("--vp-c-brand-1", "--vp-custom-block-info-bg"),
  text("--vp-c-brand-1", "--vp-custom-block-note-bg"),
  text("--vp-c-brand-1", "--vp-custom-block-note-bg", "--vp-custom-block-note-code-bg"),
  ...BADGES.map((b) => text(`--vp-badge-${b}-text`, `--vp-badge-${b}-bg`)),
  text("--vp-local-search-highlight-text", "--vp-local-search-highlight-bg"),
  ...SURFACES.map((on) => rim("--docs-focus-ring", ...on)),
  rim("--vp-input-border-color", "--vp-input-bg-color"),
]

/** Colour literals the mapping must not hold: every colour comes from a --cd-* token. */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/

/**
 * A light colour is a token, or a token made translucent (CI: no own greys,
 * transparency comes from the token). An opaque mix of two tokens is a new
 * grey, which the CI rules out.
 */
const LIGHT_VALUE =
  /^(?:transparent|var\(--cd-[\w-]+\)|color-mix\(in srgb, var\(--cd-[\w-]+\) \d+(?:\.\d+)?%, transparent\))$/

/** The prose chip's own step is ~1.13:1 (light) / ~1.15:1 (dark); a block's chip keeps about that. */
const CHIP_STEP = 1.1

describe("docs theme: the mapping onto --cd-*", () => {
  it("holds no colour literal of its own", () => {
    const rules = customCss.replace(/\/\*[\s\S]*?\*\//g, "")
    expect(rules.match(COLOUR_LITERAL)?.[0] ?? null).toBeNull()
  })

  it("takes every light colour from a token, never from an opaque mix", () => {
    const own = Object.entries(LIGHT).filter(
      ([name, value]) => !MODE_INVARIANT.has(name) && !LIGHT_VALUE.test(value),
    )
    expect(own.map(([name, value]) => `${name}: ${value}`)).toEqual([])
  })

  it("lets no light value win on a dark page or the landing (cascade order)", () => {
    for (const state of Object.keys(ROOT_STATES).filter((s) => s !== "light doc page")) {
      const winner: Record<string, CssBlock> = {}
      for (const block of cascade(state)) {
        for (const name of Object.keys(block.decls)) winner[name] = block
      }
      const leaks = Object.keys(LIGHT).filter(
        (name) => !MODE_INVARIANT.has(name) && winner[name]?.selector === ":root",
      )
      expect(leaks, state).toEqual([])
    }
  })

  it("orders the cascade like the browser: a later :root beats .dark, :has() beats both", () => {
    const sheet = cssBlocks(
      ":root:has(.VPHome) { --a: #00f } :root { --a: #000 } .dark { --a: #fff } :root { --a: #f00 }",
    )
    const value = (state: string[]) =>
      createColourResolver(rootCascade([sheet], new Set(state)).map((b) => b.decls))("--a")
    expect(value([":root", ".dark"])).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(value([":root", ".dark", ":root:has(.VPHome)"])).toEqual({ r: 0, g: 0, b: 255, a: 1 })
  })

  it("sets inline code in a status block off from the block (its own chip)", () => {
    for (const [scenario, layers] of Object.entries(SCENARIOS)) {
      const colour = createColourResolver(layers)
      const faint = STATUS_BLOCKS.flatMap((b) => {
        const block = over(colour(`--vp-custom-block-${b}-bg`), colour("--vp-c-bg"))
        const step = contrast(over(colour(`--vp-custom-block-${b}-code-bg`), block), block)
        return step >= CHIP_STEP ? [] : [`${b}: ${step.toFixed(3)} < ${CHIP_STEP}`]
      })
      expect(faint, scenario).toEqual([])
    }
  })

  for (const [scenario, layers] of Object.entries(SCENARIOS)) {
    it(`reaches WCAG AA on every pair: ${scenario}`, () => {
      const colour = createColourResolver(layers)
      const failures = PAIRS.flatMap(({ fg, on, min }) => {
        const surface = on.map(colour).reduce((below, top) => over(top, below))
        const ratio = contrast(colour(fg), surface)
        return ratio >= min ? [] : [`${fg} on ${on.join(" > ")}: ${ratio.toFixed(2)} < ${min}`]
      })
      expect(failures).toEqual([])
    })
  }

  it("resolves the CI colours it claims (the maths is alive)", () => {
    const light = createColourResolver(SCENARIOS["light doc page"] ?? [])
    const dark = createColourResolver(SCENARIOS["dark doc page"] ?? [])
    const white = { r: 255, g: 255, b: 255, a: 1 }
    expect(contrast(light("--vp-button-brand-text"), light("--vp-button-brand-bg"))).toBeCloseTo(
      5.47,
      1,
    )
    expect(light("--vp-c-brand-1")).toEqual(createColourResolver([CD])("--cd-blau-link"))
    expect(dark("--vp-c-brand-1")).toEqual(createColourResolver([CD])("--cd-gruen"))
    expect(contrast(dark("--vp-c-brand-1"), dark("--vp-c-bg"))).toBeGreaterThan(10)
    expect(contrast(white, white)).toBe(1)
    // The hero name is the heading white, not a three-word green (CI U5).
    const landing = createColourResolver(SCENARIOS["landing, light toggle"] ?? [])
    expect(landing("--vp-home-hero-name-color")).toEqual(landing("--vp-c-text-1"))
  })
})

// ── The rules the variables alone don't show ───────────────────────────────

const VP_THEME = "docs/node_modules/vitepress/dist/client/theme-default"

type Rule = { selector: string; props: Decls; file: string; spec: Specificity }

/** The CSS of one theme file: a stylesheet whole, a component's <style> blocks. */
function stylesOf(file: string, source: string): { css: string; scoped: boolean }[] {
  if (file.endsWith(".css")) return [{ css: source, scoped: false }]
  return [...source.matchAll(/<style(\s+scoped)?[^>]*>([\s\S]*?)<\/style>/g)].map((m) => ({
    css: m[2] ?? "",
    scoped: Boolean(m[1]),
  }))
}

/**
 * Every selector of VitePress' default theme with its declarations: its
 * stylesheets and the <style> blocks of its components. A scoped block's
 * selectors carry the attribute selector Vue adds, (0,1,0) on top.
 */
function vitepressRules(): Rule[] {
  const dir = path.join(REPO_ROOT, VP_THEME)
  const files = fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".css") || file.endsWith(".vue"))
  return files.flatMap((file) =>
    stylesOf(file, fs.readFileSync(path.join(dir, file), "utf8")).flatMap(({ css, scoped }) =>
      cssBlocks(css).flatMap((block) =>
        splitSelectors(block.selector).map((selector) => {
          const [a, b, c] = specificity(selector)
          const spec: Specificity = [a, scoped ? b + 1 : b, c]
          return { selector, props: block.props, file, spec }
        }),
      ),
    ),
  )
}

/** The outline a rule sets, if any (shorthand or longhand). */
const outlineOf = (props: Decls): string | undefined =>
  props.outline ?? props["outline-style"] ?? props["outline-width"]

/** The one rule of custom.css whose selector list holds `selector`. */
const docsRule = (selector: string): CssBlock | undefined =>
  DOCS.find((block) => splitSelectors(block.selector).includes(selector))

/**
 * VitePress focus rules that take the outline away on purpose or on a
 * component the docs never render, with the reason. Shrink-only: a stale
 * entry fails below.
 */
const VP_FOCUS_EXEMPT: Record<string, string> = {
  ".sp .sp-link.link:focus": "VPTeamMembers' sponsor link: the docs render no team page",
}

/** Form fields keep VitePress' own focus border (custom.css says so). */
const FORM_FIELDS = new Set(["input", "textarea", "select"])

describe("docs theme: focus ring and landing rules", () => {
  const ring = DOCS.filter((block) => splitSelectors(block.selector).includes(":focus-visible"))

  it("rings every focus-visible element: a 2 px solid outline in the mode's ring colour", () => {
    expect(ring).toHaveLength(1)
    const outline = ring[0]?.props.outline ?? ""
    const width = /^(\d+(?:\.\d+)?)px solid var\(--docs-focus-ring\)$/.exec(outline)?.[1]
    expect(Number(width ?? 0), `outline: ${outline}`).toBeGreaterThanOrEqual(2)
  })

  it("takes no outline away in its own rules", () => {
    const off = DOCS.filter((block) => /^(?:none|0(?:px)?)\b/.test(outlineOf(block.props) ?? ""))
    expect(off.map((block) => block.selector)).toEqual([])
  })

  it("lets no VitePress focus rule outrank the ring", () => {
    // The ring's selectors and what each requires of the focused element.
    const ringSelectors = splitSelectors(ring[0]?.selector ?? "").map((selector) => ({
      spec: specificity(selector),
      needs: simpleSelectors(subjectCompound(selector)).filter((s) => !s.startsWith(":")),
    }))
    const focusRules = vitepressRules().filter(
      ({ selector, props }) =>
        /:focus(?!-within)/.test(selector.replace(/:not\([^)]*\)/g, "")) &&
        !selector.includes(":not(:focus-visible)") &&
        outlineOf(props) !== undefined,
    )
    const outranking = focusRules.flatMap(({ selector, props, file, spec }) => {
      const subject = simpleSelectors(subjectCompound(selector))
      if (subject.some((s) => FORM_FIELDS.has(s)) || selector in VP_FOCUS_EXEMPT) return []
      const ringSpec = maxSpecificity(
        ringSelectors.filter((r) => r.needs.every((s) => subject.includes(s))).map((r) => r.spec),
      )
      const important = /!important/.test(outlineOf(props) ?? "")
      return important || compareSpecificity(spec, ringSpec) > 0
        ? [`${file}: ${selector} (${spec.join(",")} > ${ringSpec.join(",")})`]
        : []
    })
    expect(outranking).toEqual([])
    // The scan reads both kinds of source (the maths is alive) and every exemption still exists.
    const seen = focusRules.map((rule) => rule.selector)
    expect(seen).toEqual(
      expect.arrayContaining(["button:focus-visible", ".DocSearch-Button:focus"]),
    )
    expect(seen).toEqual(expect.arrayContaining(Object.keys(VP_FOCUS_EXEMPT)))
  })

  it("shows the white wordmark and Shiki's dark tokens on the forced-dark landing", () => {
    const landing = ":root:has(.VPHome)"
    expect(docsRule(`${landing} .VPNavBarTitle .VPImage.light`)?.props.display).toBe("none")
    expect(docsRule(`${landing} .VPNavBarTitle .VPImage.dark`)?.props.display).toBe("inline-block")
    expect(docsRule(`${landing} .vp-code span`)?.props.color).toBe("var(--shiki-dark, inherit)")
  })
})
