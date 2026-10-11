/**
 * The shape `get_order` returns. The same shape is produced by all three host
 * bridges in this example, because the widget never knows (or cares) which host
 * it runs in — it only talks to `useHostBridge()`.
 */
export interface Order {
  id: string
  customer: string
  status: "processing" | "shipped" | "delivered" | "cancelled"
  total: number
  currency: string
  items: number
  /** Estimated delivery date, ISO-8601 (`2026-06-14`). */
  eta: string
  trackingUrl: string
}
