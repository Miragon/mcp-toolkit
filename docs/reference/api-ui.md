# `@miragon/mcp-toolkit-ui` — API reference

Three module exports: the root barrel, `./app` (the MCP app shell + host
bridge), and `./hooks` (the view-tool hooks), plus the stylesheets below.

## Stylesheets

| Subpath                     | Contents                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `./globals.css`             | One-line app entry: `@import "tailwindcss"` + `./theme.css` + the toolkit's `@source`.                                                                                                     |
| `./theme.css`               | The design tokens without Tailwind's entry: the vendored `--cd-*` tokens, the role tokens (light + dark), the `@theme` utility mapping, the base layer (focus outline) and reduced motion. |
| `./fonts.css`               | Opt-in Geist + Geist Mono through the bundler (`@fontsource-variable`). Nothing loads a font unless you import this or use `fontFaces()`.                                                  |
| `./cd-tokens.generated.css` | The Miragon corporate-design tokens (`--cd-*`), vendored unchanged from `Miragon/corporate-identity`.                                                                                      |

The defaults are the **Miragon theme**: every role (`--primary`, `--link`,
`--focus`, `--<tone>`, `--<tone>-soft`, `--<tone>-ink`, radii, shadows, motion,
fonts; `ROLE_TOKENS`) points at a `--cd-*` token, in light and in dark. Dark
follows the host (`.dark` or `data-theme="dark"`); `data-theme-mode="light"`
marks a forced-light island. A brand overrides role variables only, see
[White-labeling](../guides/white-labeling.md).

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
**tone-aware**: they take a tone from ONE vocabulary (`"success" | "warning" |
"danger" | "info" | "neutral"`; retired names resolve through `resolveTone`)
that maps to the status roles in `theme.css`: the colour (`--<tone>`: fill,
dot, border, icon), the tint (`--<tone>-soft`) and the text colour
(`--<tone>-ink`). Status is never text in its own colour. Text sits on the
type scale (`text-title` … `text-small`), 13 px at least.

