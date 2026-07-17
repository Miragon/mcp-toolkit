# Testing with the `examples/` playground

The toolkit ships a self-contained demo under
[`examples/`](../../examples/) — one host using `createFrameworkApp`,
three self-owned modules, a widget bundle built by Vite, and YAML
layouts. Use it to exercise new toolkit features before integrating into
a consumer.

## Structure

```
examples/
├── host/index.ts                   createFrameworkApp wiring for all three modules
├── modules/
│   ├── articles/                   tool-codegen example: own tools + generated typed client
│   │                                 + codegen-source.ts (build-time snapshot endpoint)
│   ├── tasks/                      own tools + widget via createToolRegistrar
│   └── orders/                     eager dashboard + a two-step pipeline
├── app-bundle/                     host's widget-bundle Vite project (McpToolkitApp)
└── layouts/                        YAML inputs for render-view smoke tests
```

The three modules cover the common shapes:

1. **`articles`** — the tool-codegen worked example: registers its own
   `articles_list-articles` / `articles_get-article` tools, injects a typed
   in-process `callTool` (from the committed `generated/` client) into its
   `appConfig` for the `articles:resolve-article` step, and the
   `ArticleCard` widget self-fetches via the generated hook.
2. **`tasks`** — a module with its own tools + a self-fetching widget
   (`show_tasks_board`, app-only `tasks_board_data` feed).
3. **`orders`** — both composition paths against one domain: an eager
   multi-widget dashboard (`buildComposedView`) and a real two-step
   pipeline (`render-view`).

## Running

```sh
# from the repository root
pnpm -w install
cp examples/env.example examples/.env   # first time only

pnpm --filter @miragon/mcp-toolkit-examples build:bundle
pnpm --filter @miragon/mcp-toolkit-examples dev:host
# [host] listening on http://localhost:3010/mcp
```

(Or the one-shot `start`, which chains both.) All modules are local
plugins compiled into the host — no other server and no extra env
needed. See [`examples/env.example`](../../examples/env.example).

## Checking the wiring

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

You should see:

- Framework tools — `get-framework-manifest`, `render-view` (plus the
  builder/dashboard tools, since the example host opts into `builder`).
- Articles — `articles_list-articles`, `articles_get-article`.
- Tasks — `show_tasks_board`, `list_tasks`, `create_task`, `complete_task`.
- Orders — `show_orders_dashboard`, `list_customers`.

## Exercising articles end-to-end

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{
    "name":"render-view",
    "arguments":{
      "keys":{"articles:articleId":"1"},
      "steps":[{"id":"article","step":"articles:resolve-article"}],
      "layout":{"rows":[{"row":[{"widget":"articles:article-card","span":6}]}]}
    }
  }
}
JSON
```

Path exercised: tool call → framework `render-view` handler → pipeline
executor → the step's injected typed `callTool` (the articles module's
in-process implementation) → `structuredContent` with article data back.

## Regenerating the articles types

The typed client is a build-time snapshot of the standalone
`codegen-source.ts` endpoint (port 4000; started automatically):

```sh
pnpm --filter @miragon/mcp-toolkit-examples generate
# or
pnpm --filter @miragon/mcp-toolkit-examples generate:check   # CI drift
```

Writes into `examples/modules/articles/generated/` — the
`ArticlesCallTool` map + `useArticlesGetArticle` React Query hook.

## Typecheck everything

```sh
pnpm -r typecheck
```

Runs `tsc --noEmit` across all toolkit packages + `examples/`. `examples/`
uses `workspace:*` to pull the packages' sources (via TS path aliases in
`examples/tsconfig.json`), so any breakage in the packages surfaces here
first.

## Why this is useful

- Dev your change in isolation — no consumer project bootstrap.
- The `examples/` workspace is a smoke test too: if it typechecks + boots
  - returns the expected `structuredContent`, the major integration paths
    work.
- Onboarding: the examples are the shortest path from "I cloned the repo"
  to "I see end-to-end behaviour" for the tool, widget, and pipeline
  patterns.

## See also

- [Getting started](../getting-started.md) — minimal host snippet.
- [Layout and rendering](layout-and-rendering.md) — what `render-view` accepts.
- [`examples/README.md`](../../examples/README.md) — command reference.
