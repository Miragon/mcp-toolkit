import { useCallback, useState } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  Separator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@miragon/mcp-toolkit-ui"
import {
  BRIDGE_OPTIONS,
  BridgeStage,
  type BridgeCall,
  type BridgeId,
  type HostSettings,
} from "./bridges.js"
import { ORDER_IDS } from "./fake-server.js"

interface LogEntry {
  at: string
  bridge: BridgeId
  call: BridgeCall
}

function formatCall(call: BridgeCall): string {
  switch (call.kind) {
    case "callTool":
      return `callTool(${call.name}, ${JSON.stringify(call.args)})`
    case "sendFollowup":
      return `sendFollowup(${JSON.stringify(call.prompt)})`
    case "openExternal":
      return `openExternal(${call.url})`
    case "setModelContext":
      return `setModelContext(${JSON.stringify(call.text)})`
  }
}

/** The host languages the page can simulate (the host's locale, BCP 47). */
const HOST_LOCALES = [
  { id: "en-US", label: "English" },
  { id: "de-DE", label: "Deutsch" },
] as const

const CALL_VARIANT: Record<BridgeCall["kind"], "default" | "secondary" | "outline"> = {
  callTool: "default",
  sendFollowup: "secondary",
  openExternal: "outline",
  setModelContext: "outline",
}

export function App() {
  const [bridgeId, setBridgeId] = useState<BridgeId>("mcp-use")
  const [orderId, setOrderId] = useState(ORDER_IDS[0] ?? "ORD-4471")
  const [log, setLog] = useState<LogEntry[]>([])
  const [host, setHost] = useState<HostSettings>({ theme: "light", locale: "en-US" })

  // `log` is passed into the bridges; keep it stable so the bridges (and the
  // mcp-use shim effect) don't re-install on every render.
  const pushLog = useCallback(
    (call: BridgeCall) => {
      setLog((prev) =>
        [{ at: new Date().toLocaleTimeString(), bridge: bridgeId, call }, ...prev].slice(0, 60),
      )
    },
    [bridgeId],
  )

  return (
    <div className="bg-background text-foreground min-h-screen w-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Host portability</h1>
            <Badge variant="outline">HostBridge</Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            One hand-built widget, three hosts. The same <code>OrderStatusCard</code>, written only
            against <code>useHostBridge()</code>, renders unchanged under the mcp-use host, ChatGPT
            (OpenAI Apps SDK), and a standalone web app driven against an existing MCP server.
            Switch the host below and watch the activity log show the bridge calls; switch its
            language and colour scheme to see the card follow them under every bridge.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div role="group" aria-label="Order" className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium">Order</span>
            {ORDER_IDS.map((id) => (
              <Button
                key={id}
                size="sm"
                variant={id === orderId ? "default" : "outline"}
                aria-pressed={id === orderId}
                onClick={() => setOrderId(id)}
              >
                {id}
              </Button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Host language"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-muted-foreground text-sm font-medium">Host language</span>
            {HOST_LOCALES.map(({ id, label }) => (
              <Button
                key={id}
                size="sm"
                variant={id === host.locale ? "default" : "outline"}
                aria-pressed={id === host.locale}
                onClick={() => setHost((h) => ({ ...h, locale: id }))}
              >
                {label}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={host.theme === "dark"}
              onCheckedChange={(dark) => setHost((h) => ({ ...h, theme: dark ? "dark" : "light" }))}
            />
            <span className="text-muted-foreground font-medium">Dark host</span>
          </label>
        </div>

        <Tabs value={bridgeId} onValueChange={(v) => setBridgeId(v as BridgeId)}>
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {BRIDGE_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.id} value={opt.id}>
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {BRIDGE_OPTIONS.map((opt) => (
            <TabsContent key={opt.id} value={opt.id} className="mt-4">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                {/* The widget under the active bridge */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{opt.label}</CardTitle>
                    <CardDescription>{opt.blurb}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-hidden rounded-lg border border-dashed">
                      {/* key forces a clean remount per host + order so each bridge
                          starts from its own initial state. */}
                      <BridgeStage
                        key={`${opt.id}:${orderId}`}
                        bridgeId={opt.id}
                        orderId={orderId}
                        log={pushLog}
                        host={host}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Shared activity log */}
                <Card className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-base">Bridge activity</CardTitle>
                    <CardDescription>
                      Every <code>callTool</code> / <code>sendFollowup</code> /{" "}
                      <code>openExternal</code> the widget routed through the active bridge, newest
                      first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {log.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No bridge calls yet. Use the widget's buttons to make one.
                      </p>
                    ) : (
                      <ScrollArea className="h-[360px] pr-3">
                        <ul className="flex flex-col gap-2">
                          {log.map((entry, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Badge variant={CALL_VARIANT[entry.call.kind]}>
                                {entry.call.kind}
                              </Badge>
                              <code className="text-muted-foreground text-small min-w-0 flex-1 break-all">
                                {formatCall(entry.call)}
                              </code>
                              <span className="text-muted-foreground text-small shrink-0">
                                {entry.at}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <Separator />
        <p className="text-muted-foreground text-small">
          The widget never imports <code>mcp-use/react</code> or touches <code>window.openai</code>.
          It only calls <code>useHostBridge()</code>. See <code>OrderStatusCard.tsx</code> for the
          widget and <code>bridges.tsx</code> for the three adapters.
        </p>
      </div>
    </div>
  )
}