| Symbol                                                     | Purpose                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GridLayout` / `GridItem`                                  | 12-column responsive grid used by `WidgetRenderer`.                                                                                                                                                           |
| `KpiGrid`                                                  | Row of KPI cells (replaces the old `KPICard`): responsive columns, `strip` or `soft` variant, neutral figures, `actionHint` as the cell's description.                                                        |
| `KpiGridSkeleton`                                          | Loading placeholder with `KpiGrid`'s geometry (`aria-busy`).                                                                                                                                                  |
| `KpiCell` / `KpiGridHeader` / `KpiGridSkeletonProps`       | Types for `KpiGrid` / `KpiGridSkeleton`.                                                                                                                                                                      |
| `LivePill` / `StatusBadge` / `CountPill`                   | Tone-driven pills: live-data dot, a state in words (text required), tabular count badge.                                                                                                                      |
| `StatusBadgeProps` / `StatusBadgeText`                     | Types for `StatusBadge` (`StatusBadgeText`: string, number, element or a list of them, never empty).                                                                                                          |
| `SectionHeading`                                           | Section title row + optional muted hint/control.                                                                                                                                                              |
| `WidgetHeader` / `WidgetHeadingLevel`                      | Page-level widget header: state badge, title at a configurable heading level (`as`), meta, actions.                                                                                                           |
| `GroupCard`                                                | Expandable card with a clickable summary bar.                                                                                                                                                                 |
| `FilterBar` / `FilterChip`                                 | Labelled search input + toggle chips (`aria-pressed`) for filtering a list.                                                                                                                                   |
| `DrillButton`                                              | Neutral in-widget navigation button with a Lucide arrow (drill into a detail view).                                                                                                                           |
| `ListFooter`                                               | "Showing X of Y" + "Load more" footer in a polite live region; "Updating…" while a first page is in flight; at zero rows the region stays (visually hidden) and says "No entries"; text + numbers per locale. |
| `PagedListFooter` / `PagedListState`                       | The tail of a paged list: a failed first page and a failed load-more as separate inline `ErrorState`s with their own retries, then the `ListFooter`.                                                          |
| `TONE_SOFT` / `TONE_TINT` / `TONE_DOT` / `TONE_INK`        | `Record<ToneVariant, string>` tone → Tailwind class maps: tint + foreground, tint alone, dot, text (ink). `TONE_TEXT` is `TONE_INK`'s deprecated name.                                                        |
| `TONE_BORDER` / `TONE_ICON`                                | Tone → border colour / SVG icon colour (icons only, never text).                                                                                                                                              |
| `TONE_VARIANTS` / `TONE_ALIASES`                           | The five tones in severity order; the retired names and the tone each one means (`critical`/`error`/`destructive` → `danger`, …).                                                                             |
| `resolveTone` / `isToneVariant`                            | `(name: unknown, fallback = "neutral") → ToneVariant`: any tone name onto the vocabulary; the type guard for a tone from the wire.                                                                            |
| `ToneVariant` / `ToneAlias` / `ToneName`                   | The five tones; a retired name; what a tone-aware prop accepts (either).                                                                                                                                      |
| `TYPE_SCALE` / `TYPE_STEPS` / `TYPE_FLOOR_PX` / `TypeStep` | The type scale: `text-title` (28/700), `text-section` (21/600), `text-body` (16), `text-dense` (14), `text-small` (13, the floor).                                                                            |
| `MICRO_LABEL`                                              | `"text-small font-semibold"`: the caption of a column or value (formerly 10–11 px uppercase).                                                                                                                 |
| `FOCUS_RING` / `FOCUS_RING_INSET`                          | The kit's opaque focus ring (`--focus`, 2px) as class strings for custom controls.                                                                                                                            |

### Theming

| Symbol                                                                                                                                              | Signature                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTheme`                                                                                                                                       | `(tokens: ThemeTokens, opts?: { dark?: ThemeTokens }) → ThemeDefinition`. Map brand tokens (one field per role) to their CSS variables.                                                                                                                   |
| `resolveThemeVars`                                                                                                                                  | `(theme, mode: "light" \| "dark") → ThemeVars`. The variables a theme scope applies: light = `vars`; dark = mode-invariant light vars + `darkVars`. Legacy knobs derive unset roles: `--radius` → sm/md/lg, `--primary` → hover + link, `--ring` → focus. |
| `ThemeProvider`                                                                                                                                     | `{ theme?, mode?: "light" \| "dark" \| "system", as?, className?, children }`. Applies a theme + mode to a scope; overlays portal inside it.                                                                                                              |
| `useTheme`                                                                                                                                          | `() → { theme, mode, resolvedMode }`. Throws outside a `ThemeProvider`.                                                                                                                                                                                   |
| `usePortalContainer`                                                                                                                                | `() → HTMLElement \| null`. The nearest `ThemeProvider`'s portal node; pass it as a portal `container`.                                                                                                                                                   |
| `ROLE_TOKENS`                                                                                                                                       | `readonly` list of the role-token contract (`--background` … `--font-mono`).                                                                                                                                                                              |
| `themePresets`                                                                                                                                      | `{ miragon, violet, emerald }` example `ThemeDefinition`s. `miragon` and `violet` are **deprecated** (the Miragon theme is the default).                                                                                                                  |
| `CD_TOKENS` / `CD_TOKENS_VERSION`                                                                                                                   | The `--cd-*` values as TS (`CD_TOKENS.blau`, `CD_TOKENS["danger-soft"]`) for SVG/canvas code; drift-tested against the vendored CSS. `CdTokenName` is its key type.                                                                                       |
| `fontFaces` / `GEIST_FONT_FILES`                                                                                                                    | `({ baseUrl, files?, display? }) → string`. Opt-in `@font-face` rules for Geist + Geist Mono served from `baseUrl` (latin, variable weight). `FontFacesOptions` is its options type.                                                                      |
| `adoptHostFontVariables` / `HOST_FONT_VARIABLES`                                                                                                    | `(style, hostVariables) → void`. Moves a host's SEP-1865 `--font-sans`/`--font-mono` to `--host-font-*`, the fallback slot after Geist. `McpToolkitApp` calls it; `InlineStyleTarget` is its style type.                                                  |
| `ThemeTokens` / `ThemeDefinition` / `ThemeVars` / `CreateThemeOptions` / `ThemeMode` / `ThemeContextValue` / `ThemeProviderProps` / `ThemePresetId` | Types of the theming surface.                                                                                                                                                                                                                             |

