# Layered adoption

The toolkit is not all-or-nothing. The UI primitives, the host bridge, the
data-widget adapter, and the full framework runtime are separable layers — use
the parts you need and ignore the rest. Three common entry points, in order of
how much of the toolkit they pull in:

| Layer                                              | You bring                         | You skip                                       |
| -------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| **(a)** Primitives + hand-built UI, standalone     | an existing MCP server + a widget | `createFrameworkApp`, plugins, the host bundle |
| **(b)** Data-widgets + `adaptDataWidget` in a host | a host bundle + widget components | pipelines beyond one step                      |
| **(c)** Full pipelines and dashboards              | plugins + steps + layouts         | nothing — the whole runtime                    |

You can start at (a) and grow into (c) without rewriting widgets: a widget
written against `useHostBridge()` and the primitives renders unchanged whether
it is mounted standalone or in a host.

## (a) Primitives + a hand-built UI against an existing server

The lightest layer. You have an MCP server already — you only want a polished UI
over it. Pull in `@miragon/mcp-toolkit-ui` for the [primitives](./widgets.md)
(`Table`, `Card`, `Badge`) and composed blocks (`KpiGrid`, `FilterBar`, …) and
`@miragon/mcp-toolkit-ui/app` for `createStandaloneHostBridge`. Inject a
`callTool` over a `@modelcontextprotocol/client` client and provide the bridge once
at the app root:

```tsx
import { Client } from "@modelcontextprotocol/client"
import { HostBridgeProvider, createStandaloneHostBridge } from "@miragon/mcp-toolkit-ui/app"

const client = new Client(/* … */)
const bridge = createStandaloneHostBridge({
  callTool: (name, args) => client.callTool({ name, arguments: args }),
})

function App() {
  return (
    <HostBridgeProvider bridge={bridge}>
      <OrderStatusCard /> {/* hand-built with the primitives + useHostBridge() */}
    </HostBridgeProvider>
  )
}
```

No `createFrameworkApp`, no plugins, no host bundle, no pipeline. The widgets are
hand-built with the primitives and talk to the server through the bridge. See
[`examples/host-portability/`](../../examples/host-portability/) (the standalone
tab) and the [Host portability](./host-portability.md) concept.

White-labeling lives in this layer too: the primitives read CSS-variable design
tokens, so a single `createTheme(...)` + `<ThemeProvider>` re-skins a client UI at
any adoption level — see the [white-labeling guide](../guides/white-labeling.md).

## (b) Data-widgets + `adaptDataWidget` in a host

You run a toolkit host (`createFrameworkApp`) and bundle hand-built widgets, but
keep each widget a pure function of its data. Write a single-data component that
takes the record it renders, then wrap it with `adaptDataWidget` so the host
feeds it the right `stepData` and surfaces a model-readable description:

```tsx
import { adaptDataWidget } from "@miragon/mcp-toolkit-ui/app"

function OrderCard({ data }: { data: Order }) {
  /* hand-built with Card / Badge / … */
}

export const OrderCardWidget = adaptDataWidget(
  OrderCard,
  "orders:order",
  (order) => `Order ${order.id} — ${order.status}`,
)
```

The widget stays testable in isolation (it is just `({ data }) => …`) and the
[widget playground](../guides/developing-widgets-in-isolation.md) renders it from
fixtures with no host. See
[`examples/modules/articles/widgets/ArticleCard.tsx`](../../examples/modules/articles/widgets/ArticleCard.tsx)
and [`examples/widget-playground/CustomerCard.tsx`](../../examples/widget-playground/CustomerCard.tsx).

## (c) Full pipelines and dashboards

The complete runtime: resolve
data through declarative [pipeline steps](./pipelines-and-steps.md), render
multi-widget [layouts](../guides/layout-and-rendering.md), and let users persist
[dashboards](../guides/building-dashboards.md). This is the
[architecture](./architecture.md) the framework tools assume, exercised
end-to-end by [`examples/host/`](../../examples/host/).

```ts
const app = await createFrameworkApp({
  name: "my-mcp",
  plugins: [createArticlesPlugin()],
  // `builder: true` opts into the visual in-iframe builder + dashboard
  // persistence; it is off by default (lean). Widget rendering works either
  // way. See the [view builder](./view-builder.md) concept.
  app: { bundle: { jsPath, cssPath }, builder: true /* … */ },
})
```

Prefer owning the server yourself? `installToolkit(server, { modules })` adds
the same surface to a plain mcp-use project (CLI `views/` convention) — see
[getting-started](../getting-started.md).

## Use the parts you need

The layers compose downward, never lock upward: a host (layer c) still renders
data-widgets (layer b) built from primitives (layer a), and the _same_
hand-built widget runs in all three because it only depends on the primitives
and `useHostBridge()`. Adopt the smallest layer that solves your problem and
reach for the next one only when you actually need pipelines or
dashboards.

## See also

- [Host portability](./host-portability.md) — the bridge that makes (a) and the
  standalone path work.
- [Developing widgets in isolation](../guides/developing-widgets-in-isolation.md)
  — build hand-made widgets fast with fixtures.
- [Widgets](./widgets.md) and [Architecture](./architecture.md) — the (b) and (c)
  building blocks.
