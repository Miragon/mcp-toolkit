/**
 * Shared `_meta` shapes for widget tools.
 *
 * Since the native-views move the MCP Apps half of the widget contract
 * (`_meta.ui.resourceUri`, flat `ui/resourceUri`, `_meta.ui.visibility`, the
 * resource CSP) is emitted by mcp-use itself from the first-class
 * `ToolDefinition.view` / `.visibility` fields — the toolkit no longer stamps
 * any `ui` keys. What remains toolkit-owned is the OpenAI Apps SDK half
 * (`openai/*` keys), which mcp-use does not derive: {@link appsSdkMeta} builds
 * it, and mcp-use passes non-`ui` `_meta` entries through to `tools/list`
 * untouched.
 *
 * Browser-bundle-safe: this module is pure objects/functions with no mcp-use
 * or `node:*` imports, so it can be re-exported from the core root barrel and
 * consumed by UI bundles as well as server registrars.
 */

/**
 * URI scheme prefix mcp-use uses for view resources. Mirrors
 * `UI_RESOURCE_URI_PREFIX`, which mcp-use 2.x keeps in an internal `views/`
 * module without a package export; the wire contract is pinned by
 * `view-binding.test.ts` against a real server, so a drift in an upstream
 * bump fails CI instead of silently breaking Apps SDK hosts.
 */
export const VIEW_RESOURCE_URI_PREFIX = "ui://views/"

/**
 * The stable `ui://` resource URI mcp-use assigns to a registered view name —
 * `ui://views/<name>.html`. Widget registrars use it to point the Apps SDK
 * `openai/outputTemplate` key at the same resource the MCP Apps `view`
 * binding renders.
 */
export function viewResourceUri(viewName: string): string {
  return `${VIEW_RESOURCE_URI_PREFIX}${viewName}.html`
}

/**
 * CSP advertised on a view resource, in the SEP-1865 camelCase shape mcp-use
 * expects on `ToolDefinition.view.csp` (`_meta.ui.csp` on the wire). All
 * entries are full origins (e.g. `https://server.example`). mcp-use appends
 * the request-resolved server origin to connect/resource domains itself, so
 * this only needs origins *other* than the server (e.g. a CDN or an API the
 * widget fetches directly).
 */
export interface AppResourceCsp {
  /** Origins allowed for fetch/XHR/WebSocket from inside the widget iframe. */
  connectDomains?: string[]
  /** Origins allowed for images, scripts, stylesheets, fonts. */
  resourceDomains?: string[]
  /** Allowed iframe origins. */
  frameDomains?: string[]
  /** Allowed `base-uri` origins. */
  baseUriDomains?: string[]
}

/**
 * The Apps SDK `openai/widgetCSP` shape (snake_cased, as Apps SDK hosts read
 * it). All domains are full origins (e.g. `https://server.example`).
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
 * Per-app widget-tool defaults the framework threads into each plugin's
 * `registerWidgetTools` hook (second parameter) so every widget tool can
 * advertise them without knowing app-level configuration.
 */
export interface WidgetToolMetaDefaults {
  /** Content-security policy advertised to Apps SDK hosts (`openai/widgetCSP`). */
  widgetCSP?: WidgetCspMeta
  /**
   * CSP for the tool's `view` binding (`_meta.ui.csp` on the view resource) —
   * the camelCase sibling of {@link WidgetToolMetaDefaults.widgetCSP}, both
   * derived from `createFrameworkApp`'s `app.csp`.
   */
  viewCsp?: AppResourceCsp
}

/** Options for {@link appsSdkMeta}. */
export interface AppsSdkMetaOptions {
  /**
   * The `ui://` resource URI of the view rendering this tool's result —
   * `viewResourceUri(<view name>)` for a view-bound tool. Emitted as
   * `openai/outputTemplate` so Apps SDK hosts render the widget instead of
   * the raw result.
   */
  resourceUri: string
  /**
   * Display name used to derive the default `invoking`/`invoked` status
   * strings (`Loading <name>...` / `<name> ready`). Typically the tool title.
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

/**
 * Builds the OpenAI Apps SDK half of the widget-tool `_meta` — the `openai/*`
 * keys Apps SDK hosts key on to recognise a tool as widget-producing and to
 * deliver `structuredContent` to the iframe. The MCP Apps half (`_meta.ui`)
 * is emitted natively by mcp-use from the tool's `view` / `visibility`
 * fields; never stamp `ui` keys by hand — mcp-use overwrites that namespace
 * on `tools/list`.
 *
 * Only for widget-RENDERING (model-visible, view-bound) tools. App-only tools
 * stay free of these keys on purpose: their results are consumed by an
 * already rendered widget via `callTool`, and advertising an output template
 * would invite hosts to render them.
 */
export function appsSdkMeta(opts: AppsSdkMetaOptions): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    "openai/outputTemplate": opts.resourceUri,
    "openai/toolInvocation/invoking":
      opts.invoking ?? (opts.title ? `Loading ${opts.title}...` : "Loading view..."),
    "openai/toolInvocation/invoked":
      opts.invoked ?? (opts.title ? `${opts.title} ready` : "View ready"),
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  }
  if (opts.widgetDescription !== undefined) {
    meta["openai/widgetDescription"] = opts.widgetDescription
  }
  if (opts.widgetCSP !== undefined) meta["openai/widgetCSP"] = opts.widgetCSP
  return meta
}
