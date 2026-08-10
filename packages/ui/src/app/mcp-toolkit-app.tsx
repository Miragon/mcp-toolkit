import { ThemeProvider, bootstrapView } from "mcp-use/react"
import { McpAppView, type McpAppViewProps } from "./mcp-app-view.js"
import { McpUseHostBridgeProvider } from "./mcp-use-host-bridge.js"

/**
 * Consumer-facing root for a toolkit-rendered MCP App. Composes the mcp-use
 * 2.x view plumbing around `McpAppView`: `ThemeProvider` applies the host's
 * theme/style variables to the document, and `McpUseHostBridgeProvider`
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
    <ThemeProvider>
      <McpUseHostBridgeProvider>
        <McpAppView {...props} />
      </McpUseHostBridgeProvider>
    </ThemeProvider>
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
