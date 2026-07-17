/**
 * Shared-runtime contract between a host's app-bundle and upstream-hosted
 * widget bundles.
 *
 * Remote widget bundles are built with `react`, `react-dom`, `mcp-use/react`,
 * the `@miragon/mcp-toolkit-ui` barrels, and `@tanstack/react-query` marked as
 * externals. At runtime the host page satisfies those bare specifiers through
 * a `<script type="importmap">` whose entries are data:-URI ES-module shims
 * re-exporting `globalThis.*` namespaces the host bundle assigned via
 * {@link exposeSharedRuntime}. Instance identity is the load-bearing property:
 * the shim hands the remote bundle the *host's module instance*, so React
 * contexts (useCallTool, useHostBridge, theme, react-query client) match
 * instead of context-splitting on a bundled copy.
 *
 * Browser-safe by construction: this module never value-imports
 * `mcp-use/react` (or anything else) — the export lists below are plain string
 * data, drift-guarded by `shared-runtime.test.ts`.
 */

/** Canonical globalThis property names the host app-bundle exposes shared libraries under. */
export const SHARED_RUNTIME_GLOBALS = {
  react: "React",
  reactDom: "ReactDOM",
  mcpUseReact: "McpUseReact",
  toolkitUi: "McpToolkitUi",
  toolkitUiApp: "McpToolkitUiApp",
  toolkitUiHooks: "McpToolkitUiHooks",
  reactQuery: "ReactQuery",
} as const

/**
 * Module namespaces the host app-bundle exposes, keyed by the canonical
 * global names of {@link SHARED_RUNTIME_GLOBALS}. `React`/`ReactDOM` are the
 * baseline every host exposes; the rest are optional — expose exactly what
 * you declare in `createFrameworkApp`'s `hostRuntime` option.
 */
export interface SharedRuntimeModules {
  React: unknown
  ReactDOM: unknown
  McpUseReact?: unknown
  McpToolkitUi?: unknown
  McpToolkitUiApp?: unknown
  McpToolkitUiHooks?: unknown
  ReactQuery?: unknown
}

/**
 * Assigns the passed module namespaces onto `target` (default: globalThis)
 * under the canonical names, skipping undefined entries. Instance identity is
 * the load-bearing property: the import-map shims re-export these exact
 * objects, so remote bundles share the host's React contexts (useCallTool,
 * useHostBridge, theme) instead of context-splitting on a bundled copy.
 *
 * Call it in the app-bundle entry point, before any remote widget loads.
 */
export function exposeSharedRuntime(
  modules: SharedRuntimeModules,
  target: object = globalThis,
): void {
  Object.assign(
    target,
    Object.fromEntries(Object.entries(modules).filter(([, v]) => v !== undefined)),
  )
}

/** Throws unless every named global is present on `target`. Call after exposeSharedRuntime in dev. */
export function assertSharedRuntimeExposed(
  globalNames: readonly string[],
  target: object = globalThis,
): void {
  const missing = globalNames.filter((n) => (target as Record<string, unknown>)[n] === undefined)
  if (missing.length > 0) {
    throw new Error(
      `shared-runtime: missing globals [${missing.join(", ")}] — call exposeSharedRuntime with them before any remote widget loads.`,
    )
  }
}

/** Builds a data:-URI ES-module shim re-exporting a globalThis namespace (default + named). */
export function dataUriShim(globalName: string, namedExports: readonly string[]): string {
  const named = namedExports.map((n) => `export const ${n}=M.${n};`).join("")
  return `data:text/javascript,const M=globalThis.${globalName};export default M;${named}`
}

// Named-export lists the shims enumerate. Drift-guarded by shared-runtime.test.ts:
// the toolkit-ui lists must exactly match their barrels' runtime exports (both
// directions — the shims can never lag the barrels); the third-party lists are
// curated subsets asserted to exist in the real packages.

/**
 * Curated `mcp-use/react` surface exposed to remote bundles — the widget-facing
 * provider + hooks. Deliberately not the full package: the shim enumerates
 * only what a widget bundle legitimately imports.
 */
export const MCP_USE_REACT_EXPORTS = [
  "McpUseProvider",
  "useWidget",
  "useWidgetProps",
  "useWidgetState",
  "useWidgetTheme",
  "useCallTool",
] as const

/**
 * Curated `@tanstack/react-query` surface exposed to remote bundles. Covers
 * the client, provider, and the query/mutation hooks the toolkit's own hooks
 * build on.
 */
export const REACT_QUERY_EXPORTS = [
  "QueryClient",
  "QueryClientProvider",
  "useQuery",
  "useMutation",
  "useQueryClient",
  "useInfiniteQuery",
  "keepPreviousData",
] as const

