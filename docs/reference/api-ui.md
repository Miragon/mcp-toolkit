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
admin portals don't pull `langchain` into their Vite bundle.

| Symbol                | Signature                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `McpAppView`          | `(props: McpAppViewProps) → JSX.Element`. The top-level component bundled inside the `mcp-app-html` resource. |
| `McpAppViewProps`     | `{ widgets: Record<string, WidgetComponent>, refreshToolName?: string, labels?: McpAppViewLabels }`.          |
| `McpAppViewLabels`    | Override strings: `loading`, `refresh`, `refreshing`, `enterFullscreen`, `exitFullscreen`. Defaults: English. |
| `WidgetRenderer`      | Lower-level component — renders a normalized layout given the widgets map. Used internally by `McpAppView`.   |
| `WidgetRendererProps` | `{ layout, keys, stepData?, errors, widgets }`.                                                               |
| `WidgetComponent`     | `ComponentType<WidgetProps>`.                                                                                 |

## Source map

```
packages/ui/src/
├── primitives/          shadcn base (card, table, button, …)
├── components/          composed components (DataTable, StatusBadge, …)
├── hooks/               use-tool-query, use-mobile
├── providers/           AppQueryProvider + useCallTool
├── app/                 McpAppView + WidgetRenderer (subpath export)
└── lib/utils.ts         cn()
```

## See also

- [Widgets concept](../concepts/widgets.md)
- [Building a UI-only module](../guides/building-a-ui-only-module.md)
