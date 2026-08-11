import { MCPServer } from "mcp-use"
import { installToolkit } from "@miragon/mcp-toolkit-core/tools"
import { createPlugin as createTasksPlugin } from "./modules/tasks/plugin.js"

/**
 * A plain mcp-use project with the toolkit installed on top — the standard
 * shape. You own the server; the mcp-use CLI owns view building and serving
 * (`pnpm dev` / `build` / `start`). `installToolkit` adds the composition
 * surface: `render-view`, the tasks module's tools, its `show_tasks_board`
 * widget tool, and the app-only `tasks_board_data` feed.
 *
 * The views live under `views/` by CLI convention — one directory per
 * view-bound tool, all rendering the shared widget map in `views/shared/`.
 */
// Explicit annotation: the inferred type would reference hono internals and
// trip TS2742 ("not portable") under strict declaration settings.
const server: MCPServer = new MCPServer({
  name: "my-mcp-server",
  version: "0.1.0",
  description: "Minimal MCP server built on @miragon/mcp-toolkit.",
})

installToolkit(server, {
  modules: [createTasksPlugin()],
})

export default server
