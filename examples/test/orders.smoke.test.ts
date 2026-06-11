import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "mcp-use/client"
import type { McpServerInstance } from "mcp-use/server"
import { createPlugin as createOrdersPlugin } from "../modules/orders/plugin.js"
import type { Customer, OrdersDashboardData } from "../modules/orders/store.js"

/**
 * In-process smoke test for the `orders` module — the proof that the toolkit's
 * TWO composition paths both work against one self-owned module:
 *
 *   1. The DECLARATIVE two-step pipeline via `render-view` — and, crucially, that
 *      STEP B *consumes STEP A's output* (the chaining the rest of the toolkit
 *      only exercises in a single unit test). We assert that A produced
 *      `orders:customer`, B ran (not skipped) and produced `orders:orderList`, and
 *      B's emitted `orders:dashboard` step data is scoped to the SAME customer A
 *      resolved.
 *   2. The EAGER multi-widget dashboard via `show_orders_dashboard` — that it
 *      returns a composed view with a TWO-CELL layout, both cells carrying the
 *      `orders:dashboard` data so the two widgets render their slices.
 *
 * Boots a real MCP server via `createFrameworkApp` over a loopback socket and
 * drives it with an MCP client. Runs in CI through the root `pnpm -r test`.
 */

const FIXTURE_HTML = path.join(import.meta.dirname, "fixtures", "mcp-app.html")

/** Reserve a free TCP port by binding to port 0 and releasing it again. */
async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

/** Minimal view of `render-view`'s structuredContent envelope, for the asserts. */
interface ViewEnvelope {
  title?: string
  layout?: unknown
  context?: {
    keys: Record<string, unknown>
    stepIds: string[]
    stepData: Record<string, { data: unknown; keys: Record<string, unknown>; _dataType?: string }>
    errors: { stepId: string; reason: string }[]
  }
}

