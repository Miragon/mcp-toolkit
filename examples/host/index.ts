import path from "node:path"
import { fileURLToPath } from "node:url"
import { TOOLKIT_VERSION } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp, createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
import { createPlugin as createArticlesPlugin } from "../modules/articles/plugin.js"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"
import { createPlugin as createOrdersPlugin } from "../modules/orders/plugin.js"

/**
 * Boots a host MCP server using the toolkit's `createFrameworkApp`. Serves four
 * modules at once, covering every kind:
 *   - articles   UI-only, federates articles-upstream's tools (proxyBinding)
 *   - customers  fully upstream-hosted (step + widget discovered via manifest)
 *   - tasks      self-owned: the module registers its *own* tools + widget via
 *                `createToolRegistrar` (no upstream). See `modules/tasks/`.
 *   - orders     self-owned: shows BOTH composition paths against one domain — an
 *                eager multi-widget dashboard (`buildComposedView`, the default)
 *                and a real two-step pipeline (`render-view`). See `modules/orders/`.
 *
 * Saved dashboards (created via the builder's Save button) land in
 * `${here}/.dashboards/<id>.json`. Delete the directory to reset.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const app = await createFrameworkApp({
  name: "toolkit-example-host",
  version: "0.0.1",
  baseUrl: process.env.MCP_URL,
  plugins: [createArticlesPlugin(), createTasksPlugin(), createOrdersPlugin()],
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  callbackBaseUrl: process.env.MCP_URL,
  // Shared runtimes (beyond React) the app-bundle actually exposes to
  // upstream-hosted widget bundles — see `exposeSharedRuntime` in
  // `app-bundle/main.tsx` and the import-map plugin in
  // `app-bundle/vite.config.ts`. Discovery skips (fail-soft) any module whose
  // `runtime` requirements this set can't satisfy. Declare only what the
  // bundle truly exposes; the version literals track examples/package.json
  // (`mcp-use`, `@tanstack/react-query`).
  hostRuntime: {
    toolkitUi: TOOLKIT_VERSION,
    mcpUseReact: "1.34.3",
    reactQuery: "5.101.2",
  },
  app: {
    resourceUri: "ui://toolkit-example/mcp-app.html",
    htmlPath: path.join(here, "..", "app-bundle", "dist", "index.html"),
    // This example demonstrates the full visual builder, so opt into it.
    // `builder` is off by default (lean) — setting it true registers
    // `get-builder-catalogue` plus the save/list/load/delete-dashboard tools
    // and makes the `dashboardStore` below take effect.
    builder: true,
    dashboardStore: createFileSystemDashboardStore({
      dir: path.join(here, ".dashboards"),
    }),
  },
})

const port = Number(process.env.PORT ?? 3010)
await app.listen(port)
process.stdout.write(`[host] listening on http://localhost:${port}/mcp\n`)
