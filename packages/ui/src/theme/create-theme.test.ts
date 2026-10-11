// The colours below are a CUSTOMER brand's values (white-label fixtures): test
// data by design, not Miragon colours. brand-lint is off for this file.
/* brand-lint-disable */
import { describe, expect, it } from "vitest"
import {
  MODE_INVARIANT_VARS,
  ROLE_TOKENS,
  TOKEN_TO_CSS_VAR,
  createTheme,
  resolveThemeVars,
  tokensToVars,
  type ThemeTokens,
} from "./create-theme.js"

describe("tokensToVars (token → CSS-var mapping)", () => {
  it("maps every curated token to its real CSS variable name", () => {
    const full: Required<ThemeTokens> = {
      primary: "oklch(0.55 0.2 264)",
      primaryForeground: "oklch(0.99 0 0)",
      primaryHover: "oklch(0.5 0.2 264)",
      link: "oklch(0.45 0.2 264)",
      accent: "oklch(0.95 0.03 264)",
      accentForeground: "oklch(0.3 0.1 264)",
      background: "#ffffff",
      foreground: "#101010",
      card: "hsl(0 0% 100%)",
      cardForeground: "hsl(0 0% 6%)",
      popover: "#fefefe",
      muted: "#f5f5f5",
      mutedForeground: "#666666",
      secondary: "#eeeeee",
      border: "oklch(0.92 0 0)",
      input: "#888888",
      ring: "oklch(0.7 0 0)",
      focus: "#2222ff",
      destructive: "#cc0000",
      destructiveForeground: "#fffff0",
      success: "#00aa00",
      successSoft: "#eeffee",
      successInk: "#003300",
      warning: "#ffaa00",
      warningSoft: "#fff5e0",
      warningInk: "#332200",
      danger: "#dd0000",
      dangerSoft: "#ffeeee",
      dangerInk: "#990000",
      info: "#0000dd",
      infoSoft: "#eeeeff",
      infoInk: "#000099",
      radius: "0.5rem",
      radiusSm: "4px",
      radiusMd: "8px",
      radiusLg: "12px",
      radiusPill: "9999px",
      shadow1: "0 1px 2px #0001",
      shadow2: "0 4px 8px #0002",
      shadow3: "0 8px 24px #0003",
      scrim: "#0008",
      motionFast: "100ms",
      motionBase: "200ms",
      motionSlow: "300ms",
      ease: "ease-in-out",
      fontSans: "Inter, sans-serif",
      fontMono: "JetBrains Mono, monospace",
      fontHeading: "Sora, sans-serif",
      textTitle: "2rem",
      textSection: "1.5rem",
      textBody: "1.0625rem",
      textDense: "0.9375rem",
      textSmall: "0.875rem",
    }
    expect(tokensToVars(full)).toEqual({
      "--primary": "oklch(0.55 0.2 264)",
      "--primary-foreground": "oklch(0.99 0 0)",
      "--primary-hover": "oklch(0.5 0.2 264)",
      "--link": "oklch(0.45 0.2 264)",
      "--accent": "oklch(0.95 0.03 264)",
      "--accent-foreground": "oklch(0.3 0.1 264)",
      "--background": "#ffffff",
      "--foreground": "#101010",
      "--card": "hsl(0 0% 100%)",
      "--card-foreground": "hsl(0 0% 6%)",
      "--popover": "#fefefe",
      "--muted": "#f5f5f5",
      "--muted-foreground": "#666666",
      "--secondary": "#eeeeee",
      "--border": "oklch(0.92 0 0)",
      "--input": "#888888",
      "--ring": "oklch(0.7 0 0)",
      "--focus": "#2222ff",
      "--destructive": "#cc0000",
      "--destructive-foreground": "#fffff0",
      "--success": "#00aa00",
      "--success-soft": "#eeffee",
      "--success-ink": "#003300",
      "--warning": "#ffaa00",
      "--warning-soft": "#fff5e0",
      "--warning-ink": "#332200",
      "--danger": "#dd0000",
      "--danger-soft": "#ffeeee",
      "--danger-ink": "#990000",
      "--info": "#0000dd",
      "--info-soft": "#eeeeff",
      "--info-ink": "#000099",
      "--radius": "0.5rem",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--shadow-1": "0 1px 2px #0001",
      "--shadow-2": "0 4px 8px #0002",
      "--shadow-3": "0 8px 24px #0003",
      "--scrim": "#0008",
      "--motion-fast": "100ms",
      "--motion-base": "200ms",
      "--motion-slow": "300ms",
      "--ease": "ease-in-out",
      "--font-sans": "Inter, sans-serif",
      "--font-mono": "JetBrains Mono, monospace",
      "--font-heading": "Sora, sans-serif",
      "--text-title": "2rem",
      "--text-section": "1.5rem",
      "--text-body": "1.0625rem",
      "--text-dense": "0.9375rem",
      "--text-small": "0.875rem",
    })
  })

  it("exposes every role of the role-token contract as a ThemeTokens field", () => {
    const mapped = new Set<string>(Object.values(TOKEN_TO_CSS_VAR))
    for (const role of ROLE_TOKENS) {
      expect(mapped.has(role), `${role} has no ThemeTokens field`).toBe(true)
    }
    expect(new Set(ROLE_TOKENS).size).toBe(ROLE_TOKENS.length)
  })

  it("emits only the variables for the fields that are set (partial tokens)", () => {
    expect(tokensToVars({ primary: "#6d28d9", radius: "0.75rem" })).toEqual({
      "--primary": "#6d28d9",
      "--radius": "0.75rem",
    })
  })

  it("returns an empty object for empty tokens", () => {
    expect(tokensToVars({})).toEqual({})
  })

  it("ignores empty-string values (treated as unset)", () => {
    expect(tokensToVars({ primary: "", accent: "#0ea5e9" })).toEqual({ "--accent": "#0ea5e9" })
  })

  it("ignores unknown fields passed loosely", () => {
    const loose = { primary: "#000", bogus: "nope" } as unknown as ThemeTokens
    expect(tokensToVars(loose)).toEqual({ "--primary": "#000" })
  })

  it("never emits a variable outside the documented mapping", () => {
    const vars = tokensToVars({
      primary: "#000",
      accent: "#111",
      fontHeading: "Sora",
    })
    const allowed = new Set(Object.values(TOKEN_TO_CSS_VAR))
    for (const key of Object.keys(vars)) {
      expect(allowed.has(key as (typeof TOKEN_TO_CSS_VAR)[keyof typeof TOKEN_TO_CSS_VAR])).toBe(
        true,
      )
    }
  })
})

