/// <reference types="node" />
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  MODE_INVARIANT_VARS,
  ROLE_TOKENS,
  TOKEN_TO_CSS_VAR,
  resolveThemeVars,
  type ThemeVars,
} from "./create-theme.js"
import { HOST_FONT_VARIABLES } from "./host-fonts.js"
import { themePresets } from "./presets.js"

/**
 * The role-token layer (`theme.css`) against its contract and the Miragon CI:
 * every role defined in light and — for colours — dark, pointing only at the
 * vendored `--cd-*` tokens, and every role/tone pair the kit actually renders
 * meeting WCAG contrast (text 4.5:1, non-text 3:1) in BOTH modes, computed
 * from the vendored token values — for the default theme and for every
 * shipped preset.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8")
const themeCss = read("../theme.css")
const globalsCss = read("../globals.css")
const fontsCss = read("../fonts.css")
const cdCss = read("./cd-tokens.generated.css")

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")
const rules = stripComments(themeCss)

const LIGHT_SELECTOR =
  ':root, :where(.dark, [data-theme="dark"], [data-theme-mode="dark"]) [data-theme-mode="light"]'
const DARK_SELECTOR = '.dark, [data-theme="dark"], [data-theme-mode="dark"]'
const norm = (s: string) => s.replace(/\s+/g, " ").trim()

/** Every innermost block of theme.css: its normalized selector, offset and declarations. */
const BLOCKS = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => {
  // The prelude runs back to the previous brace; drop finished statements
  // (`@import …;`, `@custom-variant …;`) in front of the selector.
  const selector = norm((match[1] as string).split(";").pop() ?? "")
  const decls: Record<string, string> = {}
  for (const decl of (match[2] as string).split(";")) {
    const at = decl.indexOf(":")
    if (at < 0) continue
    const name = decl.slice(0, at).trim()
    if (name.startsWith("--") || name === "color-scheme") decls[name] = norm(decl.slice(at + 1))
  }
  return { selector, offset: match.index, decls }
})

/** Declarations of the innermost block whose (normalized) selector is `selector`. */
function block(selector: string): Record<string, string> {
  const found = BLOCKS.find((b) => b.selector === norm(selector))
  if (!found) throw new Error(`theme.css has no block "${selector}"`)
  return found.decls
}

const ROOT = block(":root")
const LIGHT = block(LIGHT_SELECTOR)
const DARK = block(DARK_SELECTOR)
const THEME_INLINE = block("@theme inline")
const THEME_REFERENCE = block("@theme inline reference")

const CD: Record<string, string> = {}
for (const m of cdCss.matchAll(/(--cd-[a-z0-9-]+):\s*([^;]+);/g))
  CD[m[1] as string] = m[2] as string

// ── Colour maths (sRGB, WCAG 2.x relative luminance) ──────────────────────────

type Rgba = { r: number; g: number; b: number; a: number }

function hex(value: string): Rgba {
  const h = value.trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a #rrggbb colour: ${value}`)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: 1,
  }
}

