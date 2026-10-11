import { createTheme, type ThemeDefinition } from "./create-theme.js"

/**
 * Ready-made white-label themes — a demonstration of {@link createTheme} and a
 * starting point a client can fork. Each preset sets its whole interactive
 * family from one brand hue, in light AND dark: `primary` with its
 * `primaryForeground` and `primaryHover`, `link`, `focus` (plus the legacy
 * `ring`), a matching `accent`, and a `radius`. The dark side brightens the
 * brand colour for legibility on dark surfaces. Every preset meets the same
 * contrast bar as the default theme in both modes (`theme-css.test.ts`).
 *
 * The toolkit's DEFAULT is the Miragon theme (theme.css, built on the vendored
 * corporate-design tokens); it needs no preset. A full customer brand may set
 * more roles than these presets do (the status `*Ink` colours); see
 * docs/guides/white-labeling.md. Apply one with
 * `<ThemeProvider theme={themePresets.emerald}>`.
 */
export const themePresets = {
  /**
   * An approximation of the Miragon blue from before the toolkit shipped the
   * Miragon corporate design.
   *
   * @deprecated The Miragon theme is now the toolkit's default: render without
   * a theme (or `<ThemeProvider>` without `theme`) to get the exact CI values.
   * This preset is off-palette and will be removed in the next major.
   */
  miragon: createTheme(
    {
      primary: "oklch(0.52 0.21 264)",
      primaryForeground: "oklch(0.985 0 0)",
      primaryHover: "oklch(0.46 0.2 264)",
      link: "oklch(0.52 0.21 264)",
      focus: "oklch(0.52 0.21 264)",
      accent: "oklch(0.95 0.03 264)",
      accentForeground: "oklch(0.32 0.12 264)",
      ring: "oklch(0.52 0.21 264)",
      radius: "0.5rem",
    },
    {
      dark: {
        primary: "oklch(0.7 0.16 264)",
        primaryForeground: "oklch(0.18 0.02 264)",
        primaryHover: "oklch(0.76 0.13 264)",
        link: "oklch(0.7 0.16 264)",
        focus: "oklch(0.7 0.16 264)",
        accent: "oklch(0.32 0.06 264)",
        accentForeground: "oklch(0.97 0 0)",
        ring: "oklch(0.7 0.16 264)",
      },
    },
  ),

  /**
   * A vivid violet brand with rounder corners — playful, consumer-facing.
   *
   * @deprecated The violet tech default is the look the Miragon design system
   * rules out (anti-slop U9). Fork {@link createTheme} with your own brand
   * values instead. Will be removed in the next major.
   */
  violet: createTheme(
    {
      primary: "oklch(0.55 0.24 295)",
      primaryForeground: "oklch(0.985 0 0)",
      primaryHover: "oklch(0.49 0.23 295)",
      link: "oklch(0.55 0.24 295)",
      focus: "oklch(0.55 0.24 295)",
      accent: "oklch(0.95 0.04 295)",
      accentForeground: "oklch(0.34 0.14 295)",
      ring: "oklch(0.55 0.24 295)",
      radius: "0.875rem",
    },
    {
      dark: {
        primary: "oklch(0.72 0.18 295)",
        primaryForeground: "oklch(0.18 0.03 295)",
        primaryHover: "oklch(0.78 0.15 295)",
        link: "oklch(0.72 0.18 295)",
        focus: "oklch(0.72 0.18 295)",
        accent: "oklch(0.33 0.08 295)",
        accentForeground: "oklch(0.97 0 0)",
        ring: "oklch(0.72 0.18 295)",
      },
    },
  ),

  /** A grounded emerald brand with a crisp, near-square radius — enterprise. */
  emerald: createTheme(
    {
      primary: "oklch(0.5 0.12 162)",
      primaryForeground: "oklch(0.985 0 0)",
      primaryHover: "oklch(0.44 0.11 162)",
      link: "oklch(0.5 0.12 162)",
      focus: "oklch(0.5 0.12 162)",
      accent: "oklch(0.95 0.04 162)",
      accentForeground: "oklch(0.34 0.1 162)",
      ring: "oklch(0.5 0.12 162)",
      radius: "0.375rem",
    },
    {
      dark: {
        primary: "oklch(0.72 0.15 162)",
        primaryForeground: "oklch(0.17 0.03 162)",
        primaryHover: "oklch(0.78 0.14 162)",
        link: "oklch(0.72 0.15 162)",
        focus: "oklch(0.72 0.15 162)",
        accent: "oklch(0.32 0.07 162)",
        accentForeground: "oklch(0.97 0 0)",
        ring: "oklch(0.72 0.15 162)",
      },
    },
  ),
} satisfies Record<string, ThemeDefinition>

/** The id of a built-in preset in {@link themePresets}. */
export type ThemePresetId = keyof typeof themePresets
