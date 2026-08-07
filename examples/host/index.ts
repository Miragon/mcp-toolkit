import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp, createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { createPlugin as createArticlesPlugin } from "../modules/articles/plugin.js"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"
import { createPlugin as createOrdersPlugin } from "../modules/orders/plugin.js"

/**
 * Boots a self-contained host MCP server using the toolkit's
 * `createFrameworkApp`. Serves three self-owned modules at once:
 *   - articles   the tool-codegen example: its own tools plus a *generated*
 *                typed client (`generated/`) used by the resolve-article step
 *                and the ArticleCard widget. See `modules/articles/`.
 *   - tasks      the module registers its own tools + widget via
 *                `createToolRegistrar` (no pipeline). See `modules/tasks/`.
 *   - orders     shows BOTH composition paths against one domain — an eager
 *                multi-widget dashboard (`buildComposedView`, the default)
 *                and a real two-step pipeline (`render-view`). See `modules/orders/`.
 *
 * Aggregating several MCP servers into one surface is an external gateway's
 * job (e.g. agentgateway) — each toolkit server stays self-contained.
 *
 * Saved dashboards (created via the builder's Save button) land in
 * `${here}/.dashboards/<id>.json`. Delete the directory to reset.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const app = await createFrameworkApp({
  name: "toolkit-example-host",
  version: "0.0.1",
  // The serving origin is request-resolved by mcp-use (or the MCP_URL env
  // var) — no baseUrl option since the native-views move.
  plugins: [createArticlesPlugin(), createTasksPlugin(), createOrdersPlugin()],
  app: {
    bundle: {
      jsPath: path.join(here, "..", "app-bundle", "dist", "mcp-app.js"),
      cssPath: path.join(here, "..", "app-bundle", "dist", "mcp-app.css"),
    },
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
