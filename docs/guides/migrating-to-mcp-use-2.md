# Migrating to mcp-use 2.x

This release moves the toolkit from mcp-use **1.34** to the **2.x** line and onto
mcp-use's **native view system**: views are first-class (`ToolDefinition.view`
/ `.visibility`), mcp-use owns the `ui://views/<name>.html` resources and the
`_meta.ui` wire keys, and the mcp-use CLI (`mcp-use dev` / `build` / `start`)
becomes the standard way to develop and serve a toolkit server. The guide
below walks every breaking change with before/after snippets.

**Who this is for:** consumers of `@miragon/mcp-toolkit-core` /
`@miragon/mcp-toolkit-ui` 0.10.x (built against mcp-use 1.34). The mcp-use
2.x line first shipped as 0.11.0 and is promoted unchanged to **1.0.0** —
if you are already on 0.11.0, there is nothing further to migrate.

## 1. Bump the dependencies

| Package                     | Before   | After                      |
| --------------------------- | -------- | -------------------------- |
| `mcp-use`                   | `1.34.1` | `2.3.4`                    |
| `@modelcontextprotocol/sdk` | `1.29.0` | removed — no longer a peer |
| `zod`                       | `4.4.3`  | `4.4.3` (unchanged)        |
| Node.js                     | —        | `>=22.22.2` (engines)      |

Peer versions stay pinned exactly — install the versions above.

::: warning Pin `lucide-react` to one version everywhere
mcp-use 2.x's graph carries a `lucide-react@^0.562.0` peer (via the built-in
inspector). If your app resolves a _different_ `lucide-react` than
`@miragon/mcp-toolkit-ui` does, pnpm splits `mcp-use` into **two peer
instances** — and the bundled `mcp-use/react` view runtime exists twice. The
symptom is a widget that crashes at render time with
`mcp-use/react hooks require a browser view mounted by bootstrapView` even
though the view _is_ mounted (the 2.x runtime context is module-scoped; the
1.x `window.openai` global masked this failure mode). Pin
`lucide-react@0.562.0` in your app, and add
`resolve.dedupe: ["mcp-use", "react", "react-dom"]` to any Vite config that
bundles widgets as a second guard.
:::

## 2. Update the server import path

The server runtime moved from the `mcp-use/server` subpath to the root entry:

```ts
// before
import { MCPServer, text, object, error } from "mcp-use/server"
// after
import { MCPServer } from "mcp-use"
import { textResult, objectResult, errorResult } from "@miragon/mcp-toolkit-core/tools"
```

The v1 response helpers (`text` / `object` / `error`) are deprecated upstream;
the toolkit ships wire-identical replacements (`textResult` / `objectResult` /
`errorResult`) from `@miragon/mcp-toolkit-core/tools`.

## 3. Choose your serving path

2.x has two supported shapes. Pick one before touching the rest.

### 3a. The standard path — plain mcp-use project, toolkit on top (new)

You own a normal mcp-use project and the CLI owns view building and serving.
This is the recommended target for most servers:

```ts
// index.ts
import { MCPServer } from "mcp-use"
import { installToolkit } from "@miragon/mcp-toolkit-core/tools"
import { createTasksPlugin } from "./modules/tasks/plugin.js"

const server: MCPServer = new MCPServer({ name: "my-mcp", version: "1.0.0" })
server.tool({ name: "echo" /* … */ }, handler) // your plain tools

installToolkit(server, { modules: [createTasksPlugin()] })

export default server
```

- `package.json` needs `"main": "index.ts"` — the CLI reads `name` and `main`
  from the project directory.
- One `views/<name>/view.tsx` per view-bound tool (`views/render-view/` plus
  one per model-visible widget tool), each default-exporting
  `<McpToolkitApp widgets={widgets} />`. The CLI mounts the default export via
  `bootstrapView` — you do **not** call `mountMcpToolkitApp` here.
- Shared browser modules (the widget map, the Tailwind entry) must live
  **under `views/`** (e.g. `views/shared/widgets.tsx`): the CLI dev server
  routes only `views/*` through its Vite middleware, so a root-level shared
  module 404s in dev. Server-side files (`index.ts`, modules) are unaffected.
- Develop with `mcp-use dev` (HMR + built-in inspector at `…/mcp/inspector`),
  ship with `mcp-use build` / `mcp-use start`.

