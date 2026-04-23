import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
import { createPlugin as createArticlesPlugin } from "../modules/articles/plugin.js"

/**
 * Boots a host MCP server using the toolkit's `createFrameworkApp`. Pairs with
 * two external upstreams:
 *   - articles-upstream   host ships the widget (articles plugin + codegen)
 *   - customers-upstream  upstream ships step *and* widget (fully remote module)
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const app = await createFrameworkApp({
  name: "toolkit-example-host",
  version: "0.0.1",
  baseUrl: process.env.MCP_URL,
  plugins: [createArticlesPlugin()],
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
  app: {
    resourceUri: "ui://toolkit-example/mcp-app.html",
    htmlPath: path.join(here, "..", "app-bundle", "dist", "index.html"),
  },
})

const port = Number(process.env.PORT ?? 3010)
await app.listen(port)
process.stdout.write(`[host] listening on http://localhost:${port}/mcp\n`)
