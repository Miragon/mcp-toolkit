import { createContext, useContext } from "react"

/**
 * The element portaled overlays (Dialog, Sheet, Select) render into. A
 * {@link ThemeProvider} provides a node INSIDE its scope, so overlays opened
 * from a themed subtree keep the theme's variables and its light/dark mode
 * instead of falling back to `document.body` and the `:root` defaults
 * (mcp-toolkit#178 N36). `null` — no provider, or before it mounted — means
 * the overlay library's default (`document.body`).
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null)

/**
 * The portal container of the nearest {@link ThemeProvider}, or `null`. Pass it
 * as `container` to a portal of your own so it stays inside the theme scope;
 * the toolkit's Dialog, Sheet and Select already do.
 */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext)
}
