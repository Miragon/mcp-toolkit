import { useCallback, useEffect, useState } from "react"
import { ExternalLink, MessageSquare, RefreshCw } from "lucide-react"
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
  ErrorState,
  KpiGrid,
  Separator,
  Skeleton,
  formatCount,
  useLocale,
} from "@miragon/mcp-toolkit-ui"
import { useOrderCardText } from "./messages.js"

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

/** The order status is a state, so it takes a status tone (tint, rim, foreground text). */
const STATUS_VARIANT: Record<Order["status"], "secondary" | "info" | "success" | "danger"> = {
  processing: "secondary",
  shipped: "info",
  delivered: "success",
  cancelled: "danger",
}

function formatMoney(total: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(total)
  } catch {
    return `${total} ${currency}`
  }
}

/** An ISO date (`2026-06-14`) as day and month in the widget's locale; anything else verbatim. */
function formatDay(iso: string, locale: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date)
  } catch {
    return iso
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
 *
 * Every word comes from its en/de catalog (`messages.ts`); money, counts and
 * dates are formatted in the locale the host sets (`useLocale()`).
 *
 * Icons are Lucide (`lucide-react`, the version the toolkit depends on), so
 * they take the stroke the toolkit sets instead of a hand-drawn one. The
 * deterministic action (tracking) leads; the chat hand-off is the secondary
 * button and says that it asks the agent.
 */
export function OrderStatusCard({ orderId = "ORD-4471" }: { orderId?: string }) {
  const bridge = useHostBridge()
  const locale = useLocale()
  const text = useOrderCardText()

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
      text.askPrompt(order, text.status[order.status], formatDay(order.eta, locale)),
    )
    bridge.setModelContext?.(`Viewing order ${order.id} (${order.status})`)
  }, [bridge, order, text, locale])

  const openTracking = useCallback(() => {
    if (order) bridge.openExternal(order.trackingUrl)
  }, [bridge, order])

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {order ? order.id : orderId}
              {order && (
                <Badge variant={STATUS_VARIANT[order.status]}>{text.status[order.status]}</Badge>
              )}
            </CardTitle>
            <CardDescription className="truncate">
              {order ? order.customer : text.loading}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label={text.refresh}
          >
            <RefreshCw aria-hidden="true" className={loading ? "motion-safe:animate-spin" : ""} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error ? (
          // What happened and what to do; the raw reason stays under Details.
          <ErrorState
            variant="inline"
            title={text.loadFailed}
            description={text.loadFailedHint}
            details={error}
            onRetry={() => void load()}
          />
        ) : loading && !order ? (
          <div className="grid grid-cols-3 gap-3" role="status" aria-label={text.loading}>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : order ? (
          <>
            {/* The total is the card's headline figure, on its own line: a
                five-figure amount does not fit a third of a phone-width card. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-muted-foreground text-sm font-medium">{text.total}</span>
              <span className="text-foreground text-2xl font-bold tracking-tight tabular-nums">
                {formatMoney(order.total, order.currency, locale)}
              </span>
            </div>
            <KpiGrid
              cells={[
                { label: text.items, value: formatCount(order.items, locale) },
                { label: text.delivery, value: formatDay(order.eta, locale) },
              ]}
            />

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="default" onClick={openTracking}>
                <ExternalLink aria-hidden="true" />
                {text.track}
              </Button>
              <Button size="sm" variant="outline" onClick={askAboutDelay}>
                <MessageSquare aria-hidden="true" />
                {text.ask}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
