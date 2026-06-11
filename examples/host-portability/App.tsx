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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@miragon/mcp-toolkit-ui"
import { BRIDGE_OPTIONS, BridgeStage, type BridgeCall, type BridgeId } from "./bridges.js"
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
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold">
              HB
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Host portability</h1>
            <Badge variant="outline">HostBridge</Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            One hand-built widget, three hosts. The same <code>OrderStatusCard</code> — written only
            against <code>useHostBridge()</code> — renders unchanged under the mcp-use host, ChatGPT
            (OpenAI Apps SDK), and a standalone web app driven against an existing MCP server.
            Switch the host below and watch the activity log show the bridge calls.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">Order:</span>
          {ORDER_IDS.map((id) => (
            <Button
              key={id}
              size="sm"
              variant={id === orderId ? "default" : "outline"}
              onClick={() => setOrderId(id)}
            >
              {id}
            </Button>
          ))}
        </div>

        <Tabs value={bridgeId} onValueChange={(v) => setBridgeId(v as BridgeId)}>
          <TabsList>
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
                    <div className="bg-muted/30 flex justify-center rounded-lg border border-dashed p-5">
                      {/* key forces a clean remount per host + order so each bridge
                          starts from its own initial state. */}
                      <BridgeStage
                        key={`${opt.id}:${orderId}`}
                        bridgeId={opt.id}
                        orderId={orderId}
                        log={pushLog}
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
                        No bridge calls yet — interact with the widget.
                      </p>
                    ) : (
                      <ScrollArea className="h-[360px] pr-3">
                        <ul className="flex flex-col gap-2">
                          {log.map((entry, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Badge variant={CALL_VARIANT[entry.call.kind]}>
                                {entry.call.kind}
                              </Badge>
                              <code className="text-muted-foreground min-w-0 flex-1 text-xs break-all">
                                {formatCall(entry.call)}
                              </code>
                              <span className="text-muted-foreground/60 shrink-0 text-[10px]">
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
        <p className="text-muted-foreground text-xs">
          The widget never imports <code>mcp-use/react</code> or touches <code>window.openai</code>{" "}
          — only <code>useHostBridge()</code>. See <code>OrderStatusCard.tsx</code> for the widget
          and <code>bridges.tsx</code> for the three adapters.
        </p>
      </div>
    </div>
  )
}
