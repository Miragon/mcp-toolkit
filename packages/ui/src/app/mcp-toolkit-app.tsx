import { McpUseProvider } from "mcp-use/react"
import { McpAppView, type McpAppViewProps } from "./mcp-app-view.js"

/**
 * Consumer-facing root for a toolkit-rendered MCP App. Wraps `McpAppView`
 * in `McpUseProvider` so the host (Claude, ChatGPT Apps SDK) receives
 * intrinsic-height notifications and the widget auto-sizes inside the
 * host's inline container.
 *
 * Usage at the bundle entry point:
 *
 * ```tsx
 * createRoot(root).render(
 *   <McpToolkitApp widgets={widgets} widgetLoader={widgetLoader} />,
 * )
 * ```
 *
 * `McpUseProvider` also installs StrictMode, a default ErrorBoundary, and
 * the theme plumbing used by the toolkit primitives.
 */
export function McpToolkitApp(props: McpAppViewProps) {
  return (
    <McpUseProvider>
      <McpAppView {...props} />
    </McpUseProvider>
  )
}
