import path from "node:path"
import { fileURLToPath } from "node:url"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { createPlugin as createTasksPlugin } from "./modules/tasks/plugin.js"

const here = path.dirname(fileURLToPath(import.meta.url))

const app = await createFrameworkApp({
  name: "my-mcp-server",
  version: "0.1.0",
  baseUrl: process.env.MCP_URL,
  plugins: [createTasksPlugin()],
  app: {
    resourceUri: "ui://my-mcp-server/mcp-app.html",
    // The single-file widget bundle. Build it first: `pnpm build:bundle`.
    htmlPath: path.join(here, "..", "app-bundle", "dist", "index.html"),
  },
})

const port = Number(process.env.PORT ?? 3010)
await app.listen(port)
process.stdout.write(`[host] listening on http://localhost:${port}/mcp\n`)