/** Every runtime export of the `@miragon/mcp-toolkit-ui` root barrel (`src/index.ts`). */
export const TOOLKIT_UI_EXPORTS = [
  // primitives
  "Card",
  "CardHeader",
  "CardFooter",
  "CardTitle",
  "CardAction",
  "CardDescription",
  "CardContent",
  "Badge",
  "badgeVariants",
  "Table",
  "TableHeader",
  "TableBody",
  "TableFooter",
  "TableRow",
  "TableHead",
  "TableCell",
  "TableCaption",
  "Separator",
  "Skeleton",
  "Tabs",
  "TabsList",
  "TabsTrigger",
  "TabsContent",
  "Button",
  "buttonVariants",
  "Input",
  "Select",
  "SelectContent",
  "SelectGroup",
  "SelectItem",
  "SelectLabel",
  "SelectScrollDownButton",
  "SelectScrollUpButton",
  "SelectSeparator",
  "SelectTrigger",
  "SelectValue",
  "Dialog",
  "DialogClose",
  "DialogContent",
  "DialogDescription",
  "DialogFooter",
  "DialogHeader",
  "DialogOverlay",
  "DialogPortal",
  "DialogTitle",
  "DialogTrigger",
  "Alert",
  "AlertDescription",
  "AlertTitle",
  "Switch",
  "ScrollArea",
  "ScrollBar",
  "Sheet",
  "SheetClose",
  "SheetContent",
  "SheetDescription",
  "SheetFooter",
  "SheetHeader",
  "SheetTitle",
  "SheetTrigger",
  // hooks
  "useIsMobile",
  "useToolQuery",
  "useToolMutation",
  "useDebouncedValue",
  // tone tokens
  "TONE_SOFT",
  "TONE_DOT",
  "TONE_TEXT",
  // composed components
  "GridLayout",
  "GridItem",
  "KpiGrid",
  "LivePill",
  "CountPill",
  "SectionHeading",
  "WidgetHeader",
  "GroupCard",
  "FilterBar",
  "DrillButton",
  "ListFooter",
  // providers
  "AppQueryProvider",
  "useCallTool",
  "queryClient",
  // theming
  "createTheme",
  "ThemeProvider",
  "useTheme",
  "themePresets",
  // i18n
  "LocaleProvider",
  "useLocale",
  "useTranslate",
  // utils
  "cn",
  "parseToolResult",
  "parseViewToolResult",
  "TOOLKIT_REACT_MAJOR",
  // shared runtime (this module)
  "SHARED_RUNTIME_GLOBALS",
  "exposeSharedRuntime",
  "assertSharedRuntimeExposed",
  "dataUriShim",
  "MCP_USE_REACT_EXPORTS",
  "REACT_QUERY_EXPORTS",
  "TOOLKIT_UI_EXPORTS",
  "TOOLKIT_UI_APP_EXPORTS",
  "TOOLKIT_UI_HOOKS_EXPORTS",
  "buildSharedRuntimeImportMap",
] as const

/** Every runtime export of the `@miragon/mcp-toolkit-ui/app` barrel (`src/app/index.ts`). */
export const TOOLKIT_UI_APP_EXPORTS = [
  "McpAppView",
  "McpToolkitApp",
  "WidgetRenderer",
  "WidgetErrorBoundary",
  "RenderedWidget",
  "contextHasNoData",
  "mergeAliasProps",
  "createAliasWidget",
  "resolveAliasComponents",
  "LayoutBuilder",
  "createRemoteWidgetLoader",
  "adaptDataWidget",
  "useHostActions",
  "buildShowWidgetIntent",
  "HostBridgeProvider",
  "useHostBridge",
  "useHostBridgeOrNull",
  "useMcpUseHostBridge",
  "createMcpUseHostBridge",
  "createChatGptHostBridge",
  "createStandaloneHostBridge",
  "WidgetFixtureHost",
  "FixtureCallToolRegistry",
  "buildFixtureWidgetProps",
  "useFixtureHost",
] as const

/** Every runtime export of the `@miragon/mcp-toolkit-ui/hooks` barrel (`src/hooks/index.ts`). */
export const TOOLKIT_UI_HOOKS_EXPORTS = [
  "useIsMobile",
  "useDebouncedValue",
  "useToolQuery",
  "useToolMutation",
  "useViewToolQuery",
  "useViewData",
  "useToolResultRecovery",
  "resolveRecoveryToolName",
  "decodeRecoveredResult",
] as const

/**
 * Import-map entries for the optional shared runtimes. Merge the returned
 * record into the app-bundle HTML's `<script type="importmap">` next to the
 * react/react-dom entries (e.g. via a Vite transformIndexHtml hook). Include
 * exactly the runtimes the host declares in `createFrameworkApp`'s
 * `hostRuntime` option — and expose the matching namespaces via
 * {@link exposeSharedRuntime} in the bundle entry.
 */
export function buildSharedRuntimeImportMap(include: {
  mcpUseReact?: boolean
  toolkitUi?: boolean
  reactQuery?: boolean
}): Record<string, string> {
  const map: Record<string, string> = {}
  if (include.mcpUseReact) {
    map["mcp-use/react"] = dataUriShim(SHARED_RUNTIME_GLOBALS.mcpUseReact, MCP_USE_REACT_EXPORTS)
  }
  if (include.toolkitUi) {
    map["@miragon/mcp-toolkit-ui"] = dataUriShim(
      SHARED_RUNTIME_GLOBALS.toolkitUi,
      TOOLKIT_UI_EXPORTS,
    )
    map["@miragon/mcp-toolkit-ui/app"] = dataUriShim(
      SHARED_RUNTIME_GLOBALS.toolkitUiApp,
      TOOLKIT_UI_APP_EXPORTS,
    )
    map["@miragon/mcp-toolkit-ui/hooks"] = dataUriShim(
      SHARED_RUNTIME_GLOBALS.toolkitUiHooks,
      TOOLKIT_UI_HOOKS_EXPORTS,
    )
  }
  if (include.reactQuery) {
    map["@tanstack/react-query"] = dataUriShim(
      SHARED_RUNTIME_GLOBALS.reactQuery,
      REACT_QUERY_EXPORTS,
    )
  }
  return map
}
