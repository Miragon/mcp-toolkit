# Toolkit examples

Standalone playground for the MCP toolkit. Exercises `createFrameworkApp`,
`UpstreamProxyPlugin`, the UI-only module pattern, the codegen CLI, and the
upstream-hosted module path — without pulling in a consumer project.

Not published. Private workspace package; dependencies resolve via
`workspace:*`.

## Layout

```
examples/
├── articles-upstream/          external MCP for the articles example
│   └── server.ts                 list-articles, get-article
├── customers-upstream/         external MCP for the customers example
│   ├── server.ts                 get-customer + module manifest + widget resource
│   └── widget/                   CustomerCard.tsx (built by Vite, externalised React)
├── host/                       createFrameworkApp wiring
│   ├── index.ts                  full host — proxies both upstreams, all four modules
│   └── playground.ts             public playground — tasks + orders only, no upstreams
├── modules/
│   ├── articles/               host-bundled UI module (proxyBinding: "articles")
│   ├── tasks/                  self-owned module — its OWN tools + a widget
│   └── orders/                 self-owned — BOTH composition paths (eager + pipeline)
├── app-bundle/                 host's widget-bundle Vite project
├── widget-playground/         Storybook-style harness — develop widgets in isolation
├── host-portability/          one widget, three hosts (mcp-use / ChatGPT / standalone)
└── layouts/                    YAML inputs for render-view smoke tests
```

## Example flows

1. **Host-bundled UI + codegen** (`articles`): upstream exposes `get-article`,
   host ships the `ArticleCard` widget code and calls the tool through
   generated `useToolQuery` hooks. See `modules/articles/`.

2. **Fully upstream-hosted module** (`customers`): upstream ships _both_ the
   declarative step and the widget bundle. Host discovers the module via
   `get-module-manifest`, compiles the declarative step, and fetches the
   widget bundle at render time through `read-widget-bundle`. See
   `customers-upstream/`.

3. **Self-owned server with its own tools** (`tasks`): the module registers its
   **own** tools with `createToolRegistrar` (`list_tasks`, `create_task`,
   `complete_task`) backed by an in-memory store, plus a `show_tasks_board`
   widget tool and a hand-built `TasksBoard` widget — no upstream, no proxy. This
   is the common "build my own MCP server with tools + UI" case. See
   `modules/tasks/` (and its `README.md`).

4. **Two ways to compose a view** (`orders`): one self-owned module showing **both**
   composition paths against one in-memory domain — an **eager multi-widget
   dashboard** (`show_orders_dashboard` composes a KPI strip + an orders table with
   `buildComposedView`, the recommended default) **and** a real **two-step pipeline**
   (`resolve-customer` → `list-customer-orders`, where step B consumes step A's
   output key) driven by `render-view` + `layouts/orders-dashboard.yaml`. See
   `modules/orders/` (and its `README.md`) and the
   [`compose-a-view` skill](../.claude/skills/compose-a-view/SKILL.md).

## Two UI-building examples (no host needed)

Standalone Vite apps for building hand-made widgets fast — neither boots an MCP
server.

1. **Widget playground** (`widget-playground/`): a "Storybook for MCP widgets".
   Renders a widget through `WidgetFixtureHost` with fixture data, a live JSON
   editor, the serialized model-context view, and a host-activity log — develop
   and polish a widget in isolation.

   ```sh
   pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
   ```

2. **Host portability** (`host-portability/`): the same `OrderStatusCard` widget
   rendered under all three `HostBridge` adapters (mcp-use host, ChatGPT Apps
   SDK, standalone against an existing server) with a shared bridge-activity log.

   ```sh
   pnpm --filter @miragon/mcp-toolkit-examples dev:host-portability
   ```

## Scripts

Run from the repository root or this directory:

