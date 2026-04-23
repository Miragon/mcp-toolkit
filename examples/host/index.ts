import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
import { createPlugin as createHelloPlugin } from "../modules/hello-full/plugin.js"
import { createPlugin as createItemsPlugin } from "../modules/items-ui/plugin.js"

/**
 * Boots a host MCP server using the toolkit's `createFrameworkApp`. Pairs
 * with `upstream-mock/server.ts` — the `items-ui` plugin needs that mock
 * running on `UPSTREAM_MOCK_URL` for its proxy tool calls to succeed.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const app = await createFrameworkApp({
  name: "toolkit-example-host",
  version: "0.0.1",
  baseUrl: process.env.MCP_URL,
  plugins: [createHelloPlugin(), createItemsPlugin()],
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
  app: {
    // The example host doesn't ship a widget bundle — this is a placeholder
    // resource URI. Widget rendering in a real consumer points at the Vite
    // build output.
    resourceUri: "ui://toolkit-example/mcp-app.html",
    htmlPath: path.join(here, "placeholder-mcp-app.html"),
  },
})

const port = Number(process.env.PORT ?? 3010)
await app.listen(port)
process.stdout.write(`[host] listening on http://localhost:${port}/mcp\n`)
