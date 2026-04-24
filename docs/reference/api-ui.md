# `@miragon/mcp-toolkit-ui` — API reference

Two subpath exports.

## `@miragon/mcp-toolkit-ui` (main)

Primitives, composed components, hooks, providers, utils. No dependency on
`mcp-use/react` — safe to import from admin portals that never mount the
MCP widget shell.

### shadcn primitives

Re-exports of the standard shadcn/ui components, pre-wired to the toolkit's
Tailwind preset.

| Family      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card        | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent`                                                                                                                                                                                                                                                                                                                                                              |
| Badge       | `Badge`, `badgeVariants`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Table       | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`                                                                                                                                                                                                                                                                                                                                                     |
| Button      | `Button`, `buttonVariants`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Input       | `Input`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Select      | `Select`, `SelectContent`, `SelectGroup`, `SelectItem`, `SelectLabel`, `SelectScrollDownButton`, `SelectScrollUpButton`, `SelectSeparator`, `SelectTrigger`, `SelectValue`                                                                                                                                                                                                                                                                                   |
| Dialog      | `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`                                                                                                                                                                                                                                                                                               |
| Sheet       | `Sheet`, `SheetClose`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetTitle`, `SheetTrigger`                                                                                                                                                                                                                                                                                                                                        |
| Tooltip     | `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`                                                                                                                                                                                                                                                                                                                                                                                             |
| Dropdown    | `DropdownMenu`, `DropdownMenuCheckboxItem`, `DropdownMenuContent`, `DropdownMenuGroup`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuPortal`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuTrigger`                                                                                                      |
| Alert       | `Alert`, `AlertDescription`, `AlertTitle`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Tabs        | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                                                                                                                                                                                                                                                                                                                                                                                             |
| Sidebar     | `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupAction`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarHeader`, `SidebarInput`, `SidebarInset`, `SidebarMenu`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubButton`, `SidebarMenuSubItem`, `SidebarProvider`, `SidebarRail`, `SidebarSeparator`, `SidebarTrigger`, `useSidebar` |
| Collapsible | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`                                                                                                                                                                                                                                                                                                                                                                                                    |
| ScrollArea  | `ScrollArea`, `ScrollBar`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Separator   | `Separator`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Skeleton    | `Skeleton`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Switch      | `Switch`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Composed components

| Symbol                                | Purpose                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `StatusBadge`                         | Maps a status string → styled badge via `statusMap`.                   |
| `DEFAULT_STATUS_MAP`                  | Built-in map for common workflow states (`paid`, `IN_PROGRESS`, etc.). |
| `StatusBadgeMap` / `StatusBadgeEntry` | Types for custom maps.                                                 |
| `KPICard`                             | Label + value + delta card for dashboards.                             |
| `DataTable`                           | Sortable / paginated table with cell formatters.                       |
| `DataTableColumn` / `DataTableLabels` | Types for `DataTable`.                                                 |
| `EmptyState`                          | Centered icon + message + optional action.                             |
| `GridLayout` / `GridItem`             | 12-column responsive grid used by `WidgetRenderer`.                    |
| `ProgressBar`                         | Linear progress bar with optional label.                               |
| `RefreshButton`                       | Styled button + spinner for manual refetches.                          |

### Hooks

| Symbol                                  | Signature                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `useToolQuery<TData, TSelected>`        | `(queryKey, toolName, args, opts?) → UseQueryResult`. Parses MCP tool result (content[0].text JSON → structuredContent → raw). |
| `useToolMutation<TData>`                | `(toolName, { invalidateKeys? }?) → UseMutationResult`.                                                                        |
| `UseToolQueryOptions<TData, TSelected>` | `{ enabled?, select? }`.                                                                                                       |
| `useIsMobile`                           | `() → boolean`.                                                                                                                |

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

| Symbol | Signature                                           |
| ------ | --------------------------------------------------- |
| `cn`   | `(...classes) → string`. `clsx` + `tailwind-merge`. |

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

| Symbol                            | Signature                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `McpToolkitApp`                   | `(props: McpAppViewProps) → JSX.Element`. `<McpUseProvider><McpAppView {...props} /></McpUseProvider>`.                                                                                                                                      |
| `McpAppView`                      | `(props: McpAppViewProps) → JSX.Element`. Top-level view. Use directly only if you already own the `McpUseProvider` wiring.                                                                                                                  |
| `McpAppViewProps`                 | `{ widgets, widgetLoader?, refreshToolName?, remoteBundleToolName?, labels? }`. See table below.                                                                                                                                             |
| `McpAppViewLabels`                | Override strings: `loading`, `refresh`, `refreshing`, `enterFullscreen`, `exitFullscreen`. Defaults: English.                                                                                                                                |
| `WidgetRenderer`                  | Lower-level component — renders a normalised layout given the widgets map. Used internally by `McpAppView`.                                                                                                                                  |
| `WidgetRendererProps`             | `{ layout, keys, stepData?, errors, widgets }`.                                                                                                                                                                                              |
| `WidgetComponent`                 | `ComponentType<WidgetProps>`.                                                                                                                                                                                                                |
| `createRemoteWidgetLoader`        | `(opts: CreateRemoteWidgetLoaderOptions) → WidgetLoader`. Builds a loader that fetches widget JS through `fetchResource`, evaluates via Blob URL + dynamic `import()`, returns `default`. Asserts `React.version` major matches the toolkit. |
| `WidgetLoader`                    | `(id: string, uri: string) => Promise<WidgetComponent>`.                                                                                                                                                                                     |
| `FetchResourceText`               | `(id: string, uri: string) => Promise<string>`. Transport the loader uses to read the bundle's JS source.                                                                                                                                    |
| `CreateRemoteWidgetLoaderOptions` | `{ fetchResource, evaluateBundle?, expectedReactMajor? }`. Only `fetchResource` is required — the other two are test hooks.                                                                                                                  |

### `McpAppViewProps` in detail

| Prop                    | Type                              | Default                | Purpose                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `widgets`               | `Record<string, WidgetComponent>` | —                      | Host-bundled widget registry, keyed by widget id.                                                                                                                                                                       |
| `widgetLoader?`         | `WidgetLoader`                    | built-in (see below)   | Lazily loads widgets referenced by the layout but missing from `widgets` (upstream-hosted modules). The default loader calls `read-widget-bundle` via the host bridge and evaluates the returned JS — no wiring needed. |
| `refreshToolName?`      | `string`                          | `"refresh-view"`       | Tool invoked by the refresh button. Usually a thin wrapper around `renderView(...)` on the host.                                                                                                                        |
| `remoteBundleToolName?` | `string`                          | `"read-widget-bundle"` | Tool name the default `widgetLoader` uses to fetch an upstream-hosted widget's source. Ignored when `widgetLoader` is supplied.                                                                                         |
| `labels?`               | `McpAppViewLabels`                | English                | Override UI strings (loading, refresh, fullscreen toggle).                                                                                                                                                              |

## Source map

```
packages/ui/src/
├── primitives/          shadcn base (card, table, button, …)
├── components/          composed components (DataTable, StatusBadge, …)
├── hooks/               use-tool-query, use-mobile
├── providers/           AppQueryProvider + useCallTool
├── app/                 McpToolkitApp + McpAppView + WidgetRenderer
│                        + remote-widget-loader (subpath export)
└── lib/utils.ts         cn()
```

## See also

- [Widgets concept](../concepts/widgets.md)
- [Building a UI-only module](../guides/building-a-ui-only-module.md)