describe("orders module smoke", () => {
  let app: McpServerInstance<false>
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    app = await createFrameworkApp({
      name: "orders-smoke-host",
      version: "0.0.0",
      host: "127.0.0.1",
      plugins: [createOrdersPlugin()],
      proxies: [],
      app: {
        resourceUri: "ui://orders-smoke/mcp-app.html",
        htmlPath: FIXTURE_HTML,
      },
    })
    const port = await getFreePort()
    await app.listen(port)

    client = MCPClient.fromDict({
      mcpServers: { host: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("host")
  })

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
  })

  it("advertises the module's own tools in tools/list", async () => {
    const names = (await session.listTools()).map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(["list_customers", "show_orders_dashboard"]))
    // `orders_dashboard_data` is app-only (APP_ONLY_META) — conforming hosts hide
    // it from the LLM tool surface, so we don't assert it appears in tools/list.
  })

  it("list_customers returns the seeded customers as structuredContent", async () => {
    const result = await session.callTool("list_customers", {})
    expect(result.isError).toBeFalsy()
    // A bare array output is auto-wrapped to `{ data: [...] }`.
    const sc = result.structuredContent as { data?: Customer[] } | undefined
    expect(Array.isArray(sc?.data)).toBe(true)
    expect(sc!.data!.length).toBeGreaterThan(0)
    expect(sc!.data!.map((c) => c.id)).toContain("c-1")
  })

  // ── (1) The DECLARATIVE pipeline: STEP B consumes STEP A's output ───────────
  it("render-view runs the 2-step pipeline and STEP B consumes STEP A's output", async () => {
    const result = await session.callTool("render-view", {
      keys: { "orders:customerId": "c-1" },
      steps: [
        { id: "customer", step: "orders:resolve-customer" },
        { id: "orders", step: "orders:list-customer-orders" },
      ],
      layout: {
        rows: [
          { row: [{ widget: "orders:kpi", span: 5 }] },
          { row: [{ widget: "orders:table", span: 7 }] },
        ],
      },
      title: "Orders pipeline view",
    })
    expect(result.isError).toBeFalsy()

    const sc = result.structuredContent as ViewEnvelope | undefined
    expect(sc, "render-view must return structuredContent").toBeTruthy()
    const ctx = sc!.context!

    // No errors → both steps ran (B was NOT skipped on missing keys).
    expect(ctx.errors).toEqual([])
    expect(ctx.stepIds).toEqual(expect.arrayContaining(["customer", "orders"]))

    // STEP A produced `orders:customer`; STEP B produced `orders:orderList` — the
    // executor merged BOTH produced keys into the context. The presence of
    // `orders:orderList` is the proof STEP B actually ran, which it could only do
    // because STEP A's `orders:customer` key satisfied B's `requires` gate.
    const resolvedCustomer = ctx.keys["orders:customer"] as Customer
    expect(resolvedCustomer.id).toBe("c-1")
    expect(ctx.keys).toHaveProperty("orders:orderList")

    // STEP B read STEP A's customer (`ctx.keys["orders:customer"]`) and scoped its
    // `orders:dashboard` output to that SAME customer — the end-to-end chain.
    const stepB = ctx.stepData.orders
    expect(stepB?._dataType).toBe("orders:dashboard")
    const dashboard = stepB!.data as OrdersDashboardData
    expect(dashboard.kpi.customer.id).toBe(resolvedCustomer.id)
    expect(dashboard.table.customer.id).toBe(resolvedCustomer.id)
    // The orderList key B produced equals the table rows it built (same array).
    expect(dashboard.table.orders.length).toBe((ctx.keys["orders:orderList"] as unknown[]).length)
  })

  it("render-view skips STEP B when STEP A errors on an unknown customer id", async () => {
    const result = await session.callTool("render-view", {
      keys: { "orders:customerId": "does-not-exist" },
      steps: [
        { id: "customer", step: "orders:resolve-customer" },
        { id: "orders", step: "orders:list-customer-orders" },
      ],
      layout: { rows: [{ row: [{ widget: "orders:kpi", span: 5 }] }] },
    })
    // The request itself does not fail — the executor records the error fail-soft.
    expect(result.isError).toBeFalsy()
    const sc = result.structuredContent as ViewEnvelope | undefined
    const ctx = sc!.context!

    // STEP A errored (unknown id) so `orders:customer` was never produced; STEP B
    // is reported as missing its required key rather than running on bad data.
    expect(ctx.errors.some((e) => e.stepId === "customer")).toBe(true)
    expect(ctx.keys).not.toHaveProperty("orders:customer")
    expect(ctx.stepData).not.toHaveProperty("orders")
  })

  // ── (2) The EAGER multi-widget dashboard via buildComposedView ──────────────
  it("show_orders_dashboard returns a multi-widget view with a two-cell layout", async () => {
    const result = await session.callTool("show_orders_dashboard", { customerId: "c-1" })
    expect(result.isError).toBeFalsy()

    const sc = result.structuredContent as ViewEnvelope | undefined
    expect(sc, "show_orders_dashboard must return structuredContent").toBeTruthy()

    // The composed layout has ONE row with TWO cells — the multi-widget proof.
    const layout = sc!.layout as { rows: { row: { widget: string }[] }[] }
    expect(layout.rows).toHaveLength(1)
    const cells = layout.rows[0]!.row
    expect(cells).toHaveLength(2)
    expect(cells.map((c) => c.widget)).toEqual(["orders:kpi", "orders:table"])

    // Both composed entries carry the `orders:dashboard` data so each widget can
    // render its slice. `buildComposedView` keyed them by their stable ids.
    const ctx = sc!.context!
    expect(ctx.stepIds).toEqual(expect.arrayContaining(["kpi", "table"]))
    const kpiEntry = ctx.stepData.kpi
    expect(kpiEntry?._dataType).toBe("orders:dashboard")
    const dashboard = kpiEntry!.data as OrdersDashboardData
    expect(dashboard.kpi.customer.id).toBe("c-1")
    expect(dashboard.table.orders.length).toBe(dashboard.kpi.counts.total)
  })

  it("show_orders_dashboard defaults to c-1 when no customerId is given", async () => {
    const result = await session.callTool("show_orders_dashboard", {})
    expect(result.isError).toBeFalsy()
    const sc = result.structuredContent as ViewEnvelope | undefined
    const dashboard = sc!.context!.stepData.kpi!.data as OrdersDashboardData
    expect(dashboard.kpi.customer.id).toBe("c-1")
  })
})
