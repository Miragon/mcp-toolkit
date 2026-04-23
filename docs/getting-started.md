# Getting started

Stand up a minimal Miranum-style MCP server.

## Install

```sh
pnpm add @miragon/mcp-toolkit-core @miragon/mcp-toolkit-proxy-contract
pnpm add @modelcontextprotocol/sdk mcp-use zod
```

## Minimal host

```ts
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"

const here = path.dirname(fileURLToPath(import.meta.url))

const app = await createFrameworkApp({
  name: "my-mcp",
  version: "0.1.0",
  baseUrl: process.env.MCP_URL,
  plugins: [], // plug AppPlugins in here
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
  app: {
    resourceUri: "ui://my-mcp/mcp-app.html",
    htmlPath: path.join(here, "mcp-app.html"),
  },
})

await app.listen(Number(process.env.PORT ?? 3010))
```

That's a booting MCP server with:

- The framework tool trio — `get-framework-manifest`, `render-view`, `refresh-view`.
- An `mcp-app-html` resource serving the widget bundle.
- Any upstream proxies declared in `MCP_PROXIES` (tools auto-federated).

Add a plugin via `plugins: [createMyPlugin()]` — see
[building-a-full-module](guides/building-a-full-module.md) for the full
module layout or [building-a-ui-only-module](guides/building-a-ui-only-module.md)
to wrap an existing upstream MCP.

## Proof it works

See [examples/](../examples/). `pnpm dev:upstream` + `pnpm dev:host` in two
terminals is a complete, running demo.

## Where to next

- Understand [what the server actually does on each request](concepts/architecture.md).
- Start [building a module](guides/building-a-ui-only-module.md).
- Check the [env var reference](reference/env-vars.md) for all config knobs.
