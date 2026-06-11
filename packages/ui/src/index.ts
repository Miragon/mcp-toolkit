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

// Hooks
// NOTE: the view-tool hooks (`useViewToolQuery`, `useViewData`) are exported
// from the `./hooks` subpath only — see `packages/ui/src/hooks/index.ts`.
export { useIsMobile } from "./hooks/use-mobile.js"
export { useToolQuery, useToolMutation } from "./hooks/use-tool-query.js"
export type { UseToolQueryOptions } from "./hooks/use-tool-query.js"
export { useDebouncedValue } from "./hooks/use-debounced-value.js"

// Tone token system — the semantic status tones (ToneVariant + TONE_* maps)
// behind the tone-aware components below. Pure data + class strings.
export { TONE_SOFT, TONE_DOT, TONE_TEXT } from "./lib/tone-utils.js"
export type { ToneVariant } from "./lib/tone-utils.js"

// Composed components — focused widget building blocks assembled from the
// primitives. Pure (React + primitives + cn), so they live in the root barrel.
export { GridLayout, GridItem } from "./components/GridLayout.js"
export type { GridLayoutProps, GridItemProps } from "./components/GridLayout.js"
export { KpiGrid } from "./components/KpiGrid.js"
export type { KpiGridProps, KpiGridHeader, KpiCell } from "./components/KpiGrid.js"
export { LivePill, CountPill } from "./components/Pills.js"
export type { LivePillProps, CountPillProps } from "./components/Pills.js"
export { SectionHeading } from "./components/SectionHeading.js"
export type { SectionHeadingProps } from "./components/SectionHeading.js"
export { WidgetHeader } from "./components/WidgetHeader.js"
export type { WidgetHeaderProps } from "./components/WidgetHeader.js"
export { GroupCard } from "./components/GroupCard.js"
export type { GroupCardProps } from "./components/GroupCard.js"
export { FilterBar } from "./components/FilterBar.js"
export type { FilterBarProps, FilterChip } from "./components/FilterBar.js"
export { DrillButton } from "./components/DrillButton.js"
export type { DrillButtonProps } from "./components/DrillButton.js"
export { ListFooter } from "./components/ListFooter.js"
export type { ListFooterProps } from "./components/ListFooter.js"

// Providers
export { AppQueryProvider, useCallTool, queryClient } from "./providers/query-provider.js"

// Theming / white-label token system. Browser-safe (React + DOM only, no
// `mcp-use/react`), so it belongs in this root barrel: a consumer can re-skin
// the toolkit's primitives from a single switch without pulling in the host
// runtime. See packages/ui/src/theme/ and docs/guides/white-labeling.md.
export { createTheme, ThemeProvider, useTheme, themePresets } from "./theme/index.js"
export type {
  ThemeTokens,
  ThemeDefinition,
  ThemeVars,
  CreateThemeOptions,
  ThemeMode,
  ThemeContextValue,
  ThemeProviderProps,
  ThemePresetId,
} from "./theme/index.js"

// NOTE: MCP App shell (McpAppView, WidgetRenderer) is exported from the
// `./app` subpath only. Keeping it out of the main barrel prevents consumers
// that only need primitives (e.g. an admin portal) from pulling `mcp-use/react`
// and its langchain transitive peer into their Vite bundle.

// Utils
export { cn } from "./lib/utils.js"
export { parseToolResult, parseViewToolResult } from "./lib/parse-tool-result.js"
export type { ParseToolResultOptions } from "./lib/parse-tool-result.js"

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
