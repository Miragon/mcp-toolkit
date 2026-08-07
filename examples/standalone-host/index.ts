import { MCPServer } from "mcp-use"
import { z } from "zod"
import { installToolkit } from "@miragon/mcp-toolkit-core/tools"
import { createPlugin as createTasksPlugin } from "../modules/tasks/plugin.js"

/**
 * The STANDARD path since the native-views move: a plain mcp-use project that
 * installs the toolkit on top.
 *
 * You own the server — construct it, register your own tools, run it through
 * the mcp-use CLI (`pnpm run dev:standalone` / `build:standalone` /
 * `start:standalone`). `installToolkit` adds the composition features:
 * `render-view` + the pipeline, the tasks module's widget tools, and (if you
 * opt in) the builder platform. The views live under `views/` by CLI
 * convention — one directory per view-bound tool, each rendering the shared
 * widget map through `McpToolkitApp` (see `views/render-view/view.tsx`).
 *
 * Compare with `host/index.ts`, which uses `createFrameworkApp` — the
 * batteries-included Node adapter for running in your own process with a
 * self-built inline bundle (no CLI involved).
 */
// Explicit annotation: the inferred type would reference hono's `Env` and
// trip TS2883 ("not portable") under the workspace's declaration settings.
const server: MCPServer = new MCPServer({
  name: "toolkit-standalone-host",
  version: "0.0.1",
  description:
    "Plain mcp-use server with @miragon/mcp-toolkit installed on top: " +
    "own tools + render-view composition + the tasks module.",
})

// A plain mcp-use tool — no toolkit involved.
server.tool(
  {
    name: "echo",
    description: "Echoes the input back — a plain mcp-use tool next to the toolkit surface.",
    inputSchema: z.object({ message: z.string().describe("Text to echo back.") }),
    annotations: { readOnlyHint: true },
  },
  ({ message }) => Promise.resolve({ content: [{ type: "text" as const, text: message }] }),
)

// The toolkit ON TOP: render-view + pipeline features + the tasks module
// (its own tools, the show_tasks_board widget tool, the app-only data feed).
installToolkit(server, {
  modules: [createTasksPlugin()],
})

export default server
