/**
 * Acceptance test for T1: a full module with 5 REST endpoints defined in <100 LOC.
 *
 * This doubles as executable documentation — the shape below is the idiomatic
 * way to wrap a REST upstream as MCP tools using the toolkit.
 */
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createRestClient } from "./client.js"
import { createRestTool } from "./tool.js"
import type { RestClient } from "./types.js"

interface Order {
  id: string
  customerId: string
  totalAmount: number
  currency: string
  status: string
  createdAt: string
}

function orderTools() {
  return [
    createRestTool<{ orderId: string }, Order, { id: string; total: number; status: string }>({
      name: "get_order",
      description: "Fetch one order by ID.",
      method: "GET",
      path: "/orders/{orderId}",
      inputSchema: { orderId: z.string() },
      projection: (raw) => ({ id: raw.id, total: raw.totalAmount, status: raw.status }),
      annotations: { readOnlyHint: true },
    }),
    createRestTool({
      name: "list_orders",
      description: "List recent orders.",
      method: "GET",
      path: "/orders",
      inputSchema: { limit: z.number().int().positive().optional() },
      annotations: { readOnlyHint: true },
    }),
    createRestTool({
      name: "create_order",
      description: "Create a new order.",
      method: "POST",
      path: "/customers/{customerId}/orders",
      inputSchema: {
        customerId: z.string(),
        total: z.number().positive(),
        currency: z.string().length(3),
      },
    }),
    createRestTool({
      name: "update_order_status",
      description: "Update the status of an order.",
      method: "PATCH",
      path: "/orders/{orderId}",
      inputSchema: {
        orderId: z.string(),
        status: z.enum(["pending", "paid", "shipped", "cancelled"]),
      },
      annotations: { idempotentHint: true },
    }),
    createRestTool({
      name: "delete_order",
      description: "Delete an order.",
      method: "DELETE",
      path: "/orders/{orderId}",
      inputSchema: { orderId: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    }),
  ]
}

describe("example orders module", () => {
  it("wires 5 endpoints against a RestClient", async () => {
    const fetchStub: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "o-1",
            customerId: "c-1",
            totalAmount: 99,
            currency: "EUR",
            status: "paid",
            createdAt: "2026-01-01T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
    const client: RestClient = createRestClient({
      baseUrl: "https://api.example.com/v1",
      auth: { mode: "bearer", token: "t" },
      fetch: fetchStub,
    })

    const tools = orderTools()
    expect(tools.map((t) => t.name)).toEqual([
      "get_order",
      "list_orders",
      "create_order",
      "update_order_status",
      "delete_order",
    ])

    const firstTool = tools[0]
    if (!firstTool) throw new Error("test fixture invariant: tools must be non-empty")
    const projected = await firstTool.handler(client, { orderId: "o-1" })
    expect(projected).toEqual({ id: "o-1", total: 99, status: "paid" })
  })
})