The runnable reference is
[`examples/standalone-host`](../../examples/standalone-host/README.md).

### 3b. The Node adapter — `createFrameworkApp` (changed)

Keep this when the server must run in your own process or ship its views
inline in the MCP resources (gateways that only forward the JSON-RPC
endpoint). The options changed:

```ts
// before
const app = await createFrameworkApp({
  name: "my-host",
  baseUrl: process.env.MCP_URL,
  plugins,
  app: {
    resourceUri: "ui://my-host/mcp-app.html",
    htmlPath: path.join(here, "dist", "index.html"),
  },
})

// after
const app = await createFrameworkApp({
  name: "my-host",
  // no baseUrl: mcp-use resolves the serving origin from the request (or MCP_URL)
  plugins,
  app: {
    bundle: {
      jsPath: path.join(here, "dist", "mcp-app.js"),
      cssPath: path.join(here, "dist", "mcp-app.css"),
    },
  },
})
```

- `app.htmlPath` / `app.resourceUri` / `baseUrl` are gone; `app.bundle` points
  at a compiled **ES module + stylesheet**.
- The return type is `MCPServer` (was `McpServerInstance<…>`).
- The bundle is read **once at boot** (1.x re-read the HTML per request):
  after rebuilding the bundle, restart the host.
- The widget-bundle Vite config changes from a single-file HTML to one JS +
  one CSS output — drop `vite-plugin-singlefile`, add:

```ts
// vite.config.ts of the widget bundle
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["mcp-use", "react", "react-dom"] },
  build: {
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(here, "main.tsx"),
      output: {
        entryFileNames: "mcp-app.js",
        assetFileNames: "mcp-app.[ext]",
        inlineDynamicImports: true,
      },
    },
  },
})
```

- The bundle entry point mounts via the view runtime now:

```tsx
// before (main.tsx)
createRoot(document.getElementById("root")!).render(<McpToolkitApp widgets={widgets} />)
// after
import { mountMcpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
mountMcpToolkitApp({ widgets })
```

## 4. Tool registration

### Input schemas

`schema:` → `inputSchema:` on every `server.tool` definition (mcp-use 2.x
field name).

### Widget-rendering tools (model-visible)

`uiMeta({ resourceUri })` is gone. Bind a native view (named after the tool)
and stamp only the Apps SDK half:

```ts
// before
server.tool(
  {
    name: "show_tasks_board",
    schema: z.object({}),
    _meta: uiMeta({ resourceUri }),
  },
  handler,
)

// after
import { appsSdkMeta, viewResourceUri } from "@miragon/mcp-toolkit-core"

server.tool(
  {
    name: "show_tasks_board",
    inputSchema: z.object({}),
    view: { name: "show_tasks_board" }, // mcp-use emits _meta.ui.* from this
    outputSchema: z.object({}).passthrough(), // a view binding requires one
    _meta: appsSdkMeta({
      // the openai/* half for Apps SDK hosts
      resourceUri: viewResourceUri("show_tasks_board"),
      title: "Task Board",
    }),
  },
  handler,
)
```

Never stamp `_meta.ui.*` by hand — mcp-use owns that namespace and overwrites
it on `tools/list`.

### App-only tools (`*_data` feeds, refresh hooks)

```ts
// before
server.tool({ name: "tasks_board_data", schema: z.object({}), _meta: APP_ONLY_META }, handler)
// after
server.tool({ name: "tasks_board_data", inputSchema: z.object({}), visibility: "app" }, handler)
```

### Registrar API changes

- `AppPlugin.registerWidgetTools(server, resourceUri, metaDefaults?)` →
  `registerWidgetTools(server, metaDefaults?)` — the resource URI parameter is
  gone (views are named after tools).
- `createWidgetToolRegistrar(server, client, resourceUri, metaDefaults?)` →
  `createWidgetToolRegistrar(server, client, metaDefaults?)`. Model-visible
  tools get the view binding + `openai/*` keys automatically; app-only tools
  get `visibility: "app"`.
- `WidgetToolVisibility` narrowed to `"app" | "model"` (the array form is
  gone).
- Removed exports: `uiMeta`, `APP_ONLY_META`, `buildAppResourceCsp`,
  `deriveAppResourceUri`, `installToolCallNameCapture` (plus its types).
  Replacements: `appsSdkMeta`, `viewResourceUri`, `VIEW_RESOURCE_URI_PREFIX`.

