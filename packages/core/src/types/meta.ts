/**
 * Shared `_meta` shapes for widget tools: the SEP-1865 tool-visibility
 * convention plus the dual-protocol widget contract (MCP Apps + OpenAI
 * Apps SDK) that ext-apps hosts key on.
 *
 * Browser-bundle-safe: this module is a pure object/function with no
 * `mcp-use/server` or `node:*` imports, so it can be re-exported from the core
 * Root barrel and consumed by UI bundles as well as server registrars. The
 * dual-protocol key literals are therefore written out here instead of being
 * imported from `mcp-use/server`; `meta.test.ts` pins them against the
 * adapters mcp-use itself emits (`McpAppsAdapter`/`AppsSdkAdapter`), so a
 * contract drift in a future mcp-use bump fails CI instead of silently
 * breaking widget rendering on Claude Desktop / claude.ai again.
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

/**
 * The Apps SDK `openai/widgetCSP` shape (snake_cased, as emitted on the wire
 * by mcp-use's `AppsSdkAdapter`). All domains are full origins
 * (e.g. `https://server.example`).
 */
export interface WidgetCspMeta {
  /** Origins allowed for fetch/XHR/WebSocket from inside the widget iframe. */
  connect_domains?: string[]
  /** Origins allowed for images, scripts, stylesheets, fonts. */
  resource_domains?: string[]
  /** Allowed iframe origins. */
  frame_domains?: string[]
  /** Allowed `base-uri` origins (SEP-1865). */
  base_uri_domains?: string[]
}

/**
 * Per-app widget-tool `_meta` defaults the framework threads into each
 * plugin's `registerWidgetTools` hook (third parameter) so every widget tool
 * can advertise them without knowing app-level configuration.
 */
export interface WidgetToolMetaDefaults {
  /** Content-security policy advertised to Apps SDK hosts (`openai/widgetCSP`). */
  widgetCSP?: WidgetCspMeta
}

/** Options for {@link uiMeta}. */
export interface UiMetaOptions {
  /**
   * The MCP UI resource URI hosting the widget bundle. When set, the host
   * renders the tool result into that resource instead of returning it.
   */
  resourceUri?: string
  /** When `true`, marks the tool app-only via SEP-1865 `visibility: ["app"]`. */
  appOnly?: boolean
  /**
   * Display name used to derive the default `invoking`/`invoked` status
   * strings (mirroring mcp-use's `Loading <name>...` / `<name> ready`
   * defaults). Typically the tool title.
   */
  title?: string
  /** Host status line while the tool call runs (`openai/toolInvocation/invoking`). */
  invoking?: string
  /** Host status line once the tool call finished (`openai/toolInvocation/invoked`). */
  invoked?: string
  /** Widget description surfaced to Apps SDK hosts (`openai/widgetDescription`). */
  widgetDescription?: string
  /** Content-security policy advertised to Apps SDK hosts (`openai/widgetCSP`). */
  widgetCSP?: WidgetCspMeta
}

/** Return shape of {@link uiMeta}: the nested `ui` block plus flat wire keys. */
export interface UiToolMeta extends Record<string, unknown> {
  ui: Record<string, unknown>
}

/**
 * Builds the `_meta` object for a tool from a {@link UiMetaOptions}, keeping
 * the SEP-1865 visibility / resourceUri literals in one place. Omitted fields
 * are left off entirely so the emitted `_meta` matches the hand-written
 * literals it replaces.
 *
 * Widget-RENDERING tools (a `resourceUri` and not app-only) additionally get
 * the dual-protocol widget contract that mcp-use emits natively for `mcpApps`
 * widgets — the flat SEP-1865 key plus the `openai/*` Apps SDK keys. Ext-apps
 * hosts (Claude Desktop / claude.ai) key on these to recognise the tool as
 * widget-producing and to deliver `structuredContent` to the iframe; without
 * them every widget hangs on its loading skeleton. App-only tools stay free
 * of the widget keys on purpose: their results are consumed by an already
 * rendered widget via `callTool`, and advertising an output template would
 * invite hosts to render them.
 */
export function uiMeta(opts: UiMetaOptions): UiToolMeta {
  const ui: Record<string, unknown> = {}
  if (opts.resourceUri !== undefined) ui.resourceUri = opts.resourceUri
  if (opts.appOnly) ui.visibility = ["app"]

  const meta: UiToolMeta = { ui }
  if (opts.resourceUri !== undefined && !opts.appOnly) {
    meta["ui/resourceUri"] = opts.resourceUri
    meta["openai/outputTemplate"] = opts.resourceUri
    meta["openai/toolInvocation/invoking"] =
      opts.invoking ?? (opts.title ? `Loading ${opts.title}...` : "Loading view...")
    meta["openai/toolInvocation/invoked"] =
      opts.invoked ?? (opts.title ? `${opts.title} ready` : "View ready")
    meta["openai/widgetAccessible"] = true
    meta["openai/resultCanProduceWidget"] = true
    if (opts.widgetDescription !== undefined) {
      meta["openai/widgetDescription"] = opts.widgetDescription
    }
    if (opts.widgetCSP !== undefined) meta["openai/widgetCSP"] = opts.widgetCSP
  }
  return meta
}
