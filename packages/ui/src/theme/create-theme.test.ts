import { describe, expect, it } from "vitest"
import { TOKEN_TO_CSS_VAR, createTheme, tokensToVars, type ThemeTokens } from "./create-theme.js"

describe("tokensToVars (token → CSS-var mapping)", () => {
  it("maps every curated token to its real CSS variable name", () => {
    const full: Required<ThemeTokens> = {
      primary: "oklch(0.55 0.2 264)",
      primaryForeground: "oklch(0.99 0 0)",
      accent: "oklch(0.95 0.03 264)",
      accentForeground: "oklch(0.3 0.1 264)",
      background: "#ffffff",
      foreground: "#101010",
      card: "hsl(0 0% 100%)",
      cardForeground: "hsl(0 0% 6%)",
      border: "oklch(0.92 0 0)",
      ring: "oklch(0.7 0 0)",
      radius: "0.5rem",
      fontSans: "Inter, sans-serif",
      fontHeading: "Sora, sans-serif",
    }
    expect(tokensToVars(full)).toEqual({
      "--primary": "oklch(0.55 0.2 264)",
      "--primary-foreground": "oklch(0.99 0 0)",
      "--accent": "oklch(0.95 0.03 264)",
      "--accent-foreground": "oklch(0.3 0.1 264)",
      "--background": "#ffffff",
      "--foreground": "#101010",
      "--card": "hsl(0 0% 100%)",
      "--card-foreground": "hsl(0 0% 6%)",
      "--border": "oklch(0.92 0 0)",
      "--ring": "oklch(0.7 0 0)",
      "--radius": "0.5rem",
      "--font-sans": "Inter, sans-serif",
      "--font-heading": "Sora, sans-serif",
    })
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
    expect(theme.toStyle()).toEqual({ "--primary": "#6d28d9", "--radius": "0.5rem" })
    expect(theme.darkVars).toBeUndefined()
  })

  it("toStyle mirrors vars (CSS custom properties as a style object)", () => {
    const theme = createTheme({ background: "#fff", foreground: "#000" })
    expect(theme.toStyle()).toEqual(theme.vars)
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
