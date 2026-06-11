import type { CSSProperties } from "react"

/**
 * A curated, brand-relevant subset of the toolkit's CSS-variable theming
 * surface (the full set lives in `packages/ui/src/globals.css`). These are the
 * tokens a white-label client almost always wants to change — the brand colour
 * pair, the surface/accent colours, the border/ring, and the shape/typography
 * knobs — expressed in plain, design-system terms.
 *
 * Every field is **optional**: a theme overrides only the tokens it cares about
 * and inherits the rest from the toolkit defaults (`:root` / `.dark`). Colour
 * values are any valid CSS colour string (`oklch(...)`, `#rrggbb`, `hsl(...)`),
 * `radius` is any CSS length (e.g. `"0.5rem"`), and the font fields are CSS
 * `font-family` lists.
 *
 * Unlisted CSS variables (`--popover`, `--chart-*`, `--sidebar-*`, …) are
 * intentionally out of scope here: they are part of the theming surface but not
 * the brand essentials, so a client tunes them by hand in CSS when needed. See
 * {@link TOKEN_TO_CSS_VAR} for the exact field → variable mapping.
 */
export interface ThemeTokens {
  /** Brand colour. Maps to `--primary`. */
  primary?: string
  /** Text/icon colour on a `primary` surface. Maps to `--primary-foreground`. */
  primaryForeground?: string
  /** Accent colour for subtle highlights. Maps to `--accent`. */
  accent?: string
  /** Text colour on an `accent` surface. Maps to `--accent-foreground`. */
  accentForeground?: string
  /** App/page background. Maps to `--background`. */
  background?: string
  /** Default text colour. Maps to `--foreground`. */
  foreground?: string
  /** Card/panel surface. Maps to `--card`. */
  card?: string
  /** Text colour on a `card` surface. Maps to `--card-foreground`. */
  cardForeground?: string
  /** Border colour for dividers/outlines. Maps to `--border`. */
  border?: string
  /** Focus-ring colour. Maps to `--ring`. */
  ring?: string
  /** Base corner radius (a CSS length). Maps to `--radius`. */
  radius?: string
  /** Body font-family list. Maps to `--font-sans`. */
  fontSans?: string
  /** Heading font-family list. Maps to `--font-heading`. */
  fontHeading?: string
}

/** The CSS custom-property name a {@link ThemeTokens} field resolves to. */
type CssVarName = `--${string}`

/**
 * The single source of truth mapping each curated {@link ThemeTokens} field to
 * its real CSS variable name from `globals.css`. `tokensToVars` walks this map,
 * so adding a field here (and to {@link ThemeTokens}) is all that is needed to
 * extend the public theming surface.
 */
export const TOKEN_TO_CSS_VAR = {
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  border: "--border",
  ring: "--ring",
  radius: "--radius",
  fontSans: "--font-sans",
  fontHeading: "--font-heading",
} as const satisfies Record<keyof ThemeTokens, CssVarName>

/** A serializable map of CSS custom properties (`--primary` → value). */
export type ThemeVars = Record<CssVarName, string>

/**
 * A resolved, serializable theme: the CSS variables to apply at light scope,
 * the optional dark-mode overrides, and a small helper to turn the light vars
 * into a React `style` object.
 *
 * The struct is plain data (no functions on the wire except {@link toStyle},
 * which is derived from `vars`) so it can be passed to a server component,
 * logged, or persisted and rehydrated.
 */
export interface ThemeDefinition {
  /** CSS variables applied at the theme scope (overrides `:root`). */
  vars: ThemeVars
  /** Dark-mode CSS variables, applied under `.dark` at the theme scope. */
  darkVars?: ThemeVars
  /**
   * The light {@link vars} as a React `style` object (CSS custom properties are
   * valid `CSSProperties` keys). Handy for inlining onto a wrapper element
   * without the {@link ThemeProvider}.
   */
  toStyle(): CSSProperties
}

/**
 * Map a {@link ThemeTokens} object to its CSS variables. Empty/partial token
 * objects yield only the variables that were set; fields not present in
 * {@link TOKEN_TO_CSS_VAR} (e.g. an unknown key passed loosely) are ignored.
 */
export function tokensToVars(tokens: ThemeTokens): ThemeVars {
  const vars: ThemeVars = {}
  for (const [field, cssVar] of Object.entries(TOKEN_TO_CSS_VAR) as [
    keyof ThemeTokens,
    CssVarName,
  ][]) {
    const value = tokens[field]
    if (typeof value === "string" && value.length > 0) {
      vars[cssVar] = value
    }
  }
  return vars
}

/** Options for {@link createTheme}. */
export interface CreateThemeOptions {
  /**
   * Dark-mode token overrides. Applied on top of the toolkit's `.dark` defaults
   * when the active mode is dark (see {@link ThemeProvider}). Provide only the
   * tokens that differ from light — typically a darker `background`/`card` and a
   * brighter `primary`.
   */
  dark?: ThemeTokens
}

/**
 * Build a serializable {@link ThemeDefinition} from a curated set of brand
 * {@link ThemeTokens}. This is the one switch a white-label client flips: pass
 * your brand's primary colour, radius, and (optionally) dark overrides, and
 * every toolkit primitive that reads the design tokens — `Card`, `Button`,
 * `Badge`, `bg-card`, `text-primary`, `rounded-lg` — re-skins to match.
 *
 * Pure and side-effect-free: it only maps fields to CSS-variable names. Apply
 * the result with {@link ThemeProvider} (recommended) or by spreading
 * `theme.toStyle()` onto a wrapper element.
 *
 * @example
 * const brand = createTheme(
 *   { primary: "oklch(0.55 0.2 264)", radius: "0.5rem" },
 *   { dark: { primary: "oklch(0.7 0.18 264)" } },
 * )
 * // <ThemeProvider theme={brand}>…</ThemeProvider>
 */
export function createTheme(tokens: ThemeTokens, opts?: CreateThemeOptions): ThemeDefinition {
  const vars = tokensToVars(tokens)
  const darkTokens = opts?.dark
  const darkVars = darkTokens ? tokensToVars(darkTokens) : undefined

  return {
    vars,
    ...(darkVars && Object.keys(darkVars).length > 0 ? { darkVars } : {}),
    toStyle: () => vars,
  }
}