### Feedback and states

One pattern each for transient feedback, empty and failed states
(`packages/ui/src/components/{Toast,EmptyState,ErrorState}.tsx`).

| Symbol                                    | Signature / purpose                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ToastProvider`                           | `({ children }) → JSX.Element`. Toast state + the bottom-centre stack: one persistent `aria-live="polite"` region with fixed attributes (no role, no name; find it by `data-slot="toast-viewport"`), status colour as edge + icon, 2.8 s (errors 5 s); a held toast resumes its remaining time. Idempotent when nested. |
| `useToast`                                | `() → ToastApi`. `{ show(options) → id, dismiss(id) }`; a no-op outside a provider. `McpAppView` mounts a provider. Title and description are catalog text; a raw error goes to the console or an `ErrorState`'s Details.                                                                                               |
| `ToastApi` / `ToastOptions` / `ToastTone` | Types. `ToastOptions = { tone?: "success" \| "warning" \| "danger" \| "info", title, description?, duration? }`; an untyped retired tone resolves, anything else shows as `info`.                                                                                                                                       |
| `EmptyState`                              | `(props: EmptyStateProps) → JSX.Element`. Icon-or-mark slot, title (600), one help line, `action` + `secondaryAction`. Static, no live region.                                                                                                                                                                          |
| `ErrorState`                              | `(props: ErrorStateProps) → JSX.Element`. Lucide icon, title, description, raw `details` in a disclosure, `onRetry`, `actions`; `variant: "block" \| "inline"`, `role` default `"alert"`.                                                                                                                               |
| `EmptyStateProps` / `ErrorStateProps`     | Prop types; `StateHeadingLevel` (`"h2" \| "h3" \| "h4" \| "p"`) and `ErrorStateTone` (`"danger" \| "warning" \| "info"`).                                                                                                                                                                                               |

### Localization

The toolkit ships its own strings as a typed catalog per locale
(`packages/ui/src/locale/messages-{en,de}.ts`); every toolkit component reads
them from the nearest `LocaleProvider`, so passing a locale localizes the whole
chrome. English is the fallback for any other locale.

| Symbol                   | Signature / purpose                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LocaleProvider`         | `({ locale, translator?, toolkitMessages?, children })`. Active locale, an optional consumer translator, and per-section overrides of the toolkit's own strings.                                                                      |
| `useLocale`              | `() → string`. The active locale tag (`"en"` outside a provider; `McpAppView`'s host-locale fallback does not change it).                                                                                                             |
| `useTranslate`           | `() → BoundTranslate`. The consumer translator bound to the locale (echoes keys without one).                                                                                                                                         |
| `useToolkitMessages`     | `() → ToolkitMessages`. The toolkit's strings for the active locale (`common`, `view`, `listFooter`, `filterBar`, `pills`, `renderer`, `builder`, `propsSheet`).                                                                      |
| `TOOLKIT_MESSAGES`       | `Readonly<Record<"en" \| "de", ToolkitMessages>>`. The shipped catalogs.                                                                                                                                                              |
| `resolveToolkitMessages` | `(locale, override?) → ToolkitMessages`. Pure resolution behind the provider: primary language subtag, English fallback, per-section merge.                                                                                           |
| `formatCount`            | `(value, locale) → string`. Locale grouping (`1,234` / `1.234`), English fallback for an invalid tag.                                                                                                                                 |
| `ToolkitMessages` & co.  | Types: `ToolkitMessages`, `ToolkitMessagesOverride`, `ToolkitLocale`, `CommonMessages`, `ViewMessages`, `ListFooterMessages`, `FilterBarMessages`, `RendererMessages`, `BuilderMessages`, `PropsSheetMessages`, `LocaleContextValue`. |

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
| `cn`                     | `(...classes) → string`. `clsx` + `tailwind-merge`, extended with the type scale (`text-small` merges as a size, not a colour).                                                                                                                    |
| `parseToolResult`        | `(result, opts?: ParseToolResultOptions) → unknown`. Decode a raw MCP tool result to its payload. `structuredContent`-first: `isError` → throw, then `structuredContent`, then JSON-decoded `text`, then raw. `useToolQuery` decodes through this. |
| `parseViewToolResult`    | `(result) → unknown`. Unwrap a `*_show_*` view envelope (`context.stepData`) to flat widget data: single-step → that step's data; multi-step → keyed by step id. Non-envelope results fall through `parseToolResult`.                              |
| `ParseToolResultOptions` | `{ prefer?: "structured" \| "text" }`. Channel preference for `parseToolResult`. Default `"structured"`.                                                                                                                                           |

## `@miragon/mcp-toolkit-ui/app`

MCP app shell — imports `mcp-use/react`. Kept out of the main barrel so
admin portals don't pull the `mcp-use` client runtime into their Vite
bundle.

### Root component

`mountMcpToolkitApp` is the bundle entry point since mcp-use 2.x. It hands
`McpToolkitApp` to `bootstrapView`, which owns the mount: it connects the
ext-apps postMessage bridge to the host, installs an error boundary, and
auto-reports size changes. `McpToolkitApp` itself composes mcp-use's
`ThemeProvider` (host theme/style variables) and `McpUseHostBridgeProvider`
(the `HostBridge` every toolkit widget resolves via `useHostBridge()`) around
`McpAppView`.

```tsx
import { mountMcpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
import { ArticleCard } from "./widgets/ArticleCard.js"

const widgets = { "articles:article-card": ArticleCard }

mountMcpToolkitApp({ widgets })
```

### Exports

| Symbol                | Signature                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mountMcpToolkitApp`  | `(props: McpAppViewProps) → void`. Bundle entry point: mounts `McpToolkitApp` via mcp-use's `bootstrapView` (ext-apps handshake, error boundary, auto-resize).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `McpToolkitApp`       | `(props: McpAppViewProps) → JSX.Element`. `ThemeProvider` + `McpUseHostBridgeProvider` around `McpAppView`. Must render under a `bootstrapView` mount — use `mountMcpToolkitApp` unless composing a custom view.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `McpAppView`          | `(props: McpAppViewProps) → JSX.Element`. Top-level view: a lifecycle placeholder (waiting with a slow hint, an error with retry, or cancelled; never an endless skeleton), the toolbar, a failed-steps alert, then `WidgetRenderer`; an edit button (shown only when `builderAvailable` — see `builderEnabled` below) toggles local build mode into `LayoutBuilder`. Mounts a `ToastProvider` (refresh/fullscreen failures, builder saves) and binds the toolkit's own strings and number format to the host's locale unless a `LocaleProvider` sets one; `useLocale()` in your widgets is unaffected. Lucide icons draw at stroke 2.5 (2 in the toolbar), the toast stack included. Requires the mcp-use view hooks and a `HostBridge` provider — both wired by `McpToolkitApp`. |
| `McpAppViewProps`     | `{ widgets, refreshToolName?, builderEnabled?, labels?, builderLabels?, titleMode?, titleLevel?, renderTitle?, slowHintAfterMs?, describeError?, describeStep? }`. See table below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `McpAppViewLabels`    | `Partial<ViewMessages>`: `loading`, `cancelled`, `refresh`, `refreshing`, `enterFullscreen`, `exitFullscreen`, `build`, `slowHint`, `errorTitle`, `errorHint`, `errorHintNoRetry`, `retry`, `errorDetails`, `stepErrorsTitle`, `stepErrorsHint`, `refreshFailed`, `refreshFailedHint`, `fullscreenFailed`, `fullscreenFailedHint`. Defaults: the locale catalog.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `WidgetRenderer`      | Lower-level component — renders a normalised layout given the widgets map. Used internally by `McpAppView`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `WidgetRendererProps` | `{ layout, keys, stepData?, errors, widgets }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `WidgetComponent`     | `ComponentType<WidgetProps>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `LayoutBuilder`       | `(props: LayoutBuilderProps) → JSX.Element`. Interactive composer (palette + WYSIWYG canvas + tabs + save dialog). Mounted by `McpAppView` when the user toggles local build mode (the "Edit view" button); exported so you can embed it directly in a custom shell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `LayoutBuilderProps`  | `{ initialLayout?, title?, initialKeys?, initialSteps?, widgets, callTool, catalogueToolName?, saveToolName?, dashboardId?, labels?, onSaved?, onExit? }`. `onExit(commit)` is Apply: it hands over a `BuilderExitCommit` so the parent shows the edited view; `onExit()` without a commit is Discard: the view stays as it was (the builder asks first when the draft has unsaved changes). Without `onExit` the builder has no Apply and Discard resets the draft in place. Widgets, steps and props fields show by their `title` (see [`DisplayText`](./api-core.md#types)), else by id; the data sources, the catalogue and the ids sit behind "Advanced".                                                                                                                     |
| `LayoutBuilderLabels` | `Partial<BuilderMessages>`: every user-facing caption in the builder (palette, buttons, save dialog, …). Defaults: the locale catalog. A successful save raises a toast. `done` is deprecated since 2.8: the commit button is `apply` (an override of `done` still labels it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `BuilderExitCommit`   | `{ layout, keys?, steps?, title?, context? }`: what Apply hands to `onExit`, the draft as a save would send it plus the live context in its wire shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Host bridge

The seam that lets one hand-built widget run in the mcp-use host, ChatGPT (Apps
SDK), or a standalone web app against an existing MCP server. See the
[host-portability concept](../concepts/host-portability.md).

| Symbol                                          | Signature                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HostBridge`                                    | `{ callTool(name, args), sendFollowup(prompt), openExternal(url), getWidgetData<T>(): T \| null, setModelContext?(text), theme?: "light" \| "dark" }`. The host-agnostic surface a portable widget talks to. |
| `useHostBridge`                                 | `() → HostBridge`. Resolves the nearest `HostBridgeProvider`; throws (with a pointer to the adapters) when none is present. Inside the toolkit's own host, `McpToolkitApp` installs the provider.            |
| `useHostBridgeOrNull`                           | `() → HostBridge \| null`. Returns `null` when no provider/host is present (branch on availability).                                                                                                         |
| `HostBridgeProvider`                            | `({ bridge, children }) → JSX.Element`. Provides an explicit bridge to the subtree.                                                                                                                          |
| `McpUseHostBridgeProvider`                      | `({ children }) → JSX.Element`. Composes the mcp-use 2.x view hooks into the bridge and provides it (plus the view-scope flag). Must render under `bootstrapView`; `McpToolkitApp` includes it.              |
| `useIsInsideMcpUseView`                         | `() → boolean`. `true` under a `McpUseHostBridgeProvider` — branch before using `mcp-use/react` primitives that throw outside a view (e.g. `ModelContext`).                                                  |
| `toHostBridge`                                  | `(surface: McpUseWidgetSurface) → HostBridge`. Pure mapping from the structural mcp-use widget surface onto the bridge contract — the tested seam `McpUseHostBridgeProvider` feeds with live hooks.          |
| `createChatGptHostBridge`                       | `(sdk?: OpenAiAppsSdk \| null) → HostBridge`. Maps the bridge verbs onto the OpenAI Apps SDK (ChatGPT). Defensive — missing host methods degrade to logged no-ops.                                           |
| `createStandaloneHostBridge`                    | `(opts: StandaloneHostBridgeOptions) → HostBridge`. `{ callTool, getData?, onFollowup?, onOpenExternal?, onModelContext?, theme? }` — `callTool` usually wraps a `@modelcontextprotocol/client` client.      |
| `McpUseWidgetSurface`                           | Structural slice of the mcp-use widget surface `toHostBridge` reads (`callTool`, `sendFollowUpMessage`, `openExternal`, `output`, `theme`, `setState`).                                                      |
| `OpenAiAppsSdk` / `StandaloneHostBridgeOptions` | Types for the two non-mcp-use bridge factories.                                                                                                                                                              |

### Host actions + data adapter

| Symbol                  | Signature                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useHostActions`        | `() → { openLink, showWidget, askAi }`. A named-affordance facade over `useHostBridge`.                                                                                                                                                                                                                                    |
| `buildShowWidgetIntent` | `(toolName, description) → string`. Phrase a navigation prompt with a `(use <toolName>)` hint for `host.showWidget(...)`.                                                                                                                                                                                                  |
| `HostActions`           | The `{ openLink, showWidget, askAi }` shape returned by `useHostActions`.                                                                                                                                                                                                                                                  |
| `adaptDataWidget`       | `(Widget, dataType: string, describeForModel?) → WidgetComponent`. Wraps a single-data `({ data })` widget so the host feeds it `context.steps[_dataType].data` and (with `describeForModel`) a `HostModelContext` line.                                                                                                   |
| `DescribeForModel<T>`   | `(data: NonNullable<T>, props) → string`. The `adaptDataWidget` description-callback type.                                                                                                                                                                                                                                 |
| `HostModelContext`      | `({ content, children }) → ReactNode`. Host-portable model-context reporting: the native aggregating `ModelContext` inside an mcp-use view, the bridge's `setModelContext` everywhere else. Widgets must use this instead of importing `ModelContext` from `mcp-use/react` (which throws outside a `bootstrapView` mount). |

### Widget isolation (dev)

A Storybook-style harness for developing a widget with fixture data and a mocked
host — no backend. See the
[developing-widgets-in-isolation guide](../guides/developing-widgets-in-isolation.md).

| Symbol                                                                                                  | Signature                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WidgetFixtureHost`                                                                                     | `(props: WidgetFixtureHostProps) → JSX.Element`. Renders one widget with fixture data + a simulated `HostBridge`; logs host actions and surfaces the reported model context. Simulates the host-portable pattern only — direct `mcp-use/react` hook usage needs a real view. |
| `FixtureCallToolRegistry`                                                                               | The in-memory `callTool` registry the fixture host serves tool results from.                                                                                                                                                                                                 |
| `buildFixtureWidgetProps`                                                                               | `(data, dataType?) → WidgetProps`. Builds the props envelope the fixture host passes to a widget (exported for unit-testing the shape).                                                                                                                                      |
| `useFixtureHost`                                                                                        | Hook into the active fixture-host context.                                                                                                                                                                                                                                   |
| `WidgetFixtureHostProps` / `FixtureWidget` / `FixtureToolEntry` / `FixtureToolResult` / `HostActionLog` | Fixture-host types. `HostActionLog` is the union of logged host actions; since 2.x only `callTool`, `sendFollowUpMessage`, and `openExternal` fire (the other members stay for log-renderer compatibility).                                                                  |

### `McpAppViewProps` in detail

| Prop               | Type                              | Default          | Purpose                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | --------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `widgets`          | `Record<string, WidgetComponent>` | —                | Host-bundled widget registry, keyed by widget id. All widget code lives in the app bundle.                                                                                                                                                                                                                                                                           |
| `refreshToolName?` | `string`                          | `"refresh-view"` | Tool invoked by the refresh button. Usually a thin wrapper around `renderView(...)` on the host.                                                                                                                                                                                                                                                                     |
| `builderEnabled?`  | `boolean`                         | server signal    | Override for the Build (edit) button. Left unset (the default), the shell follows the server's own `render-view` signal (`structuredContent.builderAvailable`, derived from `app.builder`), so the button appears only when `get-builder-catalogue` is registered. Set `true`/`false` to force it on/off. The catalogue fetch also fails soft if the tool is absent. |
| `labels?`          | `McpAppViewLabels`                | locale catalog   | Override chrome strings (loading, error, cancelled, refresh, fullscreen, edit).                                                                                                                                                                                                                                                                                      |
| `builderLabels?`   | `LayoutBuilderLabels`             | locale catalog   | Override strings of the embedded builder.                                                                                                                                                                                                                                                                                                                            |
| `titleMode?`       | `"show" \| "hide" \| "slot"`      | `"show"`         | One title per view: the toolbar shows `viewData.title` as a heading, hides it (the widget brings its own), or renders `renderTitle(title)`.                                                                                                                                                                                                                          |
| `titleLevel?`      | `1 … 6`                           | `2`              | Heading level of the toolbar title in `"show"` mode.                                                                                                                                                                                                                                                                                                                 |
| `renderTitle?`     | `(title) → ReactNode`             | —                | Toolbar title slot for `titleMode: "slot"`.                                                                                                                                                                                                                                                                                                                          |
| `slowHintAfterMs?` | `number`                          | `8000`           | Delay before the loading placeholder adds its "taking longer than usual" hint.                                                                                                                                                                                                                                                                                       |
| `describeError?`   | `DescribeViewError`               | —                | `(reason) → { title?, description? } \| undefined`. Map a raw rendering error onto human text; the raw reason stays under "Details".                                                                                                                                                                                                                                 |
| `describeStep?`    | `DescribeStep`                    | —                | `({ id, step }) → string \| undefined`. Human title of a failed pipeline step in the failed-steps alert (default: the step id).                                                                                                                                                                                                                                      |

The toolbar shows Refresh and Fullscreen as 32 px chrome icon buttons
(the `outline` variant plus `shadow-1`: surface, border, shadow, blue hover)
named by `aria-label`, next to the "Edit view" button; Fullscreen renders
only when the host's negotiated `availableDisplayModes` offer it. An `isError`
rendering result (or a failed stripped-result recovery) is an error state with
a retry that re-runs the originating tool once; without the originating tool
(`hostContext.toolInfo`) there is no retry, and the hint says to ask in the
chat instead. The recovery never re-executes a failed or cancelled call on its
own (toolkit#176). After a retry, keyboard focus stays in the view. Refresh and
fullscreen failures raise a toast in catalog words; the raw reason goes to the
console, and failed data steps keep theirs under "Details".

Icons of your own `lucide-react` follow the view's stroke only when they
resolve to the toolkit's `lucide-react` instance (dedupe it in your bundler);
otherwise set `strokeWidth` on them.

## `@miragon/mcp-toolkit-ui/hooks`

View-tool hooks for self-fetching widgets — also imports `mcp-use/react`, so
kept out of the main barrel.

| Symbol                    | Signature                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useViewToolQuery<T>`     | `(queryKey, toolName, args, opts?: { enabled? }) → UseQueryResult`. Self-fetch from a `*_show_*` widget tool; unwraps the view envelope via `parseViewToolResult` (single-step → flat data, multi-step → keyed by step id).            |
| `useViewData<T>`          | `(initialData, key, tool, args, ready) → { data, loading, error, refetch }`. Dual-mode seam — returns host-pushed `initialData` when present, otherwise fetches `tool` under `key`, gated on `ready` and the absence of `initialData`. |
| `UseViewToolQueryOptions` | `{ enabled? }`.                                                                                                                                                                                                                        |
| `ViewDataResult<T>`       | `{ data, loading, error, refetch }`. Return shape of `useViewData`; `refetch` re-runs the fetch (the error state's retry).                                                                                                             |

## Source map

```
packages/ui/src/
├── primitives/          shadcn base (card, table, button, …)
├── components/          composed components (KpiGrid, Pills, FilterBar, …)
├── lib/                 cn(), parse-tool-result, tone-utils (TONE_*/resolveTone), typography (TYPE_SCALE), focus-ring
├── theme/               createTheme + ThemeProvider + themePresets + CD_TOKENS + fontFaces
│                        + cd-tokens.generated.css (vendored Miragon tokens)
├── theme.css            role tokens (light + dark) over the --cd-* tokens
├── globals.css          tailwindcss + theme.css + @source
├── fonts.css            opt-in Geist / Geist Mono
├── hooks/               use-tool-query, use-mobile, use-debounced-value
│                        + use-view-tool-query, use-view-data (subpath export)
├── providers/           AppQueryProvider + useCallTool
└── app/                 McpToolkitApp + McpAppView + WidgetRenderer + LayoutBuilder
                         + host-bridge + adapt-data-widget
                         + use-host-actions + widget-fixture (subpath export)
```

## See also

- [Widgets concept](../concepts/widgets.md)
- [View builder concept](../concepts/view-builder.md)
- [Building dashboards end-to-end](../guides/building-dashboards.md)
