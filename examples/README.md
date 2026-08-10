# Toolkit examples

Standalone playground for the MCP toolkit. Exercises `createFrameworkApp`,
self-owned modules, the codegen CLI, and both view-composition paths —
without pulling in a consumer project.

Not published. Private workspace package; dependencies resolve via
`workspace:*`.

## Layout

```
examples/
├── standalone-host/            THE STANDARD PATH — plain mcp-use project + installToolkit,
│                                 run through the mcp-use CLI (dev:standalone, built-in inspector)
├── host/                       createFrameworkApp wiring (the Node-adapter path)
│   ├── index.ts                  full host — all three modules + builder
│   └── playground.ts             public playground — tasks + orders only
├── modules/
│   ├── articles/               tool-codegen example — own tools + generated typed client
│   │                             (+ codegen-source.ts, the build-time snapshot endpoint)
│   ├── tasks/                  self-owned module — its OWN tools + a widget
│   └── orders/                 self-owned — BOTH composition paths (eager + pipeline)
├── app-bundle/                 host's widget-bundle Vite project
├── widget-playground/          Storybook-style harness — develop widgets in isolation
├── host-portability/           one widget, three hosts (mcp-use / ChatGPT / standalone)
└── layouts/                    example render-view layouts in YAML (docs illustrations)
```

Every module is a local plugin compiled into the host — self-contained, no
other server at runtime. (Aggregating several MCP servers into one surface is
an external MCP gateway's job, e.g. [agentgateway](https://agentgateway.dev) —
see [docs/concepts/architecture.md](../docs/concepts/architecture.md).)

## Example flows

1. **Typed tool calls via codegen** (`articles`): the module registers its own
   `articles_list-articles` / `articles_get-article` tools (shared
   `tools.ts` + in-memory `store.ts`) and injects a typed in-process
   `callTool` — its signature generated from the committed `generated/`
   client — into its `appConfig` for the `articles:resolve-article` step. The
   `ArticleCard` widget self-fetches via the generated `useArticlesGetArticle`
   hook. `generated/` is snapshotted from the standalone build-time endpoint
   `codegen-source.ts`. See `modules/articles/`.

2. **Self-owned server with its own tools** (`tasks`): the module registers its
   **own** tools with `createToolRegistrar` (`list_tasks`, `create_task`,
   `complete_task`) backed by an in-memory store, plus a `show_tasks_board`
   widget tool and a hand-built `TasksBoard` widget. This
   is the common "build my own MCP server with tools + UI" case. See
   `modules/tasks/` (and its `README.md`).

3. **Two ways to compose a view** (`orders`): one self-owned module showing **both**
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

# one-shot: build the widget bundle, then boot the host
pnpm --filter @miragon/mcp-toolkit-examples start

# the public playground host (tasks + orders + builder) on :3020.
# This is what https://mcp-toolkit-playground.fly.dev serves — the guided tour
# is docs/playground/, the Fly deployment lives in deploy/playground/.
# Deliberately ignores examples/.env (the full host's env would set port 3010);
# exported env vars still apply.
pnpm --filter @miragon/mcp-toolkit-examples start:playground   # = build:bundle + dev:playground

# or run the steps individually — build the host's widget bundle once first
# (dev:host serves it from app-bundle/dist, which is not in git)
pnpm --filter @miragon/mcp-toolkit-examples build:bundle
pnpm --filter @miragon/mcp-toolkit-examples dev:host

# build every Vite bundle without starting a server (host app-bundle plus
# the widget-playground + host-portability demos)
pnpm --filter @miragon/mcp-toolkit-examples build:all

# the two standalone UI demos (Vite — no MCP server)
pnpm --filter @miragon/mcp-toolkit-examples dev:widget-playground
pnpm --filter @miragon/mcp-toolkit-examples dev:host-portability

# regenerate modules/articles/generated/ — start the build-time codegen
# source endpoint first (terminal 1), then generate (terminal 2)
pnpm --filter @miragon/mcp-toolkit-examples dev:codegen-source
pnpm --filter @miragon/mcp-toolkit-examples generate

# drift check — fails if committed generated/ is stale. Needs the running
# codegen source, so it is run by hand, not in CI.
pnpm --filter @miragon/mcp-toolkit-examples generate:check

# in-process smoke test (no servers, no browser) — runs in CI via `pnpm -r test`
pnpm --filter @miragon/mcp-toolkit-examples test

# typecheck the whole examples workspace (incl. widgets)
pnpm --filter @miragon/mcp-toolkit-examples typecheck
```

Defaults: host on `:3010`, playground on `:3020`, codegen source on `:4000`
(build-time only — never needed to run the host). Override via `.env` (see
`env.example`).

With the host up, the quickest look is the built-in mcp-use inspector at
<http://localhost:3010/inspector> — call `show_tasks_board` to watch a tool
render a widget.

## What the examples prove

- `createFrameworkApp` boots a working MCP server with ~15 lines of consumer
  code (see `host/index.ts`).
- A plugin injects a typed `callTool` closure into its own `appConfig`
  (`modules/articles/plugin.ts`) — steps use it without touching HTTP or
  the MCP SDK, and the generated types pin the tool names and shapes at
  compile time.
- Modules register their own tools via `createToolRegistrar`; the LLM sees
  `articles_*`, `tasks` and `orders` tools directly in `tools/list`.
- `render-view` runs the pipeline, resolves widget requirements, returns
  `structuredContent` with per-widget data ready for an iframe bundle.

## Automated smoke test

`test/smoke.test.ts` boots a host in-process via `createFrameworkApp`,
drives it with an MCP client, and asserts `tools/list`
exposes the framework tool trio and that a `render-view` call returns the
expected `structuredContent` envelope. It runs in CI through the root
`pnpm -r --if-present run test` (see `.github/workflows/ci.yml`):

```sh
pnpm --filter @miragon/mcp-toolkit-examples test
```

## Manual smoke test against the running host (no browser needed)

With the host running:

```sh
# tools/list includes the framework tools + every module's own tools
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# render-view with the articles layout — exercises the typed-callTool path:
# pipeline step -> injected typed callTool -> structuredContent
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": {
    "name": "render-view",
    "arguments": {
      "keys": { "articles:articleId": "1" },
      "steps": [{ "id": "article", "step": "articles:resolve-article" }],
      "layout": {
        "rows": [
          { "row": [{ "widget": "articles:article-card", "span": 6 }] }
        ]
      }
    }
  }
}
JSON
```

The `render-view` call exercises `articles` end-to-end (typed step →
in-process tool call → widget data in `structuredContent`); the eager path
shows up via `show_orders_dashboard`, and `show_tasks_board` renders the
tasks widget in the inspector.
