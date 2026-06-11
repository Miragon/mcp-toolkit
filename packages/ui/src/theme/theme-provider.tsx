import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import type { ThemeDefinition } from "./create-theme.js"

/**
 * How the `.dark` class is resolved on the theme scope:
 * - `"light"` / `"dark"` — forced, ignores the OS preference.
 * - `"system"` — follows `prefers-color-scheme` via `matchMedia`, updating live.
 *
 * A host that already knows the colour scheme (e.g. `HostBridge.theme`) can pass
 * its value straight through as `mode` so the white-label theme tracks the host.
 */
export type ThemeMode = "light" | "dark" | "system"

/** The value exposed by {@link useTheme}. */
export interface ThemeContextValue {
  /** The active theme definition, or `null` when only a mode is being managed. */
  theme: ThemeDefinition | null
  /** The mode as requested on the provider (may be `"system"`). */
  mode: ThemeMode
  /** The mode actually applied right now (`"system"` resolved to light/dark). */
  resolvedMode: "light" | "dark"
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Read the active theme/mode from the nearest {@link ThemeProvider}. Throws when
 * called outside a provider so a missing wrapper fails loudly rather than
 * silently rendering the default theme.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error("useTheme() must be used within a <ThemeProvider>.")
  }
  return value
}

/**
 * Resolve `"system"` to a concrete `"light"` | `"dark"` and keep it in sync with
 * the OS preference. SSR-safe: returns `"light"` until mounted (no `window`),
 * then subscribes to `matchMedia` on the client. Forced modes short-circuit the
 * media query entirely.
 */
function useResolvedMode(mode: ThemeMode): "light" | "dark" {
  const [systemMode, setSystemMode] = useState<"light" | "dark">("light")

  useEffect(() => {
    if (mode !== "system") return
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => {
      setSystemMode(query.matches ? "dark" : "light")
    }
    sync()
    query.addEventListener("change", sync)
    return () => {
      query.removeEventListener("change", sync)
    }
  }, [mode])

  return mode === "system" ? systemMode : mode
}

/** Props for {@link ThemeProvider}. */
export interface ThemeProviderProps {
  /**
   * The white-label theme to apply (from {@link createTheme} or `themePresets`).
   * Omit to manage only the light/dark `mode` against the toolkit defaults.
   */
  theme?: ThemeDefinition
  /**
   * Colour-scheme mode. Defaults to `"light"`. Pass `HostBridge.theme` through
   * here to follow the host, or `"system"` to track the OS preference.
   */
  mode?: ThemeMode
  /**
   * The HTML element to render as the scope wrapper. Defaults to `"div"`. Use
   * `"span"` for inline contexts; any intrinsic element with a `style`/className
   * works.
   */
  as?: "div" | "span" | "section" | "main"
  /** Extra classes merged onto the scope wrapper. */
  className?: string
  children: ReactNode
}

/**
 * Apply a white-label {@link ThemeDefinition} to a subtree. Renders a wrapper
 * element carrying the theme's CSS variables as inline `style`, so they override
 * the `:root` defaults for every descendant — `Card`, `Button`, `bg-card`,
 * `text-primary`, and `rounded-lg` all re-skin without touching the widgets.
 *
 * Dark mode is handled at the scope: the `.dark` class is toggled on the wrapper
 * (not `<html>`) per the resolved {@link ThemeMode}, and the theme's `darkVars`
 * are layered on under it. This keeps theming local — two differently themed
 * subtrees (e.g. a brand preview gallery) coexist on one page.
 *
 * Uses only React + the DOM (no `mcp-use/react`), so it ships from the root
 * barrel and works in a host-free standalone app, a host, or SSR alike.
 *
 * @example
 * <ThemeProvider theme={themePresets.violet} mode={host.theme ?? "system"}>
 *   <YourWidget />
 * </ThemeProvider>
 */
export function ThemeProvider({
  theme,
  mode = "light",
  as: As = "div",
  className,
  children,
}: ThemeProviderProps): ReactNode {
  const resolvedMode = useResolvedMode(mode)
  const isDark = resolvedMode === "dark"

  // Merge the light vars with the dark overrides only when dark is active, so a
  // dark scope gets the brand's dark palette on top of `.dark`'s defaults.
  const style = useMemo<CSSProperties>(() => {
    if (!theme) return {}
    if (isDark && theme.darkVars) {
      return { ...theme.vars, ...theme.darkVars }
    }
    return theme.vars
  }, [theme, isDark])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: theme ?? null, mode, resolvedMode }),
    [theme, mode, resolvedMode],
  )

  const classes = [isDark ? "dark" : undefined, "bg-background text-foreground", className]
    .filter(Boolean)
    .join(" ")

  return (
    <ThemeContext.Provider value={value}>
      <As className={classes} style={style} data-theme-mode={resolvedMode}>
        {children}
      </As>
    </ThemeContext.Provider>
  )
}
