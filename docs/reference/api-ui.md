# `@miragon/mcp-toolkit-ui` — API reference

Three exports: the root barrel, `./app` (the MCP app shell + host bridge), and
`./hooks` (the view-tool hooks).

## `@miragon/mcp-toolkit-ui` (main)

Primitives, composed components, hooks, providers, utils. No dependency on
`mcp-use/react` — safe to import from admin portals that never mount the
MCP widget shell.

### shadcn primitives

Re-exports of the standard shadcn/ui components, pre-wired to the toolkit's
Tailwind preset.

| Family     | Exports                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card       | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent`                                                                            |
| Badge      | `Badge`, `badgeVariants`                                                                                                                                                   |
| Table      | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`                                                                   |
| Button     | `Button`, `buttonVariants`                                                                                                                                                 |
| Input      | `Input`                                                                                                                                                                    |
| Select     | `Select`, `SelectContent`, `SelectGroup`, `SelectItem`, `SelectLabel`, `SelectScrollDownButton`, `SelectScrollUpButton`, `SelectSeparator`, `SelectTrigger`, `SelectValue` |
| Dialog     | `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`             |
| Sheet      | `Sheet`, `SheetClose`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetTitle`, `SheetTrigger`                                                      |
| Alert      | `Alert`, `AlertDescription`, `AlertTitle`                                                                                                                                  |
| Tabs       | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                                                                                                           |
| ScrollArea | `ScrollArea`, `ScrollBar`                                                                                                                                                  |
| Separator  | `Separator`                                                                                                                                                                |
| Skeleton   | `Skeleton`                                                                                                                                                                 |
| Switch     | `Switch`                                                                                                                                                                   |

### Composed components

Focused, pure widget building blocks (React + primitives + `cn`). Several are
**tone-aware** — a `ToneVariant` (`"neutral" | "info" | "success" | "warning" | "danger"`)
maps to the semantic status tokens in `globals.css`.

| Symbol                                 | Purpose                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `GridLayout` / `GridItem`              | 12-column responsive grid used by `WidgetRenderer`.             |
| `KpiGrid`                              | Bordered strip of KPI cells (replaces the old `KPICard`).       |
| `KpiCell` / `KpiGridHeader`            | Types for `KpiGrid`.                                            |
| `LivePill` / `CountPill`               | Tone-driven pills: live-data dot, tabular count badge.          |
| `SectionHeading`                       | Section title row + optional muted hint/control.                |
| `WidgetHeader`                         | Page-level widget header: icon tile, title, meta, actions.      |
| `GroupCard`                            | Expandable card with a clickable summary bar.                   |
| `FilterBar` / `FilterChip`             | Search input + toggleable chip row for filtering a list.        |
| `DrillButton`                          | Neutral in-widget navigation button (drill into a detail view). |
| `ListFooter`                           | "Showing X of Y" + "Load more" footer for paginated lists.      |
| `TONE_SOFT` / `TONE_DOT` / `TONE_TEXT` | `Record<ToneVariant, string>` tone → Tailwind class maps.       |
| `ToneVariant`                          | The status-tone union behind the tone-aware components.         |

### Hooks

| Symbol                                  | Signature                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `useToolQuery<TData, TSelected>`        | `(queryKey, toolName, args, opts?) → UseQueryResult`. Parses MCP tool result (content[0].text JSON → structuredContent → raw). |
| `useToolMutation<TData>`                | `(toolName, { invalidateKeys? }?) → UseMutationResult`.                                                                        |
| `UseToolQueryOptions<TData, TSelected>` | `{ enabled?, select? }`.                                                                                                       |
| `useIsMobile`                           | `() → boolean`.                                                                                                                |
| `useDebouncedValue<T>`                  | `(value, delayMs = 300) → T`. Debounce a value (e.g. a search box).                                                            |

The view-tool hooks (`useViewToolQuery`, `useViewData`) live in the
[`./hooks` subpath](#miragonmcp-toolkit-uihooks) — see below.

### Providers

| Symbol             | Signature                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `AppQueryProvider` | `{ children, callTool? }`. Wraps TanStack Query client + `CallToolContext`.                     |
| `useCallTool`      | `() → CallToolFn \| undefined`. Return the `callTool` closure from `McpAppView`.                |
| `queryClient`      | Exported `QueryClient` — consumers can `queryClient.invalidateQueries(...)` from outside React. |

`CallToolFn` is typed as `(name: string, args: object) => Promise<unknown>`.
Widened from `Record<string, unknown>` so generated tool input interfaces
(which lack an index signature) can be passed directly.

### Utils

| Symbol                   | Signature                                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cn`                     | `(...classes) → string`. `clsx` + `tailwind-merge`.                                                                                                                                                                                                |
| `parseToolResult`        | `(result, opts?: ParseToolResultOptions) → unknown`. Decode a raw MCP tool result to its payload. `structuredContent`-first: `isError` → throw, then `structuredContent`, then JSON-decoded `text`, then raw. `useToolQuery` decodes through this. |
| `parseViewToolResult`    | `(result) → unknown`. Unwrap a `*_show_*` view envelope (`context.stepData`) to flat widget data: single-step → that step's data; multi-step → keyed by step id. Non-envelope results fall through `parseToolResult`.                              |
| `ParseToolResultOptions` | `{ prefer?: "structured" \| "text" }`. Channel preference for `parseToolResult`. Default `"structured"`.                                                                                                                                           |
| `TOOLKIT_REACT_MAJOR`    | `const 19`. The major React version this toolkit ships against — the host's module-discovery and the remote-widget loader runtime-check upstream bundles against it. Bump in lockstep with the `react` peer dependency.                            |

