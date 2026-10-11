import fs from "node:fs"
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
 * The guided tour through this server lives in `docs/playground/tour.md`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

// The landing page prints the server version: report the toolkit release the
// playground runs, not createFrameworkApp's "0.1.0" default.
const corePackage = path.join(here, "..", "..", "packages", "core", "package.json")
const { version } = JSON.parse(fs.readFileSync(corePackage, "utf8")) as { version: string }

// The Komet on blue is the app icon of Miragon software (corporate design):
// the browser tab, the landing page and the MCP implementation metadata show
// it. The file is the brand asset, unchanged; a data URL needs no public dir.
const komet = fs.readFileSync(path.join(here, "assets", "miragon-komet-blau.svg"))
const kometUrl = `data:image/svg+xml;base64,${komet.toString("base64")}`

const app = await createFrameworkApp({
  // The protocol name stays the identifier clients key the server by; the
  // product name is the display title (the landing page and the hosts show it).
  name: "mcp-toolkit-playground",
  version,
  description:
    "Live playground for the Miragon MCP Toolkit: call a tool, get a rendered widget, " +
    "compose a multi-widget dashboard, chain a render-view pipeline, and save a " +
    "dashboard with the builder. Demo data resets on restart.",
  // The serving origin is request-resolved by mcp-use (or the MCP_URL env
  // var) — no baseUrl option since the native-views move.
  plugins: [createTasksPlugin(), createOrdersPlugin()],
  // CORS with mcp-use's defaults (reflect the request Origin, no credentials):
  // the landing page's "Open in Inspector" link points browsers at the hosted
  // inspector, whose cross-origin fetches need the preflight answered — 2.x
  // ships with CORS off unless opted in. A public demo surface accepts any
  // origin on purpose.
  serverOptions: {
    title: "Miragon MCP Toolkit playground",
    cors: {},
    favicon: kometUrl,
    icons: [{ src: kometUrl, mimeType: "image/svg+xml", sizes: ["any"] }],
    websiteUrl: "https://miragon.github.io/mcp-toolkit/",
  },
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