### CSP

`app.csp` still exists but only needs **third-party** origins (a CDN, an API
the widget fetches directly): mcp-use appends the request-resolved server
origin to the view-resource CSP itself. The `baseUrl`-origin injection
(`buildAppResourceCsp`) is gone with `baseUrl`.

## 5. UI package changes

### Host bridge

- `useHostBridge()` now **throws without a provider** (2.x has no
  provider-less fallback). Inside the toolkit shell nothing changes —
  `McpToolkitApp` installs the provider. Bare unit renders must wrap in
  `HostBridgeProvider` + `createStandaloneHostBridge`.
- `useMcpUseHostBridge` / `createMcpUseHostBridge` are removed. The mcp-use
  adapter is now `McpUseHostBridgeProvider` (a component, used by
  `McpToolkitApp`) over the pure mapping `toHostBridge(surface)`.

### Model context

Widgets must never import `ModelContext` from `mcp-use/react` — in 2.x it
throws in every mount that is not a `bootstrapView` view (the widget
playground, ChatGPT, standalone apps). Use the host-portable replacement:

```tsx
// before
import { ModelContext } from "mcp-use/react"
return <ModelContext content={describe(data)}>{body}</ModelContext>
// after
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
return <HostModelContext content={describe(data)}>{body}</HostModelContext>
```

Inside an mcp-use view it renders the native aggregating `ModelContext`;
everywhere else it reports through the `HostBridge`'s `setModelContext`.
(`adaptDataWidget`'s `describeForModel` already routes through it.)

### Fixture harness

`WidgetFixtureHost` no longer installs a `window.openai` shim — it simulates
the portable `HostBridge` surface only. A widget that calls `mcp-use/react`
hooks directly must be exercised against a real host (`mcp-use dev`) — or,
better, rewritten against `useHostBridge`.

## 6. Middleware and infrastructure

- **Role filter**: `resolveToolName` / `resolveToolNames` options are gone —
  2.x delivers the tool name on `ctx.params.name` and fires `mcp:tools/call`
  middleware once per call (batch entries are guarded individually).
  `failClosed` keeps its meaning.
- **Backend registry**: the per-session sticky selection is gone entirely —
  2.x serves HTTP statelessly (no session ids to key on), and in-memory
  selection state breaks behind more than one replica. `resolve(id?)` takes an
  explicit id or falls back to the single configured backend; a server that
  wants a sticky/default backend resolves that id from its own durable store
  (e.g. a per-user profile) and passes it in. Single-backend setups are
  unaffected.
- **Inspector**: the programmatic host no longer serves `/inspector`. The
  inspector ships with `mcp-use dev` (standard path), or use the hosted one —
  which needs CORS enabled on your server (`serverOptions: { cors: … }`).

## 7. Migration checklist

- [ ] Bump `mcp-use` to `2.3.4`, drop the `@modelcontextprotocol/sdk` peer; Node `>=22.22.2`.
- [ ] Pin `lucide-react@0.562.0` next to the toolkit (one version across the graph).
- [ ] `mcp-use/server` imports → `mcp-use`; `text`/`object`/`error` → `textResult`/`objectResult`/`errorResult`.
- [ ] Pick a path: `installToolkit` + `views/` + CLI (standard) or `createFrameworkApp` + `app.bundle` (adapter).
- [ ] `schema:` → `inputSchema:` everywhere.
- [ ] Widget tools: `view:` + `outputSchema` + `appsSdkMeta`/`viewResourceUri`; app-only tools: `visibility: "app"`.
- [ ] Drop the `resourceUri` parameter from `registerWidgetTools` / `createWidgetToolRegistrar`.
- [ ] Bundle entry → `mountMcpToolkitApp` (adapter path) / `McpToolkitApp` default export per view (CLI path).
- [ ] Replace direct `ModelContext` imports in widgets with `HostModelContext`.
- [ ] Wrap bare widget renders in a `HostBridgeProvider` (no provider-less fallback).
- [ ] Multi-backend servers: resolve the caller's default backend yourself (durable store) and pass the id to `resolve` — the registry keeps no session state.
- [ ] Adapter path: restart the host after every widget-bundle rebuild.
