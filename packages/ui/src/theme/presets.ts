import { createTheme, type ThemeDefinition } from "./create-theme.js"

/**
 * Ready-made white-label themes — a demonstration of {@link createTheme} and a
 * starting point a client can fork. Each preset sets a distinct brand `primary`,
 * a matching `ring`/`accent`, and a `radius`, plus a `dark` override that
 * brightens the brand colour for legibility on dark surfaces (mirroring how
 * `globals.css` brightens tokens under `.dark`).
 *
 * Colours are authored in `oklch` to stay consistent with the toolkit's token
 * palette in `globals.css`. Apply one with `<ThemeProvider theme={themePresets.violet}>`.
 */
export const themePresets = {
  /**
   * The toolkit's own brand: a confident indigo-blue with a slightly tighter
   * radius. A sensible default when a client has no brand of their own yet.
   */
  miragon: createTheme(
    {
      primary: "oklch(0.52 0.21 264)",
      primaryForeground: "oklch(0.985 0 0)",
      accent: "oklch(0.95 0.03 264)",
      accentForeground: "oklch(0.32 0.12 264)",
      ring: "oklch(0.52 0.21 264)",
      radius: "0.5rem",
    },
    {
      dark: {
        primary: "oklch(0.7 0.16 264)",
        primaryForeground: "oklch(0.18 0.02 264)",
        accent: "oklch(0.32 0.06 264)",
        accentForeground: "oklch(0.97 0 0)",
        ring: "oklch(0.7 0.16 264)",
      },
    },
  ),

  /** A vivid violet brand with rounder corners — playful, consumer-facing. */
  violet: createTheme(
    {
      primary: "oklch(0.55 0.24 295)",
      primaryForeground: "oklch(0.985 0 0)",
      accent: "oklch(0.95 0.04 295)",
      accentForeground: "oklch(0.34 0.14 295)",
      ring: "oklch(0.55 0.24 295)",
      radius: "0.875rem",
    },
    {
      dark: {
        primary: "oklch(0.72 0.18 295)",
        primaryForeground: "oklch(0.18 0.03 295)",
        accent: "oklch(0.33 0.08 295)",
        accentForeground: "oklch(0.97 0 0)",
        ring: "oklch(0.72 0.18 295)",
      },
    },
  ),

  /** A grounded emerald brand with a crisp, near-square radius — enterprise. */
  emerald: createTheme(
    {
      primary: "oklch(0.58 0.15 162)",
      primaryForeground: "oklch(0.985 0 0)",
      accent: "oklch(0.95 0.04 162)",
      accentForeground: "oklch(0.34 0.1 162)",
      ring: "oklch(0.58 0.15 162)",
      radius: "0.375rem",
    },
    {
      dark: {
        primary: "oklch(0.72 0.15 162)",
        primaryForeground: "oklch(0.17 0.03 162)",
        accent: "oklch(0.32 0.07 162)",
        accentForeground: "oklch(0.97 0 0)",
        ring: "oklch(0.72 0.15 162)",
      },
    },
  ),
} satisfies Record<string, ThemeDefinition>

/** The id of a built-in preset in {@link themePresets}. */
export type ThemePresetId = keyof typeof themePresets