```sh
pnpm -w install
cp examples/env.example examples/.env    # first time only

# one-shot: build the widget bundles and start all three servers
# (articles-upstream, customers-upstream, host) with colored,
# per-process log prefixes. The host is gated on both upstream
# ports via wait-on before it boots.
pnpm --filter @miragon/mcp-toolkit-examples start

# the public playground host (tasks + orders + builder, no upstreams) on :3020.
# This is what https://mcp-toolkit-playground.fly.dev serves — the guided tour
# is docs/playground.md, the Fly deployment lives in deploy/playground/.
# Deliberately ignores examples/.env (the full host's env would drag in the
# upstream proxies and port 3010); exported env vars still apply.
pnpm --filter @miragon/mcp-toolkit-examples start:playground

# or run each process in its own terminal — build the host's widget bundle
# once first (dev:host serves it from app-bundle/dist, which is not in git;
# the one-shot `start` above does this for you)
pnpm --filter @miragon/mcp-toolkit-examples build:bundle
pnpm --filter @miragon/mcp-toolkit-examples dev:articles-upstream
pnpm --filter @miragon/mcp-toolkit-examples dev:customers-upstream
pnpm --filter @miragon/mcp-toolkit-examples dev:host

# build every Vite bundle without starting a server (host app-bundle, the
# customers widget, and the widget-playground + host-portability demos)
pnpm --filter @miragon/mcp-toolkit-examples build:all

# the two standalone UI demos (Vite — no MCP server)
pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
pnpm --filter @miragon/mcp-toolkit-examples dev:host-portability

# regenerate articles/generated/ from the running articles-upstream
pnpm --filter @miragon/mcp-toolkit-examples generate

# drift check — fails if committed generated/ is stale. Needs a running
# articles-upstream, so it is run by hand, not in CI.
pnpm --filter @miragon/mcp-toolkit-examples generate:check

# in-process smoke test (no servers, no browser) — runs in CI via `pnpm -r test`
pnpm --filter @miragon/mcp-toolkit-examples test
```

Defaults: articles-upstream on `:4000`, customers-upstream on `:4001`, host on
`:3010`. Override via `.env` (see `env.example`).

With the host up, the quickest look is the built-in mcp-use inspector at
<http://localhost:3010/inspector> — call `show_tasks_board` to watch a tool
render a widget.

Booting `dev:host` without the two upstreams prints a warning that plugin
`articles` declares a `proxyBinding` with no matching proxy. That is harmless
unless you call the articles steps — `tasks` and `orders` are self-owned and
work regardless.

## What the examples prove

- `createFrameworkApp` boots a working MCP server with ~15 lines of consumer
  code (see `host/index.ts`).
- `UpstreamProxyPlugin` federates `articles_*` / `customers_*` tools from
  both upstreams into the host's `tools/list`. The LLM sees them directly.
- UI-only `articles` plugin has no `registerTools`. Its
  `proxyBinding: "articles"` triggers `buildProxyAppConfigs` to inject a typed
  `callTool` closure into `appConfig` — steps use it without touching HTTP or
  the MCP SDK.
- `customers-upstream` exposes `get-module-manifest`. The host discovers it
  at boot, synthesises an `AppPlugin` from the manifest, and compiles the
  declarative step into the step registry — no host-side code for that
  module. The widget bundle is fetched lazily at render time via
  `read-widget-bundle`, evaluated through a Blob URL in the browser, and
  mounts against the host's React instance via the app-bundle import map.
- `render-view` runs the pipeline, resolves widget requirements, returns
  `structuredContent` with per-widget data ready for an iframe bundle.

## Automated smoke test

`test/smoke.test.ts` boots a host in-process via `createFrameworkApp` (no
external upstreams), drives it with an MCP client, and asserts `tools/list`
exposes the framework tool trio and that a `render-view` call returns the
expected `structuredContent` envelope. It runs in CI through the root
`pnpm -r --if-present run test` (see `.github/workflows/ci.yml`):

```sh
pnpm --filter @miragon/mcp-toolkit-examples test
```

## Manual smoke test against the running playground (no browser needed)

With all three servers running:

```sh
# tools/list includes framework tools + federated proxy tools from both upstreams
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# render-view with the customers layout — exercises the full upstream-hosted
# module path: declarative step -> upstream tool call -> structuredContent
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": {
    "name": "render-view",
    "arguments": {
      "keys": { "customers:customerId": "c1" },
      "steps": [{ "id": "customer", "step": "customers:resolve-customer" }],
      "layout": {
        "rows": [
          { "row": [{ "widget": "customers:customer-card", "span": 6 }] }
        ]
      }
    }
  }
}
JSON

# read-widget-bundle pulls the upstream-hosted widget JS through the host
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read-widget-bundle","arguments":{"id":"customers:customer-card"}}}' \
  | jq '.result.structuredContent.source | length'
```

The `render-view` call exercises `customers` end-to-end (manifest discovery →
declarative step → remote widget bundle); the `read-widget-bundle` call proves
the host fetches the widget JS from the upstream at render time. The `articles`
flow (proxy + codegen hooks) shows up in `tools/list` as `articles_*` and is
exercised in the browser via `ArticleCard`.
