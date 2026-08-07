# standalone-host — a plain mcp-use project, toolkit on top

The **standard path** for new servers: you own a normal
[mcp-use](https://mcp-use.com) project — your `MCPServer`, your tools, the
`views/` convention, the `mcp-use` CLI for dev/build/serve — and
`installToolkit` adds the toolkit's composition features on top.

```
index.ts                      export default server; own tools + installToolkit(...)
widgets.tsx                   the shared widget map (one place for widget code)
styles.css                    Tailwind entry (globals + widget sources)
views/render-view/…           the composer view — CLI convention: dir name = view.name
views/show_tasks_board/…      the tasks module's widget tool view
```

What `installToolkit` contributes here: `get-framework-manifest`,
`render-view` (bound to its own view), the app-only `refresh-view`, plus the
tasks module (`list_tasks` / `create_task` / `complete_task`, the
`show_tasks_board` widget tool, the `tasks_board_data` feed). The plain
`echo` tool shows that ordinary mcp-use tools live right next to it.

## Run it

```sh
pnpm run dev:standalone     # mcp-use dev — Vite + HMR, Inspector at /mcp/inspector
pnpm run build:standalone   # mcp-use build → standalone-host/.mcp-use/build
pnpm run start:standalone   # build + serve the production build
```

The CLI discovers each `views/<name>/view.tsx` whose directory name matches a
tool's `view.name`, builds it, serves the assets over HTTP, and emits the
`_meta.ui` wire keys — no bundle wiring in this project at all.

## When to use the other path instead

[`host/index.ts`](../host/index.ts) runs the same modules through
`createFrameworkApp` — the batteries-included **Node adapter**: it constructs
the server, wires auth middleware, and primes the views from a self-built
inline bundle (`app-bundle/`). Use that when the server must be embedded in
your own process, or when views must ship inline in the MCP resources (e.g.
behind gateways that only forward the JSON-RPC endpoint).