describe("createTheme", () => {
  it("returns a serializable definition with vars and a toStyle helper", () => {
    const theme = createTheme({ primary: "#6d28d9", radius: "0.5rem" })
    expect(theme.vars).toEqual({ "--primary": "#6d28d9", "--radius": "0.5rem" })
    expect(theme.toStyle()).toEqual({
      "--primary": "#6d28d9",
      "--primary-hover": "color-mix(in srgb, #6d28d9 90%, transparent)",
      "--link": "#6d28d9",
      "--radius": "0.5rem",
      "--radius-sm": "calc(0.5rem * 0.5)",
      "--radius-md": "0.5rem",
      "--radius-lg": "calc(0.5rem * 4 / 3)",
    })
    expect(theme.darkVars).toBeUndefined()
  })

  it("toStyle applies what ThemeProvider applies in light mode (resolveThemeVars)", () => {
    const plain = createTheme({ background: "#fff", foreground: "#000" })
    expect(plain.toStyle()).toEqual(plain.vars)
    const legacy = createTheme({ primary: "#0f766e", ring: "#0f766e", radius: "0px" })
    expect(legacy.toStyle()).toEqual(resolveThemeVars(legacy, "light"))
  })

  it("toStyle reshapes rounded-sm/md/lg from a legacy base radius (square corners)", () => {
    const style = createTheme({ radius: "0px" }).toStyle() as Record<string, string>
    expect(style["--radius-md"]).toBe("0px")
    expect(style["--radius-sm"]).toBe("calc(0px * 0.5)")
    expect(style["--radius-lg"]).toBe("calc(0px * 4 / 3)")
  })

  it("maps dark token overrides to darkVars", () => {
    const theme = createTheme(
      { primary: "oklch(0.55 0.2 264)" },
      { dark: { primary: "oklch(0.7 0.18 264)", background: "oklch(0.16 0 0)" } },
    )
    expect(theme.vars).toEqual({ "--primary": "oklch(0.55 0.2 264)" })
    expect(theme.darkVars).toEqual({
      "--primary": "oklch(0.7 0.18 264)",
      "--background": "oklch(0.16 0 0)",
    })
  })

  it("omits darkVars when the dark override resolves to nothing", () => {
    const theme = createTheme({ primary: "#000" }, { dark: {} })
    expect(theme.darkVars).toBeUndefined()
  })

  it("supports empty light tokens (inherits everything from :root)", () => {
    const theme = createTheme({})
    expect(theme.vars).toEqual({})
    expect(theme.toStyle()).toEqual({})
  })
})

