// shadcn base primitives
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "./primitives/card.js"
export { Badge, badgeVariants } from "./primitives/badge.js"
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./primitives/table.js"
export { Separator } from "./primitives/separator.js"
export { Skeleton } from "./primitives/skeleton.js"
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./primitives/tabs.js"
export { Button, buttonVariants } from "./primitives/button.js"
export { Input } from "./primitives/input.js"
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./primitives/select.js"
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./primitives/dialog.js"
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./primitives/tooltip.js"
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./primitives/dropdown-menu.js"
export { Alert, AlertDescription, AlertTitle } from "./primitives/alert.js"
export { Switch } from "./primitives/switch.js"
export { ScrollArea, ScrollBar } from "./primitives/scroll-area.js"
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./primitives/sheet.js"
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./primitives/sidebar.js"
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./primitives/collapsible.js"

// Hooks
export { useIsMobile } from "./hooks/use-mobile.js"
export { useToolQuery, useToolMutation } from "./hooks/use-tool-query.js"
export type { UseToolQueryOptions } from "./hooks/use-tool-query.js"

// Composed components
export { StatusBadge, DEFAULT_STATUS_MAP } from "./components/StatusBadge.js"
export type { StatusBadgeMap, StatusBadgeEntry } from "./components/StatusBadge.js"
export { KPICard } from "./components/KPICard.js"
export { DataTable } from "./components/DataTable.js"
export type { DataTableColumn, DataTableLabels } from "./components/DataTable.js"
export { EmptyState } from "./components/EmptyState.js"
export { GridLayout, GridItem } from "./components/GridLayout.js"
export { ProgressBar } from "./components/ProgressBar.js"
export { RefreshButton } from "./components/RefreshButton.js"

// Providers
export { AppQueryProvider, useCallTool, queryClient } from "./providers/query-provider.js"

// NOTE: MCP App shell (McpAppView, WidgetRenderer) is exported from the
// `./app` subpath only. Keeping it out of the main barrel prevents consumers
// that only need primitives (e.g. an admin portal) from pulling `mcp-use/react`
// and its langchain transitive peer into their Vite bundle.

// Utils
export { cn } from "./lib/utils.js"

/**
 * Major React version this toolkit ships against. Exported so the host's
 * module-discovery logic and the remote-widget loader can runtime-check
 * that upstream-hosted modules were built against a compatible runtime
 * before mounting their components.
 *
 * Bump in lockstep with the `react` peer dependency in this package's
 * `package.json`.
 */
export const TOOLKIT_REACT_MAJOR = 19 as const
