import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"
import { createPlugin as createOrdersPlugin } from "../modules/orders/plugin.js"

/**
 * The public playground host — the deployable subset of `host/index.ts`.
 * Serves the two store-backed modules as a single process (locally and on
 * Fly.io, see `deploy/playground/`):
 *   - tasks   own tools + a single-widget view (`buildSingleWidgetView`)
 *   - orders  BOTH composition paths — the eager multi-widget dashboard
 *             (`buildComposedView`) and the two-step `render-view` pipeline
 *
 * `builder: true` adds the visual builder + dashboard CRUD on top. Dashboards
 * use the default in-memory store on purpose: the playground is a shared,
 * ephemeral surface — every restart resets what visitors saved.
 *
 * The guided tour through this server lives in `docs/playground.md`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const app = await createFrameworkApp({
  name: "mcp-toolkit-playground",
  description:
    "Live playground for @miragon/mcp-toolkit: call a tool, get a rendered widget, " +
    "compose a multi-widget dashboard, chain a render-view pipeline, and save a " +
    "dashboard with the builder. Demo data resets on restart.",
  // The serving origin is request-resolved by mcp-use (or the MCP_URL env
  // var) — no baseUrl option since the native-views move.
  plugins: [createTasksPlugin(), createOrdersPlugin()],
  // Note: `dev:playground` deliberately does NOT load examples/.env (unlike
  // `dev:host`) — the full host's .env sets PORT 3010, which would collide
  // with a locally running dev:host.
  app: {
    bundle: {
      jsPath: path.join(here, "..", "app-bundle", "dist", "mcp-app.js"),
      cssPath: path.join(here, "..", "app-bundle", "dist", "mcp-app.css"),
    },
    builder: true,
  },
})

// 3020 by default so a local playground never collides with dev:host (3010).
const port = Number(process.env.PORT ?? 3020)
await app.listen(port)
process.stdout.write(`[playground] listening on http://localhost:${port}/mcp\n`)