describe("resolveThemeVars (what a theme scope applies per mode — #178 N35)", () => {
  // Built inside each test (see fonts.test.ts): keeps mutants visible to it.
  const brand = () =>
    createTheme(
      { primary: "#0f766e", accent: "#ccfbf1", background: "#fafafa", fontSans: "Inter" },
      { dark: { accent: "#134e4a" } },
    )

  it("returns {} without a theme (the toolkit defaults apply)", () => {
    expect(resolveThemeVars(undefined, "light")).toEqual({})
    expect(resolveThemeVars(null, "dark")).toEqual({})
  })

  it("applies the light vars in light mode (plus what the legacy primary derives)", () => {
    expect(resolveThemeVars(brand(), "light")).toEqual({
      "--primary": "#0f766e",
      "--primary-hover": "color-mix(in srgb, #0f766e 90%, transparent)",
      "--link": "#0f766e",
      "--accent": "#ccfbf1",
      "--background": "#fafafa",
      "--font-sans": "Inter",
    })
  })

  it("never carries a mode-dependent light value into dark mode", () => {
    const dark = resolveThemeVars(brand(), "dark")
    // background is a surface: its light value would beat the toolkit's dark
    // default and put a light surface into a dark scope.
    expect(dark).not.toHaveProperty("--background")
    // accent comes from the theme's dark tokens.
    expect(dark["--accent"]).toBe("#134e4a")
  })

  it("carries mode-invariant light values (brand button colour, fonts) into dark mode", () => {
    expect(resolveThemeVars(brand(), "dark")).toEqual({
      "--primary": "#0f766e",
      "--primary-hover": "color-mix(in srgb, #0f766e 90%, transparent)",
      "--link": "#0f766e",
      "--font-sans": "Inter",
      "--accent": "#134e4a",
    })
  })

  it("lets a dark token override a carried mode-invariant one (and derives from it)", () => {
    const theme = createTheme({ primary: "#111111" }, { dark: { primary: "#eeeeee" } })
    expect(resolveThemeVars(theme, "dark")).toEqual({
      "--primary": "#eeeeee",
      "--primary-hover": "color-mix(in srgb, #eeeeee 90%, transparent)",
      "--link": "#eeeeee",
    })
  })

  it("applies only mode-invariant vars in dark mode when a theme has no dark tokens", () => {
    const theme = createTheme({
      primary: "#111111",
      primaryHover: "#222222",
      card: "#ffffff",
      link: "#0000ee",
    })
    expect(resolveThemeVars(theme, "dark")).toEqual({
      "--primary": "#111111",
      "--primary-hover": "#222222",
    })
  })

  it("derives the sm/md/lg radii from a legacy base radius in both modes", () => {
    const theme = createTheme({ radius: "8px" })
    const derived = {
      "--radius": "8px",
      "--radius-sm": "calc(8px * 0.5)",
      "--radius-md": "8px",
      "--radius-lg": "calc(8px * 4 / 3)",
    }
    expect(resolveThemeVars(theme, "light")).toEqual(derived)
    expect(resolveThemeVars(theme, "dark")).toEqual(derived)
  })

  it("keeps an explicit radius step over the derived one", () => {
    const theme = createTheme({ radius: "8px", radiusMd: "10px" })
    expect(resolveThemeVars(theme, "light")["--radius-md"]).toBe("10px")
    expect(resolveThemeVars(theme, "light")["--radius-sm"]).toBe("calc(8px * 0.5)")
  })

  it("derives nothing without a base radius", () => {
    const theme = createTheme({ radiusSm: "2px" })
    expect(resolveThemeVars(theme, "light")).toEqual({ "--radius-sm": "2px" })
  })

  it("derives hover and link from a legacy primary, and focus from a legacy ring", () => {
    const theme = createTheme({ primary: "#0f766e", ring: "#115e59" })
    expect(resolveThemeVars(theme, "light")).toEqual({
      "--primary": "#0f766e",
      "--primary-hover": "color-mix(in srgb, #0f766e 90%, transparent)",
      "--link": "#0f766e",
      "--ring": "#115e59",
      "--focus": "#115e59",
    })
  })

  it("never derives a role the theme sets itself, in either mode", () => {
    const theme = createTheme(
      { primary: "#0f766e", ring: "#115e59" },
      { dark: { primaryHover: "#99f6e4", link: "#5eead4", focus: "#5eead4" } },
    )
    // Set only in dark: light keeps the toolkit default for those roles.
    expect(resolveThemeVars(theme, "light")).toEqual({
      "--primary": "#0f766e",
      "--ring": "#115e59",
    })
    expect(resolveThemeVars(theme, "dark")).toEqual({
      "--primary": "#0f766e",
      "--primary-hover": "#99f6e4",
      "--link": "#5eead4",
      "--focus": "#5eead4",
    })
  })

  it("derives nothing for the interactive roles without primary or ring", () => {
    const theme = createTheme({ background: "#fafafa" }, { dark: { background: "#111111" } })
    expect(resolveThemeVars(theme, "light")).toEqual({ "--background": "#fafafa" })
    expect(resolveThemeVars(theme, "dark")).toEqual({ "--background": "#111111" })
  })

  it("classifies every mode-invariant var as a real theming variable", () => {
    const mapped = new Set<string>(Object.values(TOKEN_TO_CSS_VAR))
    for (const name of MODE_INVARIANT_VARS) {
      expect(mapped.has(name), `${name} is not a ThemeTokens variable`).toBe(true)
    }
  })
})
/* brand-lint-enable */
