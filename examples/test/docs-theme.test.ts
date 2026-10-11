import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  contrast,
  createColourResolver,
  cssBlocks,
  layer,
  over,
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
 * - the mapping (`custom.css`) holds no colour of its own, sets every
 *   variable it sets in light in dark too, and every text/surface pair
 *   VitePress renders from it reaches WCAG AA (text 4.5:1, focus ring and
 *   field rims 3:1) on doc pages in both modes and on the forced-dark
 *   landing, computed through VitePress' own variables.
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
  it("loads the tokens before the mapping, Geist instead of Inter", () => {
    expect(themeIndex).toContain('from "vitepress/theme-without-fonts"')
    for (const font of ["@fontsource-variable/geist", "@fontsource-variable/geist-mono"]) {
      expect(themeIndex).toContain(`import "${font}"`)
    }
    const tokens = themeIndex.indexOf('import "./cd-tokens.generated.css"')
    expect(tokens).toBeGreaterThan(-1)
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

const CD = layer(cssBlocks(docsTokens), ":root")
const VP = cssBlocks(read(VITEPRESS_VARS))
const DOCS = cssBlocks(customCss)
const LIGHT = layer(DOCS, ":root")
const DARK = layer(DOCS, ".dark, :root:has(.VPHome)")
const LANDING = layer(DOCS, ":root:has(.VPHome)")

/** Variables the light block sets that are not colours (the same in both modes). */
const MODE_INVARIANT = new Set([
  "--vp-font-family-base",
  "--vp-font-family-mono",
  "--vp-nav-logo-height",
])

/** The variable layers each page state applies, lowest priority first. */
const SCENARIOS: Record<string, Decls[]> = {
  "light doc page": [CD, layer(VP, ":root"), LIGHT],
  "dark doc page": [CD, layer(VP, ":root"), layer(VP, ".dark"), LIGHT, DARK],
  "landing, light toggle": [CD, layer(VP, ":root"), LIGHT, DARK, LANDING],
  "landing, dark toggle": [CD, layer(VP, ":root"), layer(VP, ".dark"), LIGHT, DARK, LANDING],
}

type Pair = { fg: string; on: string[]; min: number }
const text = (fg: string, ...on: string[]): Pair => ({ fg, on: ["--vp-c-bg", ...on], min: 4.5 })
const rim = (fg: string, ...on: string[]): Pair => ({ fg, on: ["--vp-c-bg", ...on], min: 3 })

const SURFACES = [[], ["--vp-c-bg-alt"], ["--vp-c-bg-soft"], ["--vp-c-bg-elv"]]
const BLOCKS = ["info", "note", "tip", "important", "warning", "danger", "caution", "details"]
const TONES = ["tip", "important", "warning", "danger", "caution"]
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
  text("--vp-c-brand-1", "--vp-custom-block-info-bg"),
  ...BADGES.map((b) => text(`--vp-badge-${b}-text`, `--vp-badge-${b}-bg`)),
  text("--vp-local-search-highlight-text", "--vp-local-search-highlight-bg"),
  ...SURFACES.map((on) => rim("--docs-focus-ring", ...on)),
  rim("--vp-input-border-color", "--vp-input-bg-color"),
]

/** Colour literals the mapping must not hold: every colour comes from a --cd-* token. */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/

describe("docs theme: the mapping onto --cd-*", () => {
  it("holds no colour literal of its own", () => {
    const rules = customCss.replace(/\/\*[\s\S]*?\*\//g, "")
    expect(rules.match(COLOUR_LITERAL)?.[0] ?? null).toBeNull()
  })

  it("sets every light variable in the dark block too", () => {
    const missing = Object.keys(LIGHT).filter(
      (name) => !MODE_INVARIANT.has(name) && !(name in DARK),
    )
    expect(missing).toEqual([])
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
  })
})
