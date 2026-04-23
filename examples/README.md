# Toolkit examples

Standalone playground for the MCP toolkit. Exercises `createFrameworkApp`,
`UpstreamProxyPlugin`, the UI-only module pattern, and the codegen CLI —
without pulling in a consumer project.

Not published. Private workspace package; dependencies resolve via
`workspace:*`.

## Layout

```
examples/
├── upstream-mock/    fake external MCP — 3 tools (echo, list-items, get-item)
├── host/             createFrameworkApp wiring, proxies upstream-mock as "items"
├── modules/
│   ├── hello-full/   full module (registerTools + steps + widgets)
│   └── items-ui/     UI-only module (proxyBinding: "items", generated hooks)
└── layouts/          YAML inputs for render-view smoke tests
```

## Scripts

Run from the toolkit root (`vendor/mcp-toolkit/`) or this directory:

```sh
pnpm -w install

# terminal 1: the "external" MCP the host proxies to
pnpm --filter @miragon/mcp-toolkit-examples dev:upstream

# terminal 2: the host MCP server (createFrameworkApp)
pnpm --filter @miragon/mcp-toolkit-examples dev:host

# regenerate items-ui/generated/ from the running upstream-mock
pnpm --filter @miragon/mcp-toolkit-examples generate

# CI drift check — fails if committed generated/ is stale
pnpm --filter @miragon/mcp-toolkit-examples generate:check
```

Defaults: upstream-mock on `:4000`, host on `:3010`. Override via `.env`
(see `env.example`).

## What the example proves

- `createFrameworkApp` boots a working MCP server with ~15 lines of consumer
  code (see `host/index.ts`).
- `UpstreamProxyPlugin` federates `items_*` tools from upstream-mock into
  the host's `tools/list`. The LLM sees them directly.
- UI-only `items-ui` plugin has no `registerTools`. Its `proxyBinding: "items"`
  triggers `buildProxyAppConfigs` to inject a typed `callTool` closure into
  `appConfig` — Steps use it without touching HTTP or the MCP SDK.
- `render-view` runs the pipeline, resolves widget requirements, returns
  `structuredContent` with per-widget data ready for an iframe bundle.

## Smoke test (no browser needed)

With both servers running:

```sh
# tools/list includes framework tools + federated items_* proxy tools
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# render-view with the hello layout
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d @- <<'JSON' | jq
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": {
    "name": "render-view",
    "arguments": {
      "keys": { "hello:name": "Ada" },
      "layout": { "rows": [{ "row": [{ "widget": "hello:greeting-card", "span": 6 }] }] }
    }
  }
}
JSON
```

The equivalent with the items-ui layout exercises the proxy path end-to-end:
pipeline → typed `callTool` → `UpstreamProxyPlugin.callUpstream` →
upstream-mock's `get-item` → structuredContent back.
