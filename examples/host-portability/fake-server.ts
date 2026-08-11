import type { Order } from "./OrderStatusCard.js"

/**
 * A tiny in-memory stand-in for a real MCP server. All three host bridges in
 * this example resolve their tool calls through this one function, so the demo
 * is honest: the *same* widget hitting the *same* "server", only the host
 * runtime differs. In the standalone case this is exactly where you would wire a
 * `@modelcontextprotocol/client` `Client.callTool` against a real server instead.
 */
const ORDERS: Record<string, Order> = {
  "ORD-4471": {
    id: "ORD-4471",
    customer: "Miravelo Leasing GmbH",
    status: "shipped",
    total: 12480.5,
    currency: "EUR",
    items: 7,
    eta: "Jun 12",
    trackingUrl: "https://tracking.example/ORD-4471",
  },
  "ORD-4490": {
    id: "ORD-4490",
    customer: "Nordwind Logistik AG",
    status: "processing",
    total: 3299.0,
    currency: "EUR",
    items: 2,
    eta: "Jun 16",
    trackingUrl: "https://tracking.example/ORD-4490",
  },
}

/**
 * Resolve a tool call the way an MCP server would: return a `CallToolResponse`
 * envelope with both `structuredContent` (what the widget reads via
 * `parseToolResult`) and a short `content` text block (what a model would see).
 * Rejects on an unknown order so the widget's error path is exercised.
 */
export async function callFakeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ structuredContent: Order; content: { type: "text"; text: string }[] }> {
  // A touch of latency so the loading state is visible in the demo.
  await new Promise((r) => setTimeout(r, 250))

  if (name !== "get_order") {
    throw new Error(`Unknown tool "${name}" (this demo server only knows get_order).`)
  }
  const id = typeof args.id === "string" ? args.id : "ORD-4471"
  const order = ORDERS[id]
  if (!order) {
    throw new Error(`No order "${id}". Known: ${Object.keys(ORDERS).join(", ")}.`)
  }
  return {
    structuredContent: order,
    content: [{ type: "text", text: `Order ${order.id} for ${order.customer}: ${order.status}.` }],
  }
}

/** The data a host pushes into the widget up front (toolOutput / structuredContent). */
export function seedOrder(id = "ORD-4471"): Order | null {
  return ORDERS[id] ?? null
}

/** Ids the demo lets you switch between. */
export const ORDER_IDS = Object.keys(ORDERS)
