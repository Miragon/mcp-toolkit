# Architecture

A Miranum-style MCP server is an mcp-use `MCPServer` with two layers:

1. **App plugins** — register domain tools, widget tools, pipeline steps, widgets.
2. **Framework tools** — always-on: LLM-facing `get-framework-manifest`
   and `render-view`; app-only (iframe internal, never in LLM
   `tools/list`) `refresh-view`. Plus one natively registered
   `ui://views/<tool>.html` resource per view-bound tool, all embedding
   the shared widget bundle. **Opt-in** (only when `app.builder === true`,
   default off): the `save-/list-/load-/delete-dashboard` CRUD quartet
   backed by a pluggable `DashboardStore`, plus the app-only
   `get-builder-catalogue` that powers the in-iframe builder. Lean
   servers leave the builder off so `render-view` + the widget core stay
   the entire framework surface.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          MCP client (LLM)                            │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ tools/list · tools/call
┌──────────────────────────▼───────────────────────────────────────────┐
│ MCPServer (mcp-use)                                                  │
│  ┌──────────────┐  ┌──────────────────────────────────────────────┐  │
│  │ middleware   │  │ tools                                        │  │
│  │  org-gate    │  │  get-framework-manifest · render-view        │  │
│  │  role-filter │  │  <plugin>_*                                  │  │
│  └──────────────┘  │  (app-only) refresh-view                     │  │
│                    │  (opt-in, app.builder) save-/list-/load-/    │  │
│                    │  delete-dashboard · (app-only) get-builder-  │  │
│                    │  catalogue                                   │  │
│                    └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ resources: ui://views/<tool>.html (shared widget bundle)     │    │
│  └──────────────────────────────────────────────────────────────┘    │
└────┬─────────────────────────────────────────────────────────────────┘
     │ pipeline: step.execute(ctx, appConfig)
     │  with the plugin-injected typed callTool closure
┌────▼────────────────┐
│ StepRegistry        │
│ WidgetRegistry      │
└─────────────────────┘
```

## Federation is a gateway concern

Every toolkit server is **self-contained**: its own tools, its own steps,
its own widgets, its own UI bundle. Aggregating several MCP servers into
one client-facing surface is the job of an external MCP gateway in front
of them (e.g. [agentgateway](https://agentgateway.dev) — federation /
multiplexing of multiple MCP servers, virtual servers). The client host
renders the UI of whichever server's tool was called. The toolkit
deliberately ships no upstream-proxy or module-discovery machinery of its
own.

## Request flow — `render-view`

1. Client calls `render-view` with `{ keys, steps, layout, title }`.
2. Framework-tool handler extracts `userId` from `ctx.auth.user.userId`.
3. `executePipeline` runs each step:
   - Looks up definition by `ref.step` in `StepRegistry`.
   - Checks all `requires` keys exist in the running context.
   - Builds the step's `appConfig` via `bindAppConfig`: if the config has a
     `callTool` closure (injected by the plugin via `AppPlugin.appConfig`),
     wraps it so the 3rd `ctx` arg gets pre-bound with `userId`, leaving
     steps with a 2-arg signature.
   - Calls `step.execute(context, appConfig)`.
   - Merges the returned `keys` into the running context.
4. The view payload returned to the client has `structuredContent` with
   `{ layout, context: { keys, stepIds, stepData, errors }, _refreshParams }`.
5. The widget bundle (`mcp-app.js`) renders each widget in the layout by
   reading its `WidgetDefinition.requires` against `context.keys`.

## Request flow — server-internal tool call from a step

1. Step calls its injected `callTool("articles_get-article", { id })`.
2. The executor's `bindAppConfig` has pre-bound the per-request `userId`
   onto the closure.
3. The closure resolves the call however the plugin implemented it — an
   in-process store lookup (the examples' articles module), a REST call,
   or an MCP client session.

**Caveat**: `role-filter` middleware only runs on the public RPC surface.
Step-internal dispatches bypass it. For defence-in-depth on step paths,
add an explicit check in the step.

## Where the parts live

| Concern              | File                                                              |
| -------------------- | ----------------------------------------------------------------- |
| Server boot + wiring | `packages/core/src/tools/create-framework-app.ts`                 |
| Framework tools      | `packages/core/src/tools/register-framework-tools.ts`             |
| Builder catalogue    | `packages/core/src/tools/register-catalogue-tool.ts` (app-only)   |
| Catalogue helper     | `packages/core/src/framework/catalogue.ts`                        |
| Dashboard CRUD tools | `packages/core/src/tools/register-dashboard-tools.ts`             |
| Dashboard store      | `packages/core/src/framework/dashboard-store.ts`                  |
| Pipeline executor    | `packages/core/src/engine/pipeline-executor.ts`                   |
| View rendering       | `packages/core/src/framework/render-view.ts`                      |
| Manifest             | `packages/core/src/framework/manifest.ts`                         |
| REST helper          | `packages/core/src/rest/` (`createRestClient` + `createRestTool`) |