/** CSS Color 4 `oklch(L C H)` → sRGB (gamut-clipped), for preset values. */
function oklch(l: number, c: number, h: number): Rgba {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const encode = (linear: number) => {
    const v = Math.min(1, Math.max(0, linear))
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
  }
  return {
    r: encode(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: encode(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: encode(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
    a: 1,
  }
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

/**
 * A role value → colour. theme.css uses var(--cd-*), color-mix(in srgb, …) and
 * transparent; a theme (preset) may also use #rrggbb and oklch(L C H).
 */
function colour(value: string): Rgba {
  const v = value.trim()
  if (v === "transparent") return TRANSPARENT
  const ref = /^var\((--cd-[a-z0-9-]+)\)$/.exec(v)
  if (ref) {
    const cd = CD[ref[1] as string]
    if (!cd) throw new Error(`unknown token ${ref[1]}`)
    return hex(cd)
  }
  if (v.startsWith("#")) return hex(v)
  const lch = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(v)
  if (lch) return oklch(Number(lch[1]), Number(lch[2]), Number(lch[3]))
  const mix = /^color-mix\(in srgb, (.+) (\d+(?:\.\d+)?)%, (.+)\)$/.exec(v)
  if (mix) {
    const a = colour(mix[1] as string)
    const b = colour(mix[3] as string)
    const p = Number(mix[2]) / 100
    // Premultiplied interpolation (CSS Color 5): mixing with transparent keeps
    // the colour and scales its alpha.
    const alpha = a.a * p + b.a * (1 - p)
    if (alpha === 0) return TRANSPARENT
    const ch = (k: "r" | "g" | "b") => (a[k] * a.a * p + b[k] * b.a * (1 - p)) / alpha
    return { r: ch("r"), g: ch("g"), b: ch("b"), a: alpha }
  }
  throw new Error(`value outside the token grammar: ${v}`)
}

/** `top` painted over an opaque `bottom`. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  }
}

function luminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

type Mode = "light" | "dark"
const MODES: Mode[] = ["light", "dark"]

/**
 * A role's value in `mode`: the theme scope's own variables first (`theme`,
 * what resolveThemeVars puts on a ThemeProvider), then theme.css (dark falls
 * back to light/root where not redeclared).
 */
function role(name: string, mode: Mode, theme: ThemeVars = {}): string {
  const value =
    theme[name as `--${string}`] ??
    (mode === "dark" ? DARK[name] : undefined) ??
    LIGHT[name] ??
    ROOT[name]
  if (!value) throw new Error(`role ${name} is not defined for ${mode}`)
  return value
}

/** A surface role resolved to an opaque colour: translucent surfaces sit on --background. */
function surface(name: string, mode: Mode, theme?: ThemeVars): Rgba {
  const ground = colour(role("--background", mode, theme))
  return over(colour(role(name, mode, theme)), ground)
}

/** Contrast of a foreground role on a surface role (the surface itself may be a tint). */
function ratio(fg: string, bg: string, mode: Mode, theme?: ThemeVars): number {
  const back = surface(bg, mode, theme)
  return contrast(over(colour(role(fg, mode, theme)), back), back)
}

// ── The contract ──────────────────────────────────────────────────────────────

const COLOUR_ROLES = ROLE_TOKENS.filter((name) => name in LIGHT)

describe("theme.css — the role-token contract", () => {
  it("defines every contract role", () => {
    for (const name of ROLE_TOKENS) {
      expect(name in LIGHT || name in ROOT, `${name} missing from theme.css`).toBe(true)
    }
  })

  it("defines every colour role for light AND dark", () => {
    expect(COLOUR_ROLES.length).toBeGreaterThanOrEqual(25)
    for (const name of COLOUR_ROLES) {
      expect(name in DARK, `${name} has no dark value`).toBe(true)
    }
  })

  it("points every role at --cd-* tokens only (never at another role; fonts also at the host's font)", () => {
    const hostSlots = new Set<string>(Object.values(HOST_FONT_VARIABLES))
    for (const decls of [ROOT, LIGHT, DARK]) {
      for (const [name, value] of Object.entries(decls)) {
        for (const ref of value.matchAll(/var\((--[a-z0-9-]+)/g)) {
          const target = ref[1] as string
          if (hostSlots.has(target)) {
            // Only the font role may name the host's font, and only its own slot.
            expect(HOST_FONT_VARIABLES[name as keyof typeof HOST_FONT_VARIABLES], name).toBe(target)
          } else {
            expect(target, `${name}: ${value}`).toMatch(/^--cd-/)
          }
        }
      }
    }
  })

  it("resolves every colour role to a colour from the vendored tokens", () => {
    for (const mode of MODES) {
      for (const name of COLOUR_ROLES) {
        expect(() => colour(role(name, mode)), `${name} (${mode})`).not.toThrow()
      }
    }
  })

  it("maps the self-named utilities (rounded-*, shadow-*, font-*) onto the roles, not calc()", () => {
    for (const name of ["--radius-sm", "--radius-md", "--radius-lg", "--radius-pill"]) {
      expect(THEME_REFERENCE[name], name).toBe(`var(${name})`)
      expect(THEME_INLINE, name).not.toHaveProperty(name)
    }
    for (const name of ["--shadow-1", "--shadow-2", "--shadow-3", "--font-sans", "--font-mono"]) {
      expect(THEME_REFERENCE[name], name).toBe(`var(${name})`)
    }
    for (const value of Object.values(THEME_REFERENCE)) expect(value).not.toContain("calc(")
  })

  it("exposes the new colour roles as utilities (bg-scrim, text-link, ring-focus, text-*-ink, …)", () => {
    for (const name of [
      "link",
      "focus",
      "primary-hover",
      "scrim",
      "destructive-foreground",
      "success-ink",
      "warning-ink",
      "danger-ink",
      "info-ink",
    ]) {
      expect(THEME_INLINE[`--color-${name}`], name).toBe(`var(--${name})`)
    }
  })

  it("follows the NEAREST mode scope for dark: (dark scope, or a dark scope nested in a light island)", () => {
    const D = String.raw`:is\(\.dark, \[data-theme="dark"\], \[data-theme-mode="dark"\]\)`
    const L = String.raw`\[data-theme-mode="light"\]`
    expect(rules).toMatch(
      new RegExp(
        String.raw`@custom-variant dark \(&:is\(${D} \*:not\(${L} \*\), ${L} ${D} \*:not\(${L} ${D} ${L} \*\)\)\);`,
      ),
    )
  })

  it("re-declares the light roles on a light island only inside a dark scope (a light document keeps a consumer's :root brand)", () => {
    expect(BLOCKS.some((b) => b.selector === LIGHT_SELECTOR)).toBe(true)
    // No rule re-declares roles on EVERY light scope: that would reset a
    // consumer's `:root { --primary: … }` inside each light ThemeProvider.
    for (const b of BLOCKS) {
      const selectors = b.selector.split(/,(?![^(]*\))/).map(norm)
      if (Object.keys(b.decls).some((d) => d.startsWith("--"))) {
        expect(selectors, b.selector).not.toContain('[data-theme-mode="light"]')
      }
    }
  })

  it("declares the dark roles AFTER the light ones (same specificity on <html>: order decides)", () => {
    const light = BLOCKS.find((b) => b.selector === norm(LIGHT_SELECTOR))
    const dark = BLOCKS.find((b) => b.selector === norm(DARK_SELECTOR))
    expect(light && dark && light.offset < dark.offset).toBe(true)
  })

  it("keeps MODE_INVARIANT_VARS in step with theme.css", () => {
    for (const name of Object.values(TOKEN_TO_CSS_VAR)) {
      const light = LIGHT[name] ?? ROOT[name]
      const invariant = DARK[name] === undefined || DARK[name] === light
      expect(MODE_INVARIANT_VARS.has(name), `${name} invariant=${invariant}`).toBe(invariant)
    }
  })

  it("forces no font: no font import, no !important font-family, Geist named first", () => {
    for (const css of [themeCss, globalsCss]) {
      const r = stripComments(css)
      expect(r).not.toMatch(/@fontsource/)
      expect(r).not.toMatch(/font-family[^;}]*!important/)
    }
    expect(ROOT["--font-sans"]).toMatch(/^"Geist", /)
    expect(ROOT["--font-mono"]).toMatch(/^"Geist Mono", /)
    // The opt-in file is the only place that loads them.
    expect(stripComments(fontsCss)).toMatch(/@import "@fontsource-variable\/geist\/wght\.css";/)
    expect(stripComments(fontsCss)).toMatch(
      /@import "@fontsource-variable\/geist-mono\/wght\.css";/,
    )
  })

  it("puts the host's font right after Geist and before the system stack", () => {
    expect(ROOT["--font-sans"]).toBe(
      '"Geist", "Geist Variable", var(--host-font-sans, ui-sans-serif), system-ui, sans-serif',
    )
    expect(ROOT["--font-mono"]).toBe(
      '"Geist Mono", "Geist Mono Variable", var(--host-font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace',
    )
  })

  it("respects prefers-reduced-motion (modeler-tool-design §7)", () => {
    expect(rules).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{\s*animation-duration: 0\.001ms !important;\s*animation-iteration-count: 1 !important;\s*transition-duration: 0\.001ms !important;/,
    )
  })

  it("gives every focusable element an opaque focus outline in --focus", () => {
    expect(rules).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--focus\);/)
  })

  it("sets color-scheme per mode on <body> and the mode scopes, never on <html>", () => {
    const schemes = BLOCKS.filter((b) => "color-scheme" in b.decls)
    const light = schemes.find((b) => b.decls["color-scheme"] === "light")
    const dark = schemes.find((b) => b.decls["color-scheme"] === "dark")
    expect(light?.selector).toBe('body, :where(body) [data-theme-mode="light"]')
    expect(dark?.selector).toBe(
      ':is(.dark, [data-theme="dark"]) body, body:is(.dark, [data-theme="dark"], [data-theme-mode="dark"]), :where(body) :is(.dark, [data-theme="dark"], [data-theme-mode="dark"])',
    )
    // A root color-scheme that differs from the host's iframe paints an opaque
    // canvas behind the view; mcp-use keeps it transparent on purpose.
    for (const b of BLOCKS) {
      if (b.selector.includes(":root") || /(^|[\s,])html\b/.test(b.selector)) {
        expect(b.decls, b.selector).not.toHaveProperty("color-scheme")
      }
    }
  })

  it("is what globals.css loads, after Tailwind, with the vendored tokens", () => {
    const g = stripComments(globalsCss)
    expect(g.indexOf('@import "tailwindcss";')).toBeGreaterThanOrEqual(0)
    expect(g.indexOf('@import "./theme.css";')).toBeGreaterThan(g.indexOf('@import "tailwindcss";'))
    expect(rules).toContain('@import "./theme/cd-tokens.generated.css";')
  })
})

// ── Contrast over every role/tone pair the kit renders ───────────────────────

const TONES = ["success", "warning", "danger", "info"] as const

/** Text pairs (WCAG 1.4.3, 4.5:1): [foreground role, surface role, where it renders]. */
const TEXT_PAIRS: [string, string, string][] = [
  ["--foreground", "--background", "body text"],
  ["--foreground", "--muted", "text on quiet surfaces (table heads, chips)"],
  ["--card-foreground", "--card", "Card"],
  ["--popover-foreground", "--popover", "Dialog, Sheet, Select menu"],
  ["--secondary-foreground", "--secondary", "secondary Button/Badge"],
  ["--accent-foreground", "--accent", "hovered outline/ghost Button, active FilterBar chip"],
  ["--muted-foreground", "--background", "secondary text"],
  ["--muted-foreground", "--card", "CardDescription, AlertDescription"],
  ["--muted-foreground", "--popover", "SelectLabel, dialog descriptions"],
  ["--muted-foreground", "--muted", "KpiGrid header, TabsList, TONE_SOFT.neutral"],
  ["--primary-foreground", "--primary", "primary Button, default Badge"],
  ["--primary-foreground", "--primary-hover", "hovered primary Button"],
  ["--destructive-foreground", "--destructive", "destructive Button"],
  ["--link", "--background", "link Button, links"],
  ["--link", "--card", "links in cards"],
  ["--link", "--popover", "links in dialogs"],
  ["--link", "--muted", "links on quiet surfaces"],
  ["--link", "--accent", "a link-coloured control while hovered (builder props button)"],
  ["--sidebar-foreground", "--sidebar", "sidebar"],
  ["--sidebar-primary-foreground", "--sidebar-primary", "sidebar primary"],
  ["--sidebar-accent-foreground", "--sidebar-accent", "sidebar accent"],
  ...TONES.flatMap((tone): [string, string, string][] => [
    [`--foreground`, `--${tone}-soft`, `TONE_SOFT.${tone} (Badge, Pills, banners, Alert)`],
    [`--${tone}-ink`, "--background", `TONE_TEXT.${tone}`],
    [`--${tone}-ink`, "--card", `TONE_TEXT.${tone} in a card`],
    [`--${tone}-ink`, "--popover", `TONE_TEXT.${tone} in a dialog or sheet`],
    [`--${tone}-ink`, "--muted", `TONE_TEXT.${tone} on a quiet surface`],
  ]),
]

/**
 * Text pairs that hold in LIGHT only, by design: dark lifts the hover/selected
 * (--accent) and secondary surfaces 10 % so they stay visible, and
 * --cd-kontur keeps 4.5:1 only up to a 3 % lift. On these surfaces quiet text
 * takes the surface's own foreground (`group-hover:text-accent-foreground`);
 * the design-system gate checks that a class string switching to one of these
 * surfaces switches the text too. Pinned below so the exemption is dropped
 * the day it is no longer needed.
 */
const LIGHT_ONLY_TEXT_PAIRS: [string, string, string][] = [
  ["--muted-foreground", "--accent", "quiet text on a hovered/selected item"],
  ["--muted-foreground", "--secondary", "quiet text on a secondary surface"],
]

/** Non-text pairs (WCAG 1.4.11, 3:1) that identify a control or its state. */
const NON_TEXT_PAIRS: [string, string, string][] = [
  ["--input", "--background", "Input/Select border, unchecked Switch track"],
  ["--input", "--card", "inputs in cards"],
  ["--input", "--popover", "inputs in dialogs and sheets"],
  ["--input", "--muted", "inputs on quiet surfaces"],
  ...["--background", "--card", "--popover", "--muted", "--accent"].flatMap(
    (bg): [string, string, string][] => [
      ["--focus", bg, "FOCUS_RING, :focus-visible outline"],
      ["--ring", bg, "legacy ring utilities"],
    ],
  ),
  ["--primary", "--background", "checked Switch track, active tab indicator"],
  ["--primary", "--card", "checked Switch in a card"],
  ["--primary", "--popover", "checked Switch in a sheet"],
]

/**
 * Status colours as fills/dots/borders that are NOT asserted on light, by CI
 * rule (§3.3): success and amber reach only 1.67:1 / 1.83:1 on white, so a
 * status is never colour alone — every toned dot, border or icon sits next to
 * text that carries it. The test pins that the exemption is still needed.
 */
const LIGHT_EXEMPT_STATUS = ["--success", "--warning"]

describe.each(MODES)("contrast in %s mode (computed from the vendored tokens)", (mode) => {
  it.each(TEXT_PAIRS)("text %s on %s ≥ 4.5:1 — %s", (fg, bg) => {
    expect(ratio(fg, bg, mode)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(LIGHT_ONLY_TEXT_PAIRS)(
    "text %s on %s ≥ 4.5:1 in light only (dark exemption still needed) — %s",
    (fg, bg) => {
      if (mode === "light") expect(ratio(fg, bg, mode)).toBeGreaterThanOrEqual(4.5)
      else expect(ratio(fg, bg, mode)).toBeLessThan(4.5)
    },
  )

  it.each(NON_TEXT_PAIRS)("non-text %s on %s ≥ 3:1 — %s", (fg, bg) => {
    expect(ratio(fg, bg, mode)).toBeGreaterThanOrEqual(3)
  })

  it.each(TONES.map((t) => `--${t}`))(
    "status colour %s as a dot/border/icon on the page ≥ 3:1 unless CI-exempt on light",
    (name) => {
      const r = ratio(name, "--background", mode)
      if (mode === "light" && LIGHT_EXEMPT_STATUS.includes(name)) {
        // Still exempt? If the CI ever lifts it to 3:1, drop the exemption.
        expect(r).toBeLessThan(3)
      } else {
        expect(r).toBeGreaterThanOrEqual(3)
      }
    },
  )
})

// The presets are customer-brand demos: their oklch values are data here.
/* brand-lint-disable */
const PRESETS = Object.entries(themePresets)

describe.each(PRESETS)("preset %s meets the same bar in both modes", (_name, preset) => {
  it.each(MODES)("every text pair ≥ 4.5:1 and non-text pair ≥ 3:1 in %s", (mode) => {
    const scope = resolveThemeVars(preset, mode)
    for (const [fg, bg, where] of TEXT_PAIRS) {
      expect(ratio(fg, bg, mode, scope), `${fg} on ${bg} (${where})`).toBeGreaterThanOrEqual(4.5)
    }
    for (const [fg, bg, where] of NON_TEXT_PAIRS) {
      expect(ratio(fg, bg, mode, scope), `${fg} on ${bg} (${where})`).toBeGreaterThanOrEqual(3)
    }
  })

  it("sets its own hover, link and focus in both modes (never the Miragon defaults)", () => {
    for (const name of ["--primary-hover", "--link", "--focus"] as const) {
      expect(preset.vars[name], `${name} light`).toBeDefined()
      expect(preset.darkVars?.[name], `${name} dark`).toBeDefined()
    }
  })
})
/* brand-lint-enable */

describe("dark mode follows the CI dark-ground rules", () => {
  it("grounds on --cd-schwarz with white text, green links, blue buttons, blau-hell focus", () => {
    expect(DARK["--background"]).toBe("var(--cd-schwarz)")
    expect(DARK["--foreground"]).toBe("var(--cd-weiss)")
    expect(DARK["--link"]).toBe("var(--cd-gruen)")
    expect(DARK["--primary"]).toBe("var(--cd-blau)")
    expect(DARK["--primary-foreground"]).toBe("var(--cd-weiss)")
    expect(DARK["--destructive-foreground"]).toBe("var(--cd-weiss)")
    expect(DARK["--focus"]).toBe("var(--cd-blau-hell)")
    expect(DARK["--muted-foreground"]).toBe("var(--cd-kontur)")
  })

  it("uses the -hell status values with no tinted fills", () => {
    for (const tone of TONES) {
      expect(DARK[`--${tone}`]).toBe(`var(--cd-${tone}-hell)`)
      expect(DARK[`--${tone}-ink`]).toBe(`var(--cd-${tone}-hell)`)
      expect(DARK[`--${tone}-soft`]).toBe("transparent")
    }
  })

  it("lifts surfaces only with white mixed into --cd-schwarz", () => {
    for (const name of ["--muted", "--secondary", "--accent"]) {
      expect(DARK[name]).toMatch(
        /^color-mix\(in srgb, var\(--cd-weiss\) \d+%, var\(--cd-schwarz\)\)$/,
      )
    }
  })

  it("keeps overlays on the ground (any lift drops a checked Switch below 3:1) and pushes the page back harder", () => {
    expect(DARK["--popover"]).toBe("var(--cd-schwarz)")
    const onLift = over(
      colour(role("--primary", "dark")),
      colour("color-mix(in srgb, var(--cd-weiss) 2%, var(--cd-schwarz))"),
    )
    // Why not lift: --cd-blau is 3.08:1 on the ground and under 3:1 from a 2 % lift.
    expect(
      contrast(onLift, colour("color-mix(in srgb, var(--cd-weiss) 2%, var(--cd-schwarz))")),
    ).toBeLessThan(3)
    const scrimAlpha = (mode: Mode) => colour(role("--scrim", mode)).a
    expect(role("--scrim", "dark")).toMatch(
      /^color-mix\(in srgb, var\(--cd-schwarz\) \d+%, transparent\)$/,
    )
    expect(scrimAlpha("dark")).toBeGreaterThan(scrimAlpha("light"))
  })

  it("draws the overlay edge in dark with the 3:1 input border (shadows vanish on the ground)", () => {
    for (const name of ["dialog", "sheet", "select"]) {
      const panel = read(`../primitives/${name}.tsx`)
        .split("\n")
        .find((line) => /\bbg-popover\b/.test(line))
      expect(panel, name).toMatch(/\sdark:border-input\s/)
    }
    expect(ratio("--input", "--popover", "dark")).toBeGreaterThanOrEqual(3)
  })
})

describe("light mode text never uses a status colour that fails on white", () => {
  it("routes success/warning text to the foreground ink", () => {
    expect(LIGHT["--success-ink"]).toBe("var(--cd-schwarz)")
    expect(LIGHT["--warning-ink"]).toBe("var(--cd-schwarz)")
  })

  it("keeps the CI backdrop on light (modeler-tool-design §8)", () => {
    expect(LIGHT["--scrim"]).toBe("color-mix(in srgb, var(--cd-schwarz) 42%, transparent)")
  })
})
