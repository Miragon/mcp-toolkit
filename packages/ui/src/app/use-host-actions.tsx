import { useCallback } from "react"
import { useHostBridge } from "./host-bridge.js"

export interface HostActions {
  /**
   * Open an external URL in a new browser tab via the host bridge
   * (`bridge.openLink` / `window.openai.openExternal`). Works inside the
   * sandboxed iframe where raw `window.open` is blocked. Falls back to
   * `window.open` only when no MCP host bridge is available (dev preview).
   */
  openLink: (url: string) => void
  /**
   * Ask the host to render another tool's widget by sending a follow-up
   * user message into the conversation (`bridge.sendMessage` /
   * `window.openai.sendFollowUpMessage`). The agent interprets the prompt
   * and invokes the matching tool, whose widget then appears as the next
   * chat turn — the proper MCP-Apps pattern for in-widget navigation.
   *
   * The prompt should be natural language and include enough hints
   * (preferably the tool name in parentheses) for the agent to pick the
   * right tool unambiguously.
   */
  showWidget: (prompt: string) => void
  /**
   * Hand an open-ended, judgment task to the agent in the conversation
   * (`sendFollowUpMessage`) — root-cause analysis, "explain this", migration
   * planning, ticket drafting. Same bridge as {@link HostActions.showWidget}
   * but a distinct affordance: this crosses the UI→chat boundary deliberately,
   * for things the deterministic UI cannot do. The prompt should be
   * self-contained — inline the relevant IDs/keys rather than relying on
   * ambient ModelContext alone.
   */
  askAi: (prompt: string) => void
}

/**
 * Builds the natural-language intent string passed to {@link HostActions.showWidget}.
 * The host agent reads the trailing `(use <toolName>)` hint to pick the right
 * tool unambiguously. Centralised so every in-widget navigation handoff phrases
 * the hint identically (and a tool rename only has to flow through the imported
 * `*_SHOW_*` tool-name constant).
 *
 * @example host.showWidget(buildShowWidgetIntent(SHOW_PROCESS_DETAIL, `Show the process detail for \`${key}\``))
 */
export function buildShowWidgetIntent(toolName: string, description: string): string {
  return `${description} (use ${toolName})`
}

/**
 * Bridge-aware host actions for widgets. A thin, intent-named facade over
 * {@link useHostBridge}: `openLink` → `bridge.openExternal`, and both
 * `showWidget` and `askAi` → `bridge.sendFollowup` (kept as two affordances
 * because they cross the UI→chat boundary for different reasons — see above).
 *
 * Relationship to {@link useHostBridge}: this hook resolves the active bridge
 * through `useHostBridge()`, so it uses whatever the nearest
 * `HostBridgeProvider` supplies — the toolkit shell installs the `mcp-use`
 * bridge via `McpUseHostBridgeProvider`, ChatGPT / standalone mounts wrap
 * their root themselves — and, like `useHostBridge`, it throws when no
 * provider is present. Prefer `useHostBridge` directly in new portable
 * widgets; `useHostActions` stays for its named affordances.
 */
export function useHostActions(): HostActions {
  const bridge = useHostBridge()

  const openLink = useCallback(
    (url: string) => {
      bridge.openExternal(url)
    },
    [bridge],
  )

  const showWidget = useCallback(
    (prompt: string) => {
      bridge.sendFollowup(prompt)
    },
    [bridge],
  )

  const askAi = useCallback(
    (prompt: string) => {
      bridge.sendFollowup(prompt)
    },
    [bridge],
  )

  return { openLink, showWidget, askAi }
}
