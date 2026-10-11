import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { resolveThemeVars, type ThemeDefinition } from "./create-theme.js"
import { PortalContainerContext } from "./portal-container.js"

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
   * The white-label theme to apply (from {@link createTheme}). Omit to keep the
   * theme of the nearest enclosing `ThemeProvider` (re-applied in this
   * provider's mode, so a light island inside a dark branded scope stays on
   * the brand), or, at the top, to manage only the light/dark `mode` against
   * the toolkit defaults (the Miragon theme).
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
 * the toolkit's defaults (the Miragon theme) for every descendant — `Card`,
 * `Button`, `bg-card`, `text-link`, and `rounded-md` all re-skin without
 * touching the widgets.
 *
 * Dark mode is handled at the scope: the `.dark` class and `data-theme-mode`
 * are set on the wrapper (not `<html>`) per the resolved {@link ThemeMode}. In
 * dark mode the wrapper gets the toolkit's dark roles plus the theme's dark
 * tokens and its mode-invariant light tokens ({@link resolveThemeVars}) — a
 * light surface colour never leaks into a dark scope (mcp-toolkit#178 N35). A
 * light scope inside a dark scope stays light: there, `data-theme-mode="light"`
 * re-declares the toolkit's light roles. A light scope in a light document
 * re-declares nothing and keeps what the document set (a consumer's `:root`
 * brand). A nested provider without `theme` re-applies the enclosing one's
 * theme in its own mode. This keeps theming local — two differently themed
 * subtrees (e.g. a brand preview gallery) coexist on one page.
 *
 * Overlays opened inside the scope (Dialog, Sheet, Select) portal into a node
 * within it, so they wear the same theme and mode (#178 N36,
 * {@link usePortalContainer}). That node is the wrapper's FIRST child, an empty
 * `display: contents` element: it draws no box, and `space-*`, `divide-*`,
 * `gap` and `last:` on the wrapper see only your children. Only selectors on
 * the wrapper's first/nth child (`first:`, `odd:`) count it.
 *
 * Uses only React + the DOM (no `mcp-use/react`), so it ships from the root
 * barrel and works in a host-free standalone app, a host, or SSR alike.
 *
 * @example
 * <ThemeProvider theme={brand} mode={host.theme ?? "system"}>
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
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  // Without its own theme a nested provider keeps the enclosing one's brand.
  const enclosing = useContext(ThemeContext)
  const activeTheme = theme ?? enclosing?.theme ?? null

  const style = useMemo<CSSProperties>(
    () => resolveThemeVars(activeTheme, resolvedMode),
    [activeTheme, resolvedMode],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: activeTheme, mode, resolvedMode }),
    [activeTheme, mode, resolvedMode],
  )

  const classes = [
    isDark ? "dark" : undefined,
    "bg-background text-foreground font-sans",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  // The portal node OPENS the scope as an empty `display: contents` element:
  // it draws no box, yet overlays portaled into it inherit the scope's
  // variables and its `.dark` / `data-theme-mode`. First, not last: Tailwind's
  // `space-*`/`divide-*` and `last:` target the last child, so a trailing node
  // would hand the real last child a margin or divider it never had.
  const PortalRoot = As === "span" ? "span" : "div"

  return (
    <ThemeContext.Provider value={value}>
      <PortalContainerContext.Provider value={portalContainer}>
        <As className={classes} style={style} data-theme-mode={resolvedMode}>
          <PortalRoot
            ref={setPortalContainer}
            data-slot="theme-portal"
            style={{ display: "contents" }}
          />
          {children}
        </As>
      </PortalContainerContext.Provider>
    </ThemeContext.Provider>
  )
}
