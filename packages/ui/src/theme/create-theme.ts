import type { CSSProperties } from "react"

/**
 * The toolkit's theming surface in plain, design-system terms: one optional
 * field per ROLE variable defined in `packages/ui/src/theme.css` (the role-token
 * contract, see {@link ROLE_TOKENS}), plus the legacy shadcn knobs it always had.
 *
 * The defaults are the Miragon theme — every role points at a vendored
 * `--cd-*` corporate-design token, in light and in dark. A brand overrides
 * only the roles it cares about and inherits the rest. Colour values are any
 * CSS colour string (`#rrggbb`, `oklch(...)`, `color-mix(...)`), lengths any
 * CSS length, fonts `font-family` lists, durations CSS times.
 *
 * Roles a component must never take from a host's palette — primary, link,
 * focus, the status tones and the input border — are brand decisions; a host
 * maps only the neutral roles (background, card, foreground, border, …).
 *
 * Unlisted variables (`--chart-*`, `--sidebar-*`, `--popover-foreground`, …)
 * stay themeable in CSS. See {@link TOKEN_TO_CSS_VAR} for the exact mapping.
 */
export interface ThemeTokens {
  /** Brand colour: primary button fill, selection. Maps to `--primary`. */
  primary?: string
  /** Text/icon colour on a `primary` surface. Maps to `--primary-foreground`. */
  primaryForeground?: string
  /**
   * Primary button fill on hover. Maps to `--primary-hover`. A theme that sets
   * `primary` but never `primaryHover` gets `primary` at 90 % (the pre-role
   * hover) from {@link resolveThemeVars}.
   */
  primaryHover?: string
  /**
   * Link and interactive text. Maps to `--link`. A theme that sets `primary`
   * but never `link` gets links in `primary` (the pre-role link colour).
   */
  link?: string
  /** Hover/selection highlight surface. Maps to `--accent`. */
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
  /** Menu, select and dialog surface. Maps to `--popover`. */
  popover?: string
  /** Quiet surface (table heads, skeletons, tab rails). Maps to `--muted`. */
  muted?: string
  /** Secondary text — must keep 4.5:1 on `muted`. Maps to `--muted-foreground`. */
  mutedForeground?: string
  /** Secondary button / badge surface. Maps to `--secondary`. */
  secondary?: string
  /** Decorative dividers and outlines (no contrast claim). Maps to `--border`. */
  border?: string
  /** Input border — must keep 3:1 on its surface. Maps to `--input`. */
  input?: string
  /** Legacy focus-ring colour (shadcn). Maps to `--ring`. */
  ring?: string
  /**
   * Focus ring and focused-input border, opaque, 3:1. Maps to `--focus`. A
   * theme that sets `ring` but never `focus` gets its focus ring in `ring`.
   */
  focus?: string
  /** Destructive action fill. Maps to `--destructive`. */
  destructive?: string
  /**
   * Text/icon colour on a `destructive` fill (white by default; keep 4.5:1).
   * Maps to `--destructive-foreground`.
   */
  destructiveForeground?: string
  /** Success colour — fill, dot, border, icon (never text on light). Maps to `--success`. */
  success?: string
  /** Success tint surface. Maps to `--success-soft`. */
  successSoft?: string
  /** Text colour of the success tone. Maps to `--success-ink`. */
  successInk?: string
  /** Warning colour — fill, dot, border, icon (never text on light). Maps to `--warning`. */
  warning?: string
  /** Warning tint surface. Maps to `--warning-soft`. */
  warningSoft?: string
  /** Text colour of the warning tone. Maps to `--warning-ink`. */
  warningInk?: string
  /** Danger colour — fill, dot, border, icon. Maps to `--danger`. */
  danger?: string
  /** Danger tint surface. Maps to `--danger-soft`. */
  dangerSoft?: string
  /** Text colour of the danger tone. Maps to `--danger-ink`. */
  dangerInk?: string
  /** Info colour — fill, dot, border, icon. Maps to `--info`. */
  info?: string
  /** Info tint surface. Maps to `--info-soft`. */
  infoSoft?: string
  /** Text colour of the info tone. Maps to `--info-ink`. */
  infoInk?: string
  /**
   * Base corner radius (the legacy shadcn knob). Drives `rounded-xl` and up;
   * applied through a theme ({@link ThemeProvider}, {@link resolveThemeVars}
   * or `toStyle()`) it also derives `radiusSm`/`radiusMd`/`radiusLg` when those
   * are not set. In plain CSS `--radius` no longer reshapes `rounded-sm/md/lg`:
   * set `--radius-sm`/`--radius-md`/`--radius-lg` there. Maps to `--radius`.
   */
  radius?: string
  /** Badges and chips. Maps to `--radius-sm` (`rounded-sm`). */
  radiusSm?: string
  /** The standard: buttons, inputs, cards, dialogs. Maps to `--radius-md` (`rounded-md`). */
  radiusMd?: string
  /** Large panels and tiles. Maps to `--radius-lg` (`rounded-lg`). */
  radiusLg?: string
  /** Pills and avatars. Maps to `--radius-pill` (`rounded-pill`). */
  radiusPill?: string
  /** Subtle elevation. Maps to `--shadow-1` (`shadow-1`). */
  shadow1?: string
  /** Cards, hovered primary buttons. Maps to `--shadow-2` (`shadow-2`). */
  shadow2?: string
  /** Popovers and dialogs. Maps to `--shadow-3` (`shadow-3`). */
  shadow3?: string
  /** Dialog/sheet backdrop. Maps to `--scrim` (`bg-scrim`). */
  scrim?: string
  /** Hover-speed transitions. Maps to `--motion-fast` (the default duration). */
  motionFast?: string
  /** Standard transitions. Maps to `--motion-base`. */
  motionBase?: string
  /** Large enter/leave transitions. Maps to `--motion-slow`. */
  motionSlow?: string
  /** Easing curve. Maps to `--ease` (the default timing function). */
  ease?: string
  /** Body font-family list. Maps to `--font-sans`. */
  fontSans?: string
  /** Code, ids and stack traces. Maps to `--font-mono`. */
  fontMono?: string
  /** Heading font-family list. Maps to `--font-heading`. */
  fontHeading?: string
}

