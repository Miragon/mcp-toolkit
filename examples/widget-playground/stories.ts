import type { FixtureToolEntry, FixtureWidget } from "@miragon/mcp-toolkit-ui/app"
import CustomerCard from "./CustomerCard.js"
import { ArticleCard } from "../modules/articles/widgets/ArticleCard.js"
import { TasksBoard } from "../modules/tasks/widgets/TasksBoard.js"
import type { TasksBoardData } from "../modules/tasks/store.js"
import { OrdersKpi } from "../modules/orders/widgets/OrdersKpi.js"
import { OrdersTable } from "../modules/orders/widgets/OrdersTable.js"
import type { OrdersDashboardData } from "../modules/orders/store.js"
import { MetricsShowcase } from "./widgets/MetricsShowcase.js"

/**
 * A single playground entry: a widget plus everything the {@link WidgetFixtureHost}
 * needs to render it in isolation. Adding a widget to the playground means adding
 * one `Story` here — no host, no backend, no MCP wiring.
 */
export interface Story {
  /** Stable id used in the URL-free sidebar selection. */
  id: string
  /** Human label shown in the sidebar. */
  label: string
  /** One-line description of what the widget shows. */
  description: string
  /** The widget component under test. */
  widget: FixtureWidget
  /** Default fixture data, pretty-printed into the editor on selection. */
  data: Record<string, unknown>
  /** `dataType` for `adaptDataWidget` components (seeds a pipeline step). */
  dataType?: string
  /** Tool fixtures the widget may call (via `useToolQuery` or `callTool`). */
  tools?: Record<string, FixtureToolEntry>
}

const ARTICLE = {
  id: "a-114",
  title: "Routing operations across multiple engines",
  author: "Dominik Horn",
  publishedAt: "2026-05-21",
  body:
    "Federating several CIB Seven engines behind one MCP surface lets an operator " +
    "drive incidents, jobs, and analytics from a single cockpit. This article walks " +
    "through the registry, the per-engine clients, and the metric-first analytics path.",
}

const TASKS_BOARD: TasksBoardData = {
  generatedAt: "2026-06-10T12:00:00.000Z",
  counts: { total: 4, todo: 2, doing: 1, done: 1 },
  tasks: [
    {
      id: "t-1",
      title: "Draft the onboarding guide",
      status: "todo",
      priority: "high",
      createdAt: "2026-06-01T09:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t-2",
      title: "Review pull request #42",
      status: "doing",
      priority: "medium",
      createdAt: "2026-06-02T11:30:00.000Z",
      completedAt: null,
    },
    {
      id: "t-3",
      title: "Reply to the design feedback",
      status: "todo",
      priority: "low",
      createdAt: "2026-06-03T14:15:00.000Z",
      completedAt: null,
    },
    {
      id: "t-4",
      title: "Ship the release notes",
      status: "done",
      priority: "medium",
      createdAt: "2026-05-28T08:45:00.000Z",
      completedAt: "2026-05-29T16:20:00.000Z",
    },
  ],
}

/**
 * The combined dashboard view-model both orders widgets render. The KPI widget
 * reads the `kpi` slice; the table widget reads the `table` slice. In the real
 * module this is what the `orders:list-customer-orders` step emits (and what
 * `buildComposedView` tags as `_dataType: "orders:dashboard"`).
 */
const ORDERS_DASHBOARD: OrdersDashboardData = {
  kpi: {
    customer: { id: "c-1", name: "Miravelo Leasing GmbH", tier: "premium" },
    counts: { total: 4, open: 1, paid: 1, shipped: 1, cancelled: 1 },
    revenueCents: 199800,
  },
  table: {
    customer: { id: "c-1", name: "Miravelo Leasing GmbH", tier: "premium" },
    orders: [
      {
        id: "o-1003",
        customerId: "c-1",
        summary: "Replacement battery pack",
        status: "open",
        amountCents: 31900,
        placedAt: "2026-06-01T14:05:00.000Z",
      },
      {
        id: "o-1002",
        customerId: "c-1",
        summary: "Annual service contract",
        status: "paid",
        amountCents: 120000,
        placedAt: "2026-05-18T08:40:00.000Z",
      },
      {
        id: "o-1001",
        customerId: "c-1",
        summary: "3× Cargo bike rack",
        status: "shipped",
        amountCents: 47900,
        placedAt: "2026-05-02T10:15:00.000Z",
      },
      {
        id: "o-1004",
        customerId: "c-1",
        summary: "Damaged in transit (refunded)",
        status: "cancelled",
        amountCents: 8900,
        placedAt: "2026-06-03T09:20:00.000Z",
      },
    ],
  },
}

