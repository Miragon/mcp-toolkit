# Architecture

A Miranum-style MCP server is an mcp-use `MCPServer` with three layers:

1. **Upstream proxies** — federate external MCPs under a `<proxy>_` prefix.
2. **App plugins** — register domain tools, widget tools, pipeline steps, widgets.
3. **Framework tools** — `get-framework-manifest`, `render-view`,
   `refresh-view`, `read-widget-bundle` (streams upstream-hosted widget
   JS to the browser), `open-view-builder` (interactive composer entry
   point), and the `save-/list-/load-/delete-dashboard` CRUD quartet
   backed by a pluggable `DashboardStore`, plus the `mcp-app-html`
   widget bundle resource.

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
│  │  role-filter │  │  refresh-view · open-view-builder            │  │
│  └──────────────┘  │  save-/list-/load-/delete-dashboard          │  │
│                    │  <plugin>_* · <proxy>_*                      │  │
│                    └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ resources: ui://<app>/mcp-app.html (widget bundle)           │    │
│  └──────────────────────────────────────────────────────────────┘    │
└────┬─────────────────────────────────────────┬───────────────────────┘
     │ pipeline: step.execute(ctx, appConfig)  │ forwardedTool.call
     │  with injected typed callTool closure   │
┌────▼────────────────┐                  ┌─────▼───────────────────────┐
│ StepRegistry        │                  │ Upstream MCP (external)     │
│ WidgetRegistry      │                  │ OAuth2 / bearer / header    │
└─────────────────────┘                  └─────────────────────────────┘
```

## Request flow — `render-view`

1. Client calls `render-view` with `{ keys, steps, layout, title }`.
2. Framework-tool handler extracts `userId` from `ctx.auth.user.userId`.
3. `executePipeline` runs each step:
   - Looks up definition by `ref.step` in `StepRegistry`.
   - Checks all `requires` keys exist in the running context.
   - Builds the step's `appConfig` via `bindAppConfig`: if the config has a
     `callTool` closure (from `buildProxyAppConfigs`), wraps it so the 3rd
     `ctx` arg gets pre-bound with `userId`, leaving steps with a 2-arg
     signature.
   - Calls `step.execute(context, appConfig)`.
   - Merges the returned `keys` into the running context.
4. The view payload returned to the client has `structuredContent` with
   `{ layout, context: { keys, stepIds, stepData, errors }, _refreshParams }`.
5. The widget bundle (`mcp-app.html`) renders each widget in the layout by
   reading its `WidgetDefinition.requires` against `context.keys`.

## Request flow — federated upstream tool call

1. Client calls `articles_get-article`.
2. mcp-use routes to the handler `UpstreamProxyPlugin.registerForwardedTool`
   registered during `init`.
3. **Static auth** (`none`/`bearer`/`header`) — handler calls the shared
   `staticSession.callTool("get-article", args)`.
4. **oauth2** — handler looks up the per-user session via
   `sessionStore.getSession(userId, proxyName)`. If absent, returns an error
   telling the user to run `<proxy>_authenticate` first.
5. Result passes straight back to the client.

## Request flow — server-internal tool call from a step

Same upstream path, but initiated from a pipeline step, not from the public
RPC surface:

1. Step calls its injected `callTool("articles_get-article", { id })`.
2. `buildProxyAppConfigs` wraps this to `proxy.callUpstream(name, args, userId)`.
3. `callUpstream` strips the `<proxy>_` prefix, resolves the correct session
   (static or per-user oauth2), and calls `session.callTool(bareName, args)`.

**Caveat**: `role-filter` middleware only runs on the public RPC surface.
Step-internal dispatches bypass it. For defence-in-depth on step paths,
add an explicit check in the step.

## Where the parts live

| Concern              | File                                                   |
| -------------------- | ------------------------------------------------------ |
| Server boot + wiring | `packages/core/src/tools/create-framework-app.ts`      |
| Framework tools      | `packages/core/src/tools/register-framework-tools.ts`  |
| View builder tool    | `packages/core/src/tools/register-builder-tool.ts`     |
| Dashboard CRUD tools | `packages/core/src/tools/register-dashboard-tools.ts`  |
| Dashboard store      | `packages/core/src/framework/dashboard-store.ts`       |
| Proxy mounting       | `packages/core/src/tools/register-upstream-proxies.ts` |
| Proxy runtime        | `packages/core/src/proxy/UpstreamProxyPlugin.ts`       |
| Pipeline executor    | `packages/core/src/engine/pipeline-executor.ts`        |
| View rendering       | `packages/core/src/framework/render-view.ts`           |
| Manifest             | `packages/core/src/framework/manifest.ts`              |
