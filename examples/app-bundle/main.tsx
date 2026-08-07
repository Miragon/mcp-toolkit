import { mountMcpToolkitApp, adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"
import { ArticleCard } from "../modules/articles/widgets/ArticleCard.js"
import { TasksBoard } from "../modules/tasks/widgets/TasksBoard.js"
import type { TasksBoardData } from "../modules/tasks/store.js"
import { OrdersKpi } from "../modules/orders/widgets/OrdersKpi.js"
import { OrdersTable } from "../modules/orders/widgets/OrdersTable.js"
import type { OrdersDashboardData } from "../modules/orders/store.js"
import "./main.css"

// Host-bundled widget registry: every widget id declared in a plugin's
// `definition.ts` maps to its React component here — the bundle is the single
// place widget code lives.
const widgets = {
  "articles:article-card": ArticleCard,
  // `TasksBoard` is a single-data `({ data })` widget. `adaptDataWidget` wraps it
  // so the framework's `WidgetProps` (keys/context) resolve into the `data` prop:
  // it finds the step whose `_dataType` is `"tasks:board"` (set by
  // `buildSingleWidgetView` in `show_tasks_board`) and forwards its data.
  "tasks:board": adaptDataWidget<TasksBoardData>(TasksBoard, "tasks:board"),

  // The orders dashboard's two widgets. BOTH resolve the SAME step `dataType`
  // `"orders:dashboard"`: `adaptDataWidget` finds the step whose `_dataType` matches
  // and forwards its `data`, then each widget renders its own slice (KPI reads
  // `.kpi`, table reads `.table`). The third argument is `describeForModel` — the
  // adapter wraps the widget in a `<ModelContext>` so the model knows what the user
  // is looking at (without per-widget boilerplate). The SAME two registrations serve
  // both composition paths: the eager `show_orders_dashboard` (`buildComposedView`)
  // and the `render-view` pipeline (`orders-dashboard.yaml`) — because both tag the
  // data with `_dataType: "orders:dashboard"`.
  "orders:kpi": adaptDataWidget<OrdersDashboardData>(
    OrdersKpi,
    "orders:dashboard",
    (d) =>
      `Orders KPI for ${d.kpi.customer.name}: ${d.kpi.counts.total} order(s), ` +
      `${d.kpi.counts.open} open. Revenue €${(d.kpi.revenueCents / 100).toFixed(2)}.`,
  ),
  "orders:table": adaptDataWidget<OrdersDashboardData>(
    OrdersTable,
    "orders:dashboard",
    (d) => `Orders table for ${d.table.customer.name}: ${d.table.orders.length} order(s) listed.`,
  ),
}

// Since mcp-use 2.x the view runtime owns the mount: `mountMcpToolkitApp`
// wraps `bootstrapView`, which creates the root, connects the ext-apps
// postMessage bridge to the host, and auto-reports size changes.
mountMcpToolkitApp({ widgets })