export const STORIES: Story[] = [
  {
    id: "tasks-board",
    label: "TasksBoard",
    description:
      "Self-owned module widget: host-pushed data via adaptDataWidget, KPI counts, FilterBar, tone status pills, and agentic add/complete handoffs. Refresh self-fetches tasks_board_data.",
    widget: TasksBoard as FixtureWidget,
    // Raw `({ data })` widget: the fixture object is forwarded as `data` verbatim.
    data: TASKS_BOARD as unknown as Record<string, unknown>,
    tools: {
      // The Refresh button calls this feed; the fixture echoes the board so the
      // Host activity panel logs the callTool and the preview re-renders.
      tasks_board_data: () => TASKS_BOARD,
    },
  },
  {
    id: "customer-card",
    label: "CustomerCard",
    description:
      "Dependency-free fixture card (inline styles, no toolkit primitives). Reads keys['customers:customer'] — pure props, no tool calls.",
    widget: CustomerCard,
    data: {
      "customers:customer": {
        id: "c-2048",
        name: "Miravelo Leasing GmbH",
        email: "ops@miravelo.example",
        tier: "gold",
        since: "2021-08-03",
      },
    },
  },
  {
    id: "article-card",
    label: "ArticleCard",
    description:
      "Host-bundled card that self-fetches via useToolQuery. Reads keys['articles:articleId'], then calls the articles_get-article tool fixture.",
    widget: ArticleCard,
    data: { "articles:articleId": ARTICLE.id },
    tools: {
      // The generated useArticlesGetArticle hook calls this tool with { id }.
      // The handler echoes the requested id so editing the key re-fetches live.
      "articles_get-article": (args: Record<string, unknown>) => ({
        ...ARTICLE,
        id: typeof args.id === "string" ? args.id : ARTICLE.id,
      }),
    },
  },
  {
    id: "metrics-showcase",
    label: "MetricsShowcase",
    description:
      "Showcase of the promoted composed blocks: WidgetHeader, LivePill, KpiGrid, FilterBar (+ useDebouncedValue), SectionHeading, CountPill, ListFooter. Pure props.",
    widget: MetricsShowcase,
    data: {
      rows: [
        { id: "i-1", name: "Payment timeout", tone: "danger", count: 7 },
        { id: "i-2", name: "Slow webhook", tone: "warning", count: 3 },
        { id: "i-3", name: "Retry backlog", tone: "neutral", count: 12 },
      ],
    },
  },
  {
    id: "orders-kpi",
    label: "OrdersKpi",
    description:
      "First cell of the orders dashboard. A `({ data })` widget registered with adaptDataWidget(…, 'orders:dashboard'); reads the `.kpi` slice of the shared dashboard object. Built from KpiGrid + WidgetHeader + pills/badges. Pure props.",
    widget: OrdersKpi as FixtureWidget,
    // The fixture is the COMBINED dashboard object; OrdersKpi reads only `.kpi`.
    data: ORDERS_DASHBOARD as unknown as Record<string, unknown>,
    dataType: "orders:dashboard",
  },
  {
    id: "orders-table",
    label: "OrdersTable",
    description:
      "Second cell of the orders dashboard. Same shared 'orders:dashboard' dataType as OrdersKpi; reads the `.table` slice. Built from the Table primitive + SectionHeading + tone status pills. Pure props.",
    widget: OrdersTable as FixtureWidget,
    data: ORDERS_DASHBOARD as unknown as Record<string, unknown>,
    dataType: "orders:dashboard",
  },
]
