# Testing with the `examples/` playground

The toolkit ships a self-contained demo under
[`vendor/mcp-toolkit/examples/`](../../examples/) — an upstream mock, a
host using `createFrameworkApp`, one full module, one UI-only module, and
YAML layouts. Use it to exercise new toolkit features before integrating
into a consumer.

## Structure

```
examples/
├── upstream-mock/server.ts    ← fake external MCP (3 tools)
├── host/index.ts              ← createFrameworkApp wiring
├── modules/
│   ├── hello-full/            ← full module example
│   └── items-ui/              ← UI-only module example
└── layouts/*.yaml             ← render-view inputs
```

## Running

```sh
cd vendor/mcp-toolkit

# terminal 1
pnpm --filter @miragon/mcp-toolkit-examples dev:upstream
# [upstream-mock] listening on http://localhost:4000/mcp

# terminal 2
pnpm --filter @miragon/mcp-toolkit-examples dev:host
# [host] listening on http://localhost:3010/mcp
```

Defaults expect `MCP_PROXIES=[{"name":"items","upstreamUrl":"http://localhost:4000/mcp","auth":{"mode":"none"},...}]`.
See `examples/env.example`.

## Checking the wiring

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

You should see:

- Framework tools — `get-framework-manifest`, `render-view`, `refresh-view`.
- Full module — `hello_say-hi`.
- Federated upstream tools — `items_echo`, `items_list-items`, `items_get-item`.

## Exercising the UI-only flow end-to-end

```sh
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{
    "name":"render-view",
    "arguments":{
      "keys":{"items-ui:itemId":"1"},
      "steps":[{"id":"item","step":"items-ui:resolve-item"}],
      "layout":{"rows":[{"row":[{"widget":"items-ui:item-card","span":6}]}]}
    }
  }
}
JSON
```

Path exercised: tool call → role-filter (no-op, no rules) → framework
`render-view` handler → pipeline executor → step's injected `callTool` →
`UpstreamProxyPlugin.callUpstream` → upstream-mock's `get-item` →
`structuredContent` with item data back.

## Regenerating the items-ui types

```sh
pnpm --filter @miragon/mcp-toolkit-examples generate
# or
pnpm --filter @miragon/mcp-toolkit-examples generate:check   # CI drift
```

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
  - returns expected `structuredContent`, the major integration paths work.
- Onboarding: the examples are the shortest path from "I cloned the repo"
  to "I see end-to-end behavior."

## See also

- [Getting started](../getting-started.md) — minimal host snippet.
- [Layout and rendering](layout-and-rendering.md) — what `render-view` accepts.
