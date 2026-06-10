/**
 * Shared `_meta.ui` shapes for the SEP-1865 tool-visibility convention.
 *
 * Browser-bundle-safe: this module is a pure object/function with no
 * `mcp-use/server` or `node:*` imports, so it can be re-exported from the core
 * Root barrel and consumed by UI bundles as well as server registrars.
 *
 * SEP-1865 (`_meta.ui.visibility`): conforming MCP hosts hide tools marked
 * `visibility: ["app"]` from the LLM's `tools/list` while keeping them callable
 * from inside a widget iframe via `callTool`. Non-conforming hosts ignore the
 * marker and fall back to the tool description.
 */

/**
 * App-only marker — hides a tool from the LLM tool surface while leaving it
 * callable from widgets. Deliberately carries no `resourceUri`: app-only tools
 * (`*_data` feeds, catalogue/refresh hooks) return JSON, they do not render UI.
 */
export const APP_ONLY_META = { ui: { visibility: ["app"] } } as const

/** Options for {@link uiMeta}. */
export interface UiMetaOptions {
  /**
   * The MCP UI resource URI hosting the widget bundle. When set, the host
   * renders the tool result into that resource instead of returning it.
   */
  resourceUri?: string
  /** When `true`, marks the tool app-only via SEP-1865 `visibility: ["app"]`. */
  appOnly?: boolean
}

/**
 * Builds the `_meta.ui` object for a tool from a {@link UiMetaOptions}, keeping
 * the SEP-1865 visibility / resourceUri literals in one place. Omitted fields
 * are left off entirely so the emitted `_meta` matches the hand-written
 * literals it replaces.
 */
export function uiMeta(opts: UiMetaOptions): { ui: Record<string, unknown> } {
  const ui: Record<string, unknown> = {}
  if (opts.resourceUri !== undefined) ui.resourceUri = opts.resourceUri
  if (opts.appOnly) ui.visibility = ["app"]
  return { ui }
}
