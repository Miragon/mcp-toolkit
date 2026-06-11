import * as React from "react"
import * as ReactDOMClient from "react-dom/client"
import { createRoot } from "react-dom/client"
import { McpToolkitApp, adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"
import { ArticleCard } from "../modules/articles/widgets/ArticleCard.js"
import { TasksBoard } from "../modules/tasks/widgets/TasksBoard.js"
import type { TasksBoardData } from "../modules/tasks/store.js"
import { OrdersKpi } from "../modules/orders/widgets/OrdersKpi.js"
import { OrdersTable } from "../modules/orders/widgets/OrdersTable.js"
import type { OrdersDashboardData } from "../modules/orders/store.js"
import "./main.css"

// Expose the host's React + ReactDOM on globalThis so upstream-hosted widget
// bundles can import them through the `<script type="importmap">` shim in
// index.html. The shim re-exports `globalThis.React` / `globalThis.ReactDOM`,
// guaranteeing the widget mounts against the same React instance as the host
// (hooks + context rely on instance identity, not just version parity).
Object.assign(globalThis, { React, ReactDOM: ReactDOMClient })

// Host-bundled widget registry. Upstream-hosted widgets (e.g. the customers
// module) are fetched at runtime via the toolkit's default widget loader
// (`read-widget-bundle`), so they don't need to be listed here.
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

const root = document.getElementById("root")
if (!root) throw new Error("missing #root")
createRoot(root).render(<McpToolkitApp widgets={widgets} />)
