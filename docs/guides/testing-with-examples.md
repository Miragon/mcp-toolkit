# Testing with the `examples/` playground

The toolkit ships a self-contained demo under
[`examples/`](../../examples/) — two upstream MCPs, a host using
`createFrameworkApp`, one host-bundled UI module, the upstream-hosted
module path, a widget bundle built by Vite, and YAML layouts. Use it to
exercise new toolkit features before integrating into a consumer.

## Structure

```
examples/
├── articles-upstream/server.ts     external MCP: list-articles, get-article
├── customers-upstream/
│   ├── server.ts                   external MCP: get-customer + get-module-manifest
│   │                                 + ui://customers/customer-card.js resource
│   └── widget/                     CustomerCard.tsx (Vite-built, React externalised)
├── host/index.ts                   createFrameworkApp wiring, proxies both upstreams
├── modules/
│   └── articles/                   host-bundled UI module (proxyBinding: "articles")
├── app-bundle/                     host's widget-bundle Vite project (McpToolkitApp)
└── layouts/                        YAML inputs for render-view smoke tests
```

Two flows are demonstrated:

1. **Host-bundled UI + codegen** (`articles`) — upstream exposes a plain
   MCP tool, host ships `ArticleCard` in its bundle, `callTool` is typed
   via codegen.
2. **Fully upstream-hosted module** (`customers`) — upstream ships both
   the declarative step (via `get-module-manifest`) _and_ the widget
   bundle (via `read-widget-bundle`); host has no module code.

## Running

```sh
cd vendor/mcp-toolkit
pnpm -w install
cp examples/env.example examples/.env   # first time only

# terminal 1 — articles-upstream (plain external MCP)
pnpm --filter @miragon/mcp-toolkit-examples dev:articles-upstream
# [articles-upstream] listening on http://localhost:4000/mcp

# terminal 2 — customers-upstream (ships declarative step + remote widget)
pnpm --filter @miragon/mcp-toolkit-examples dev:customers-upstream
# [customers-upstream] listening on http://localhost:4001/mcp

# terminal 3 — the host
pnpm --filter @miragon/mcp-toolkit-examples dev:host
# [host] listening on http://localhost:3010/mcp
```

The default `MCP_PROXIES` wires both upstreams. `customers` is flagged
`upstreamModules: true` so the host calls `get-module-manifest` at boot
and compiles the declarative step into its registry. See
[`examples/env.example`](../../examples/env.example).

## Checking the wiring

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

You should see:

- Framework tools — `get-framework-manifest`, `render-view`,
  `refresh-view`, `read-widget-bundle`.
- Articles proxy — `articles_list-articles`, `articles_get-article`.
- Customers proxy — `customers_get-customer`,
  `customers_get-module-manifest`.

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
executor → step's injected `callTool` → `UpstreamProxyPlugin.callUpstream`
→ articles-upstream's `get-article` → `structuredContent` with article
data back.

## Exercising customers (upstream-hosted)

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{
    "name":"render-view",
    "arguments":{
      "keys":{"customers:customerId":"c1"},
      "steps":[{"id":"customer","step":"customers:resolve-customer"}],
      "layout":{"rows":[{"row":[{"widget":"customers:customer-card","span":6}]}]}
    }
  }
}
JSON

# And pull the upstream-hosted widget JS through the host:
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read-widget-bundle","arguments":{"id":"customers:customer-card"}}}' \
  | jq '.result.structuredContent.source | length'
```

The declarative step runs the compiled `customers:resolve-customer`
(built from the manifest at boot); `read-widget-bundle` proves the host
can stream the upstream's widget JS on demand. In a browser, the app
bundle's default widget loader calls the same tool automatically.

## Regenerating the articles types

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
  to "I see end-to-end behaviour" for both the host-bundled and
  upstream-hosted module patterns.

## See also

- [Getting started](../getting-started.md) — minimal host snippet.
- [Layout and rendering](layout-and-rendering.md) — what `render-view` accepts.
- [`examples/README.md`](../../examples/README.md) — command reference.