/** The CSS custom-property name a {@link ThemeTokens} field resolves to. */
type CssVarName = `--${string}`

/**
 * The single source of truth mapping each {@link ThemeTokens} field to its real
 * CSS variable name in `theme.css`. `tokensToVars` walks this map, so adding a
 * field here (and to {@link ThemeTokens}) is all that is needed to extend the
 * public theming surface.
 */
export const TOKEN_TO_CSS_VAR = {
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  primaryHover: "--primary-hover",
  link: "--link",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  secondary: "--secondary",
  border: "--border",
  input: "--input",
  ring: "--ring",
  focus: "--focus",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  success: "--success",
  successSoft: "--success-soft",
  successInk: "--success-ink",
  warning: "--warning",
  warningSoft: "--warning-soft",
  warningInk: "--warning-ink",
  danger: "--danger",
  dangerSoft: "--danger-soft",
  dangerInk: "--danger-ink",
  info: "--info",
  infoSoft: "--info-soft",
  infoInk: "--info-ink",
  radius: "--radius",
  radiusSm: "--radius-sm",
  radiusMd: "--radius-md",
  radiusLg: "--radius-lg",
  radiusPill: "--radius-pill",
  shadow1: "--shadow-1",
  shadow2: "--shadow-2",
  shadow3: "--shadow-3",
  scrim: "--scrim",
  motionFast: "--motion-fast",
  motionBase: "--motion-base",
  motionSlow: "--motion-slow",
  ease: "--ease",
  fontSans: "--font-sans",
  fontMono: "--font-mono",
  fontHeading: "--font-heading",
} as const satisfies Record<keyof ThemeTokens, CssVarName>

/**
 * The role-token contract: every variable the toolkit defines for components
 * to use (`theme.css`), in light and — for colours — dark. Components in this
 * package, and in apps built on it, style through these names only, never
 * through raw colours or Tailwind palette classes.
 */
export const ROLE_TOKENS = [
  "--background",
  "--card",
  "--popover",
  "--muted",
  "--secondary",
  "--foreground",
  "--muted-foreground",
  "--border",
  "--input",
  "--primary",
  "--primary-foreground",
  "--primary-hover",
  "--link",
  "--ring",
  "--focus",
  "--success",
  "--warning",
  "--danger",
  "--info",
  "--success-soft",
  "--warning-soft",
  "--danger-soft",
  "--info-soft",
  "--success-ink",
  "--warning-ink",
  "--danger-ink",
  "--info-ink",
  "--destructive",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-pill",
  "--shadow-1",
  "--shadow-2",
  "--shadow-3",
  "--scrim",
  "--motion-fast",
  "--motion-base",
  "--motion-slow",
  "--ease",
  "--font-sans",
  "--font-mono",
] as const satisfies readonly CssVarName[]

/**
 * Variables whose toolkit value is the same in light and dark (theme.css
 * declares them once, or identically in both modes). A theme's LIGHT value for
 * one of these also applies in dark mode — a brand's button colour, radius or
 * font does not change with the mode. Every other variable (surfaces, text,
 * links, focus, status tones) takes its dark value from the theme's `dark`
 * tokens or, failing that, from the toolkit's dark defaults — never from the
 * light value, which would put light surfaces into a dark scope.
 * Pinned against theme.css by `theme-css.test.ts`.
 */
