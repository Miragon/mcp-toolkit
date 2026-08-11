import type { ReactElement } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  ScrollArea,
  ScrollBar,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./index.js"

/**
 * One SSR render case (see `render-cases.tsx`, which aggregates this module's
 * primitive cases with the composed/host ones — split only to respect the
 * 400-effective-line budget; the exported surface is `RENDER_CASES` there).
 */
export interface RenderCase {
  /** Catalog entry name (`ui-catalog.json` → `components[].name`) this case covers. */
  name: string
  /** Distinctive text expected in the SSR markup, when the component can carry one. */
  marker?: string
  /** Renders the component with minimal realistic props. */
  render: () => ReactElement
}

const noop = (): void => {}

/** SSR render cases for the catalogued shadcn primitives (kind "primitive"). */
export const PRIMITIVE_RENDER_CASES: RenderCase[] = [
  {
    name: "Card",
    marker: "RC:Card",
    render: () => (
      <Card size="sm">
        <CardHeader>
          <CardTitle>RC:Card</CardTitle>
          <CardDescription>Order summary</CardDescription>
          <CardAction>
            <Badge variant="outline">new</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>Three orders this week.</CardContent>
        <CardFooter>Updated just now</CardFooter>
      </Card>
    ),
  },
  {
    name: "Badge",
    marker: "RC:Badge",
    render: () => <Badge variant="secondary">RC:Badge</Badge>,
  },
  {
    name: "Button",
    marker: "RC:Button",
    render: () => (
      <Button variant="outline" size="sm" onClick={noop}>
        RC:Button
      </Button>
    ),
  },
  {
    // The marker lands in the placeholder/value attributes of the markup.
    name: "Input",
    marker: "RC:Input",
    render: () => <Input type="text" placeholder="RC:Input" defaultValue="42" onChange={noop} />,
  },
  {
    // SSR limitation: SelectContent renders through a Radix portal targeting
    // document.body, which does not exist server-side — the portal yields
    // nothing. The trigger + placeholder are the SSR surface; item/label
    // rendering needs a browser host.
    name: "Select",
    marker: "RC:Select",
    render: () => (
      <Select onValueChange={noop}>
        <SelectTrigger>
          <SelectValue placeholder="RC:Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Period</SelectLabel>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectSeparator />
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    ),
  },
  {
    // The marker lands in the aria-label attribute of the markup.
    name: "Switch",
    marker: "RC:Switch",
    render: () => <Switch defaultChecked aria-label="RC:Switch" onCheckedChange={noop} />,
  },
  {
    name: "Table",
    marker: "RC:Table",
    render: () => (
      <Table>
        <TableCaption>RC:Table</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>o-1001</TableCell>
            <TableCell>shipped</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>1 order</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    ),
  },
  {
    name: "Tabs",
    marker: "RC:Tabs",
    render: () => (
      <Tabs defaultValue="overview" onValueChange={noop}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="detail">Detail</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">RC:Tabs</TabsContent>
        <TabsContent value="detail">Per-order detail</TabsContent>
      </Tabs>
    ),
  },
  {
    // SSR limitation: DialogContent renders through a Radix portal targeting
    // document.body, so the modal body cannot SSR even with `open` — the
    // trigger is the SSR surface. Portal content needs a browser host.
    name: "Dialog",
    marker: "RC:Dialog",
    render: () => (
      <Dialog open onOpenChange={noop}>
        <DialogTrigger>RC:Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive order?</DialogTitle>
            <DialogDescription>The order can be restored later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    // SSR limitation: same portal constraint as Dialog — SheetContent targets
    // document.body; the trigger is the SSR surface.
    name: "Sheet",
    marker: "RC:Sheet",
    render: () => (
      <Sheet open onOpenChange={noop}>
        <SheetTrigger>RC:Sheet</SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Order o-1001</SheetTitle>
            <SheetDescription>Edit without leaving the widget.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose>Close</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    ),
  },
  {
    name: "Alert",
    marker: "RC:Alert",
    render: () => (
      <Alert variant="destructive">
        <AlertTitle>RC:Alert</AlertTitle>
        <AlertDescription>The engine rejected the job.</AlertDescription>
      </Alert>
    ),
  },
  {
    name: "ScrollArea",
    marker: "RC:ScrollArea",
    render: () => (
      <ScrollArea className="h-24">
        <div>RC:ScrollArea</div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    ),
  },
  {
    // Pure placeholder box — no text content to mark.
    name: "Skeleton",
    render: () => <Skeleton className="h-6 w-32" />,
  },
  {
    // Decorative divider — no text content to mark.
    name: "Separator",
    render: () => <Separator orientation="horizontal" />,
  },
]