## `@miragon/mcp-toolkit-ui/app`

MCP app shell — imports `mcp-use/react`. Kept out of the main barrel so
admin portals don't pull the `mcp-use` client runtime into their Vite
bundle.

### Root component

`McpToolkitApp` is the recommended consumer-facing root. It wraps
`McpAppView` in `mcp-use`'s `McpUseProvider`, which installs:

- host auto-sizing (`ui/notifications/size-changed` for MCP Apps hosts
  like Claude Desktop; `notifyIntrinsicHeight` for ChatGPT's Apps SDK),
- `StrictMode`, a default `ErrorBoundary`, and theme plumbing.

```tsx
import { createRoot } from "react-dom/client"
import { McpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
import { ArticleCard } from "./widgets/ArticleCard.js"

const widgets = { "articles:article-card": ArticleCard }

createRoot(document.getElementById("root")!).render(<McpToolkitApp widgets={widgets} />)
```

### Exports

| Symbol                            | Signature                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `McpToolkitApp`                   | `(props: McpAppViewProps) → JSX.Element`. `<McpUseProvider><McpAppView {...props} /></McpUseProvider>`.                                                                                                                                                                               |
| `McpAppView`                      | `(props: McpAppViewProps) → JSX.Element`. Top-level view. Renders `WidgetRenderer`; a Build button (shown only when `builderAvailable` — see `builderEnabled` below) toggles local build mode into `LayoutBuilder`. Use directly only if you already own the `McpUseProvider` wiring. |
| `McpAppViewProps`                 | `{ widgets, widgetLoader?, refreshToolName?, remoteBundleToolName?, builderEnabled?, labels? }`. See table below.                                                                                                                                                                     |
| `McpAppViewLabels`                | Override strings: `loading`, `refresh`, `refreshing`, `enterFullscreen`, `exitFullscreen`. Defaults: English.                                                                                                                                                                         |
| `WidgetRenderer`                  | Lower-level component — renders a normalised layout given the widgets map. Used internally by `McpAppView`.                                                                                                                                                                           |
| `WidgetRendererProps`             | `{ layout, keys, stepData?, errors, widgets }`.                                                                                                                                                                                                                                       |
| `WidgetComponent`                 | `ComponentType<WidgetProps>`.                                                                                                                                                                                                                                                         |
| `LayoutBuilder`                   | `(props: LayoutBuilderProps) → JSX.Element`. Interactive composer (palette + WYSIWYG canvas + tabs + save dialog). Mounted by `McpAppView` when the user toggles local build mode (Build button); exported so you can embed it directly in a custom shell.                            |
| `LayoutBuilderProps`              | `{ initialLayout?, title?, initialKeys?, initialSteps?, context, reachableWidgets, widgets, callTool, refreshToolName?, renderToolName?, saveToolName?, dashboardId?, labels?, onRendered?, onSaved? }`.                                                                              |
| `LayoutBuilderLabels`             | Override strings for every user-facing caption in the builder (palette header, buttons, save dialog, …). Defaults: English.                                                                                                                                                           |
| `createRemoteWidgetLoader`        | `(opts: CreateRemoteWidgetLoaderOptions) → WidgetLoader`. Builds a loader that fetches widget JS through `fetchResource`, evaluates via Blob URL + dynamic `import()`, returns `default`. Asserts `React.version` major matches the toolkit.                                          |
| `WidgetLoader`                    | `(id: string, uri: string) => Promise<WidgetComponent>`.                                                                                                                                                                                                                              |
| `FetchResourceText`               | `(id: string, uri: string) => Promise<string>`. Transport the loader uses to read the bundle's JS source.                                                                                                                                                                             |
| `CreateRemoteWidgetLoaderOptions` | `{ fetchResource, evaluateBundle?, expectedReactMajor? }`. Only `fetchResource` is required — the other two are test hooks.                                                                                                                                                           |

### Host bridge

The seam that lets one hand-built widget run in the mcp-use host, ChatGPT (Apps
SDK), or a standalone web app against an existing MCP server. See the
[host-portability concept](../concepts/host-portability.md).

| Symbol                                           | Signature                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HostBridge`                                     | `{ callTool(name, args), sendFollowup(prompt), openExternal(url), getWidgetData<T>(): T \| null, setModelContext?(text), theme?: "light" \| "dark" }`. The host-agnostic surface a portable widget talks to. |
| `useHostBridge`                                  | `() → HostBridge`. Never returns `null` — falls back to the mcp-use bridge inside the toolkit's own host.                                                                                                    |
| `useHostBridgeOrNull`                            | `() → HostBridge \| null`. Returns `null` when no provider/host is present (branch on availability).                                                                                                         |
| `HostBridgeProvider`                             | `({ bridge, children }) → JSX.Element`. Provides an explicit bridge to the subtree.                                                                                                                          |
| `createMcpUseHostBridge` / `useMcpUseHostBridge` | `() → HostBridge`. The toolkit's own bridge over `mcp-use/react`. The default when no provider is present.                                                                                                   |
| `createChatGptHostBridge`                        | `(sdk?: OpenAiAppsSdk \| null) → HostBridge`. Maps the bridge verbs onto the OpenAI Apps SDK (ChatGPT). Defensive — missing host methods degrade to logged no-ops.                                           |
| `createStandaloneHostBridge`                     | `(opts: StandaloneHostBridgeOptions) → HostBridge`. `{ callTool, getData?, onFollowup?, onOpenExternal?, onModelContext?, theme? }` — `callTool` usually wraps a `@modelcontextprotocol/sdk` client.         |
| `OpenAiAppsSdk` / `StandaloneHostBridgeOptions`  | Types for the two non-mcp-use bridge factories.                                                                                                                                                              |

### Host actions + data adapter

| Symbol                  | Signature                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useHostActions`        | `() → { openLink, showWidget, askAi }`. A named-affordance facade over `useHostBridge`.                                                                                                                                |
| `buildShowWidgetIntent` | `(toolName, description) → string`. Phrase a navigation prompt with a `(use <toolName>)` hint for `host.showWidget(...)`.                                                                                              |
| `HostActions`           | The `{ openLink, showWidget, askAi }` shape returned by `useHostActions`.                                                                                                                                              |
| `adaptDataWidget`       | `(Widget, dataType: string, describeForModel?) → WidgetComponent`. Wraps a single-data `({ data })` widget so the host feeds it `context.steps[_dataType].data` and (with `describeForModel`) a `<ModelContext>` line. |
| `DescribeForModel<T>`   | `(data: NonNullable<T>, props) → string`. The `adaptDataWidget` description-callback type.                                                                                                                             |

### Widget isolation (dev)

A Storybook-style harness for developing a widget with fixture data and a mocked
host — no backend. See the
[developing-widgets-in-isolation guide](../guides/developing-widgets-in-isolation.md).

| Symbol                                                                                                  | Signature                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WidgetFixtureHost`                                                                                     | `(props: WidgetFixtureHostProps) → JSX.Element`. Renders one widget with fixture data + a mocked host bridge; logs host actions and surfaces the reported `<ModelContext>`. |
| `FixtureCallToolRegistry`                                                                               | The in-memory `callTool` registry the fixture host serves tool results from.                                                                                                |
| `buildFixtureWidgetProps`                                                                               | `(data, dataType?) → WidgetProps`. Builds the props envelope the fixture host passes to a widget (exported for unit-testing the shape).                                     |
| `useFixtureHost`                                                                                        | Hook into the active fixture-host context.                                                                                                                                  |
| `WidgetFixtureHostProps` / `FixtureWidget` / `FixtureToolEntry` / `FixtureToolResult` / `HostActionLog` | Fixture-host types. `HostActionLog` is the union of logged host actions (`callTool`, `sendFollowUpMessage`, `openExternal`, `requestDisplayMode`, `setWidgetState`).        |

### `McpAppViewProps` in detail

| Prop                    | Type                              | Default                | Purpose                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `widgets`               | `Record<string, WidgetComponent>` | —                      | Host-bundled widget registry, keyed by widget id.                                                                                                                                                                                                                                                                                                                    |
| `widgetLoader?`         | `WidgetLoader`                    | built-in (see below)   | Lazily loads widgets referenced by the layout but missing from `widgets` (upstream-hosted modules). The default loader calls `read-widget-bundle` via the host bridge and evaluates the returned JS — no wiring needed.                                                                                                                                              |
| `refreshToolName?`      | `string`                          | `"refresh-view"`       | Tool invoked by the refresh button. Usually a thin wrapper around `renderView(...)` on the host.                                                                                                                                                                                                                                                                     |
| `remoteBundleToolName?` | `string`                          | `"read-widget-bundle"` | Tool name the default `widgetLoader` uses to fetch an upstream-hosted widget's source. Ignored when `widgetLoader` is supplied.                                                                                                                                                                                                                                      |
| `builderEnabled?`       | `boolean`                         | server signal          | Override for the Build (edit) button. Left unset (the default), the shell follows the server's own `render-view` signal (`structuredContent.builderAvailable`, derived from `app.builder`), so the button appears only when `get-builder-catalogue` is registered. Set `true`/`false` to force it on/off. The catalogue fetch also fails soft if the tool is absent. |
| `labels?`               | `McpAppViewLabels`                | English                | Override UI strings (loading, refresh, fullscreen toggle).                                                                                                                                                                                                                                                                                                           |

## `@miragon/mcp-toolkit-ui/hooks`

View-tool hooks for self-fetching widgets — also imports `mcp-use/react`, so
kept out of the main barrel.

| Symbol                    | Signature                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useViewToolQuery<T>`     | `(queryKey, toolName, args, opts?: { enabled? }) → UseQueryResult`. Self-fetch from a `*_show_*` widget tool; unwraps the view envelope via `parseViewToolResult` (single-step → flat data, multi-step → keyed by step id).   |
| `useViewData<T>`          | `(initialData, key, tool, args, ready) → { data, loading, error }`. Dual-mode seam — returns host-pushed `initialData` when present, otherwise fetches `tool` under `key`, gated on `ready` and the absence of `initialData`. |
| `UseViewToolQueryOptions` | `{ enabled? }`.                                                                                                                                                                                                               |
| `ViewDataResult<T>`       | `{ data, loading, error }`. Return shape of `useViewData`.                                                                                                                                                                    |

## Source map

```
packages/ui/src/
├── primitives/          shadcn base (card, table, button, …)
├── components/          composed components (KpiGrid, Pills, FilterBar, …)
├── lib/                 cn(), parse-tool-result, tone-utils (TONE_*/ToneVariant)
├── theme/               createTheme + ThemeProvider + themePresets
├── hooks/               use-tool-query, use-mobile, use-debounced-value
│                        + use-view-tool-query, use-view-data (subpath export)
├── providers/           AppQueryProvider + useCallTool
└── app/                 McpToolkitApp + McpAppView + WidgetRenderer + LayoutBuilder
                         + remote-widget-loader + host-bridge + adapt-data-widget
                         + use-host-actions + widget-fixture (subpath export)
```

## See also

- [Widgets concept](../concepts/widgets.md)
- [View builder concept](../concepts/view-builder.md)
- [Building a UI-only module](../guides/building-a-ui-only-module.md)
- [Building dashboards end-to-end](../guides/building-dashboards.md)
