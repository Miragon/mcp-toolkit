import { useLayoutEffect, type ReactNode } from "react"
import { ThemeProvider, bootstrapView, useHostContext } from "mcp-use/react"
import { adoptHostFontVariables } from "../theme/host-fonts.js"
import { McpAppView, type McpAppViewProps } from "./mcp-app-view.js"
import { McpUseHostBridgeProvider } from "./mcp-use-host-bridge.js"

/**
 * Keeps Geist first when the host sends its font. mcp-use's `ThemeProvider`
 * writes the host's SEP-1865 style variables inline on `<html>`, including
 * `--font-sans`/`--font-mono`, which share their names with the toolkit's font
 * roles and would replace the Geist-first stacks whole. This component sits
 * ABOVE that provider on purpose: a parent's layout effect runs after its
 * children's, so the host variables are already applied when it moves the
 * font pair into the fallback slot (`adoptHostFontVariables`). Both effects
 * key on the same host-context snapshot, so they run in the same commit.
 */
function HostFontRoles({ children }: { children: ReactNode }) {
  const { hostContext } = useHostContext()
  useLayoutEffect(() => {
    if (typeof document === "undefined") return
    adoptHostFontVariables(document.documentElement.style, hostContext?.styles?.variables)
  }, [hostContext])
  return children
}

/**
 * Consumer-facing root for a toolkit-rendered MCP App. Composes the mcp-use
 * 2.x view plumbing around `McpAppView`: `ThemeProvider` applies the host's
 * theme/style variables to the document (with the host's font kept behind
 * Geist, see `adoptHostFontVariables`), and `McpUseHostBridgeProvider`
 * installs the `HostBridge` (and view-scope flag) every toolkit widget below
 * resolves through `useHostBridge()`.
 *
 * Must render inside a `bootstrapView`-mounted tree — the mcp-use view hooks
 * throw outside one. Use {@link mountMcpToolkitApp} at the bundle entry point,
 * which wires exactly that; render `McpToolkitApp` directly only when
 * composing a custom view under your own `bootstrapView` call.
 */
export function McpToolkitApp(props: McpAppViewProps) {
  return (
    <HostFontRoles>
      <ThemeProvider>
        <McpUseHostBridgeProvider>
          <McpAppView {...props} />
        </McpUseHostBridgeProvider>
      </ThemeProvider>
    </HostFontRoles>
  )
}

/**
 * Mount the toolkit app as the document's MCP App view — the bundle entry
 * point since mcp-use 2.x.
 *
 * `bootstrapView` owns the mount: it connects the ext-apps postMessage bridge
 * to the host, installs an error boundary, and auto-reports size changes
 * (replacing 1.x's `createRoot` + `McpUseProvider` pair).
 *
 * ```tsx
 * // main.tsx of the widget bundle
 * mountMcpToolkitApp({ widgets })
 * ```
 */
export function mountMcpToolkitApp(props: McpAppViewProps): void {
  bootstrapView({ default: () => <McpToolkitApp {...props} /> })
}