export const MODE_INVARIANT_VARS: ReadonlySet<CssVarName> = new Set<CssVarName>([
  "--primary",
  "--primary-foreground",
  "--primary-hover",
  "--destructive",
  "--destructive-foreground",
  "--input",
  "--radius",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-pill",
  "--shadow-1",
  "--shadow-2",
  "--shadow-3",
  "--motion-fast",
  "--motion-base",
  "--motion-slow",
  "--ease",
  "--font-sans",
  "--font-mono",
  "--font-heading",
])

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
  /** CSS variables applied at the theme scope in light mode (overrides `:root`). */
  vars: ThemeVars
  /** Dark-mode CSS variables, applied at the theme scope in dark mode. */
  darkVars?: ThemeVars
  /**
   * The theme's light-mode variables as a React `style` object (CSS custom
   * properties are valid `CSSProperties` keys): exactly what
   * {@link ThemeProvider} applies in light mode, i.e.
   * {@link resolveThemeVars}`(theme, "light")` — {@link vars} plus the values
   * derived from the legacy knobs (sm/md/lg from `radius`, …). Handy for
   * inlining onto a wrapper element without the provider; for dark mode use
   * {@link resolveThemeVars}`(theme, "dark")`.
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
   * Dark-mode token overrides. In dark mode a theme scope gets the toolkit's
   * dark defaults, the theme's mode-invariant light tokens (brand button
   * colour, radii, fonts — see {@link MODE_INVARIANT_VARS}) and these. Provide
   * what differs in dark — typically `background`, `card`, `link`.
   */
  dark?: ThemeTokens
}

/**
 * Build a serializable {@link ThemeDefinition} from a set of brand
 * {@link ThemeTokens}. This is the one switch a white-label client flips: pass
 * the brand's roles (and, optionally, dark overrides), and every toolkit
 * primitive that reads the role tokens — `Card`, `Button`, `Badge`, `bg-card`,
 * `text-link`, `rounded-md` — re-skins to match. Without a theme the toolkit
 * renders in the Miragon theme.
 *
 * Pure and side-effect-free: it only maps fields to CSS-variable names. Apply
 * the result with {@link ThemeProvider} (recommended) or by spreading
 * {@link resolveThemeVars}`(theme, mode)` onto a wrapper element.
 *
 * @example
 * const brand = createTheme(
 *   { primary: "#0f766e", link: "#0f766e", focus: "#0f766e", radiusMd: "6px" },
 *   { dark: { link: "#5eead4", focus: "#5eead4" } },
 * )
 * // <ThemeProvider theme={brand}>…</ThemeProvider>
 */
export function createTheme(tokens: ThemeTokens, opts?: CreateThemeOptions): ThemeDefinition {
  const vars = tokensToVars(tokens)
  const darkTokens = opts?.dark
  const darkVars = darkTokens ? tokensToVars(darkTokens) : undefined

  const theme: ThemeDefinition = {
    vars,
    ...(darkVars && Object.keys(darkVars).length > 0 ? { darkVars } : {}),
    toStyle: () => resolveThemeVars(theme, "light"),
  }
  return theme
}

/** Whether the theme sets `name` itself, in light or in dark. */
function declares(theme: ThemeDefinition, name: CssVarName): boolean {
  return name in theme.vars || (theme.darkVars !== undefined && name in theme.darkVars)
}

/**
 * Fill the roles a theme written against the pre-role API leaves unset, from
 * the knobs it does set, so it keeps ONE brand instead of half Miragon:
 *
 * - the base `--radius` reshapes the sm/md/lg steps (CI ratio 6 : 12 : 16);
 * - `--primary` gives `--primary-hover` (90 %, the old `bg-primary/90`) and
 *   `--link` (the old link button was `text-primary`);
 * - `--ring` gives `--focus` (the old focus ring).
 *
 * A role the theme sets itself — in either mode — is never derived, and an
 * explicit value always wins.
 */
function withDerivedVars(vars: ThemeVars, theme: ThemeDefinition): ThemeVars {
  const derived: ThemeVars = {}
  const radius = vars["--radius"]
  if (radius) {
    derived["--radius-sm"] = `calc(${radius} * 0.5)`
    derived["--radius-md"] = radius
    derived["--radius-lg"] = `calc(${radius} * 4 / 3)`
  }
  const primary = vars["--primary"]
  if (primary && !declares(theme, "--primary-hover")) {
    derived["--primary-hover"] = `color-mix(in srgb, ${primary} 90%, transparent)`
  }
  if (primary && !declares(theme, "--link")) derived["--link"] = primary
  const ring = vars["--ring"]
  if (ring && !declares(theme, "--focus")) derived["--focus"] = ring
  return { ...derived, ...vars }
}

/**
 * The CSS variables a theme applies at its scope in `mode`. Light mode: the
 * theme's `vars`. Dark mode: its mode-invariant light vars plus its `darkVars`
 * — never the other light vars, which would beat the toolkit's dark defaults
 * (mcp-toolkit#178 N35). Both modes add what the legacy knobs derive (a base
 * `--radius` → sm/md/lg; `--primary` → hover and link; `--ring` → focus)
 * where the theme does not set those roles itself.
 * `null`/`undefined` yields `{}` (the toolkit defaults apply).
 */
export function resolveThemeVars(
  theme: ThemeDefinition | null | undefined,
  mode: "light" | "dark",
): ThemeVars {
  if (!theme) return {}
  if (mode === "light") return withDerivedVars(theme.vars, theme)
  const carried: ThemeVars = {}
  for (const [name, value] of Object.entries(theme.vars) as [CssVarName, string][]) {
    if (MODE_INVARIANT_VARS.has(name)) carried[name] = value
  }
  return withDerivedVars({ ...carried, ...theme.darkVars }, theme)
}
