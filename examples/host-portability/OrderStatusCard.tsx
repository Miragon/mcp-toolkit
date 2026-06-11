import { useCallback, useEffect, useState } from "react"
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import { parseToolResult } from "@miragon/mcp-toolkit-ui"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KpiGrid,
  Separator,
  Skeleton,
} from "@miragon/mcp-toolkit-ui"

/**
 * Inline SVG icons keep this example dependency-free (no `lucide-react`) while
 * staying crisp at any size. `currentColor` lets them inherit the button's text
 * colour across the host themes.
 */
function IconRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={spinning ? "animate-spin" : undefined}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function IconMessage() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  )
}

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
  eta: string
  trackingUrl: string
}

const STATUS_VARIANT: Record<Order["status"], "default" | "secondary" | "outline" | "destructive"> =
  {
    processing: "secondary",
    shipped: "default",
    delivered: "outline",
    cancelled: "destructive",
  }

const STATUS_LABEL: Record<Order["status"], string> = {
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

function formatMoney(total: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(total)
  } catch {
    return `${total} ${currency}`
  }
}

/**
 * A hand-built, host-portable widget. It renders the *same* code in our own
 * `mcp-use` host, inside ChatGPT (OpenAI Apps SDK), and as a standalone web app
 * against an existing MCP server — because the only host surface it touches is
 * {@link useHostBridge}, never `mcp-use/react` or `window.openai` directly.
 *
 * It demonstrates the full bridge surface:
 * - `getWidgetData()` — read host-pushed data as the initial render (no flash).
 * - `callTool()` — refresh the order from the server.
 * - `sendFollowup()` — hand a prompt back to the conversation (ask the agent).
 * - `openExternal()` — open the carrier tracking page outside the frame.
 * - `theme` — adapt to the host's colour scheme.
 */
export function OrderStatusCard({ orderId = "ORD-4471" }: { orderId?: string }) {
  const bridge = useHostBridge()

  // Seed from host-pushed data when present (ChatGPT toolOutput / mcp-use
  // structuredContent), so the first paint has content instead of a spinner.
  const [order, setOrder] = useState<Order | null>(() => bridge.getWidgetData<Order>())
  const [loading, setLoading] = useState(order === null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await bridge.callTool("get_order", { id: orderId })
      setOrder(parseToolResult<Order>(res))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [bridge, orderId])

  // Fetch when the host pushed no data (the standalone case); the seeded path
  // (mcp-use / ChatGPT toolOutput) already has data. `load` is memoized on
  // (bridge, orderId), so this re-runs exactly when the bridge or order changes.
  useEffect(() => {
    if (bridge.getWidgetData<Order>() === null) void load()
  }, [bridge, load])

  const askAboutDelay = useCallback(() => {
    if (!order) return
    bridge.sendFollowup(
      `Order ${order.id} for ${order.customer} is "${order.status}" with ETA ${order.eta}. ` +
        `Is it running late, and what should I tell the customer? (use get_order)`,
    )
    bridge.setModelContext?.(`Viewing order ${order.id} (${order.status})`)
  }, [bridge, order])

  const openTracking = useCallback(() => {
    if (order) bridge.openExternal(order.trackingUrl)
  }, [bridge, order])

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {order ? order.id : orderId}
              {order && (
                <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
              )}
            </CardTitle>
            <CardDescription className="truncate">
              {order ? order.customer : "Loading order…"}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh order"
          >
            <IconRefresh spinning={loading} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error ? (
          <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>
        ) : loading && !order ? (
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : order ? (
          <>
            <KpiGrid
              cells={[
                { label: "Total", value: formatMoney(order.total, order.currency) },
                { label: "Items", value: order.items },
                { label: "ETA", value: order.eta },
              ]}
            />

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="default" onClick={askAboutDelay}>
                <IconMessage />
                Ask the agent
              </Button>
              <Button size="sm" variant="outline" onClick={openTracking}>
                <IconExternal />
                Track shipment
              </Button>
              <span className="text-muted-foreground ml-auto text-xs">
                {bridge.theme ? `host theme: ${bridge.theme}` : "host theme: unknown"}
              </span>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
