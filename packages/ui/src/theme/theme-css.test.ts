/// <reference types="node" />
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { MODE_INVARIANT_VARS, ROLE_TOKENS, TOKEN_TO_CSS_VAR } from "./create-theme.js"

/**
 * The role-token layer (`theme.css`) against its contract and the Miragon CI:
 * every role defined in light and — for colours — dark, pointing only at the
 * vendored `--cd-*` tokens, and every role/tone pair the kit actually renders
 * meeting WCAG contrast (text 4.5:1, non-text 3:1) in BOTH modes, computed
 * from the vendored token values.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8")
const themeCss = read("../theme.css")
const globalsCss = read("../globals.css")
const fontsCss = read("../fonts.css")
const cdCss = read("./cd-tokens.generated.css")

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")
const rules = stripComments(themeCss)

/** Declarations of the innermost block whose (normalized) selector is `selector`. */
function block(selector: string): Record<string, string> {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim()
  for (const match of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // The prelude runs back to the previous brace; drop finished statements
    // (`@import …;`, `@custom-variant …;`) in front of the selector.
    const prelude = (match[1] as string).split(";").pop() ?? ""
    if (norm(prelude) !== norm(selector)) continue
    const decls: Record<string, string> = {}
    for (const decl of (match[2] as string).split(";")) {
      const at = decl.indexOf(":")
      if (at < 0) continue
      const name = decl.slice(0, at).trim()
      if (name.startsWith("--"))
        decls[name] = decl
          .slice(at + 1)
          .replace(/\s+/g, " ")
          .trim()
    }
    return decls
  }
  throw new Error(`theme.css has no block "${selector}"`)
}

const ROOT = block(":root")
const LIGHT = block(':root, [data-theme-mode="light"]')
const DARK = block('.dark, [data-theme="dark"], [data-theme-mode="dark"]')
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

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

/** A role value → colour. Grammar used by theme.css: var(--cd-*), color-mix(in srgb, …), transparent. */
function colour(value: string): Rgba {
  const v = value.trim()
  if (v === "transparent") return TRANSPARENT
  const ref = /^var\((--cd-[a-z0-9-]+)\)$/.exec(v)
  if (ref) {
    const cd = CD[ref[1] as string]
    if (!cd) throw new Error(`unknown token ${ref[1]}`)
    return hex(cd)
  }
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
  throw new Error(`theme.css value outside the token grammar: ${v}`)
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

/** A role's value in `mode` (dark falls back to light/root where not redeclared). */
function role(name: string, mode: Mode): string {
  const value = (mode === "dark" ? DARK[name] : undefined) ?? LIGHT[name] ?? ROOT[name]
  if (!value) throw new Error(`role ${name} is not defined for ${mode}`)
  return value
}

/** A surface role resolved to an opaque colour: translucent surfaces sit on --background. */
function surface(name: string, mode: Mode): Rgba {
  const ground = colour(role("--background", mode))
  return over(colour(role(name, mode)), ground)
}

/** Contrast of a foreground role on a surface role (the surface itself may be a tint). */
function ratio(fg: string, bg: string, mode: Mode): number {
  const back = surface(bg, mode)
  return contrast(over(colour(role(fg, mode)), back), back)
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

  it("points every role at --cd-* tokens only (never at another role)", () => {
    for (const decls of [ROOT, LIGHT, DARK]) {
      for (const [name, value] of Object.entries(decls)) {
        for (const ref of value.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
          expect(ref[1], `${name}: ${value}`).toMatch(/^--cd-/)
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

  it("exposes the new colour roles as utilities (bg-scrim, text-link, ring-focus, text-*-ink)", () => {
    for (const name of [
      "link",
      "focus",
      "primary-hover",
      "scrim",
      "success-ink",
      "warning-ink",
      "danger-ink",
      "info-ink",
    ]) {
      expect(THEME_INLINE[`--color-${name}`], name).toBe(`var(--${name})`)
    }
  })

  it("follows the host's dark mode via .dark and data-theme, with a forced-light island", () => {
    expect(rules).toMatch(
      /@custom-variant dark \(&:is\(\.dark \*, \[data-theme="dark"\] \*\):not\(:is\(\[data-theme-mode="light"\], \[data-theme-mode="light"\] \*\)\)\);/,
    )
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

  it("respects prefers-reduced-motion (modeler-tool-design §7)", () => {
    expect(rules).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{\s*animation-duration: 0\.001ms !important;\s*animation-iteration-count: 1 !important;\s*transition-duration: 0\.001ms !important;/,
    )
  })

  it("gives every focusable element an opaque focus outline in --focus", () => {
    expect(rules).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--focus\);/)
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
  ["--primary-foreground", "--destructive", "destructive Button"],
  ["--link", "--background", "link Button, links"],
  ["--link", "--card", "links in cards"],
  ["--link", "--popover", "links in dialogs"],
  ["--link", "--muted", "links on quiet surfaces"],
  ["--link", "--accent", "a link-coloured control while hovered (builder props button)"],
  ["--sidebar-foreground", "--sidebar", "sidebar"],
  ["--sidebar-primary-foreground", "--sidebar-primary", "sidebar primary"],
  ["--sidebar-accent-foreground", "--sidebar-accent", "sidebar accent"],
  ...TONES.flatMap((tone): [string, string, string][] => [
    [`--${tone}-ink`, `--${tone}-soft`, `TONE_SOFT.${tone} (Badge, Pills, banners)`],
    [`--foreground`, `--${tone}-soft`, `body text on a ${tone} banner`],
    [`--${tone}-ink`, "--background", `TONE_TEXT.${tone}`],
    [`--${tone}-ink`, "--card", `TONE_TEXT.${tone} in a card`],
    [`--${tone}-ink`, "--popover", `TONE_TEXT.${tone} in a dialog or sheet`],
    [`--${tone}-ink`, "--muted", `TONE_TEXT.${tone} on a quiet surface`],
  ]),
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

describe("dark mode follows the CI dark-ground rules", () => {
  it("grounds on --cd-schwarz with white text, green links, blue buttons, blau-hell focus", () => {
    expect(DARK["--background"]).toBe("var(--cd-schwarz)")
    expect(DARK["--foreground"]).toBe("var(--cd-weiss)")
    expect(DARK["--link"]).toBe("var(--cd-gruen)")
    expect(DARK["--primary"]).toBe("var(--cd-blau)")
    expect(DARK["--primary-foreground"]).toBe("var(--cd-weiss)")
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

  it("lifts quiet surfaces only with white mixed into --cd-schwarz", () => {
    for (const name of ["--muted", "--secondary", "--accent"]) {
      expect(DARK[name]).toMatch(
        /^color-mix\(in srgb, var\(--cd-weiss\) \d+%, var\(--cd-schwarz\)\)$/,
      )
    }
  })
})

describe("light mode text never uses a status colour that fails on white", () => {
  it("routes success/warning text to the foreground ink", () => {
    expect(LIGHT["--success-ink"]).toBe("var(--cd-schwarz)")
    expect(LIGHT["--warning-ink"]).toBe("var(--cd-schwarz)")
  })
})
