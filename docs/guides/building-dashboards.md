# Building dashboards end-to-end

This guide walks through the full render → build → save → reload loop
against the example host in `examples/host`.

## 1. Enable the builder and wire the dashboard store

The visual builder + dashboard persistence are **opt-in** — pass
`app: { builder: true }`. Without it, only the always-on core
(`render-view` / widgets) is registered. With `builder` on,
`createFrameworkApp` installs an in-memory store by default; for real
persistence, pass a filesystem (or custom) store:

```ts
import { createFrameworkApp, createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"

const app = await createFrameworkApp({
  // … other options …
  app: {
    resourceUri: "ui://example/mcp-app.html",
    htmlPath: "/abs/path/to/mcp-app.html",
    builder: true, // opt into the builder + dashboard CRUD (off by default)
    dashboardStore: createFileSystemDashboardStore({ dir: ".dashboards" }),
  },
})
```

When `builder` is `true` the toolkit registers `save-dashboard`,
`list-dashboards`, `load-dashboard`, and `delete-dashboard` against the
store, plus the app-only `get-builder-catalogue` tool that powers the
in-iframe builder. With `builder` off (the default) none of these are
registered and `dashboardStore` is ignored.

## 2. Render a view (LLM)

The LLM calls plain `render-view`:

```jsonc
{
  "keys": { "sales:customerId": "C-1" },
  "steps": [{ "id": "customer", "step": "sales:load-customer" }],
  "layout": { "rows": [{ "row": [{ "widget": "sales:customer-card", "span": 6 }] }] },
  "title": "Customer overview",
}
```

The response is small — just the rendered context plus the layout. The
catalogue is **not** included; the LLM doesn't need it.

## 3. Switch into Build (user)

In the iframe toolbar there's a **Build** button (pencil icon). Click
it and the renderer flips into the LayoutBuilder. The builder fetches
its own catalogue via the app-only `get-builder-catalogue` tool — the
LLM never sees this round-trip.

In Build mode you have three tabs:

- **Layout** — palette + canvas. Click or drag widgets, set span per
  cell, add/remove/reorder rows, manage tabs.
- **Pipeline** — keys + steps editor. Auto-applies on edit (debounced).
- **Preview** — pure rendered output, no chrome.

A right-side **Catalogue** sheet (toolbar button) shows all keys with
producer/consumer attribution and lists widgets that aren't reachable
yet, with one-click "Add producing step" actions.

## 4. Finish

- **Done** — exits Build mode, swaps back to the rendered view with the
  layout you just built.
- **Save dashboard** — prompts for a name + optional description, then
  calls `save-dashboard`. Returns `{ id, name, createdAt, updatedAt }`
  (plus `unknownWidgets` as a non-fatal warning when the layout
  references widget ids the server doesn't know).

The user's draft layout is local until they click Done or Save —
nothing leaks back to the LLM mid-edit.

## 5. Recall

From a later session, the LLM (or an admin UI) can:

```jsonc
// 1. list what's there
{ "name": "list-dashboards", "arguments": {} }

// 2. load a specific one
{ "name": "load-dashboard", "arguments": { "id": "…" } }

// 3. pipe straight into render-view
{
  "name": "render-view",
  "arguments": { "keys": …, "steps": …, "layout": …, "title": … }
}
```

Because `load-dashboard` returns exactly the shape `render-view`
accepts, steps 2 and 3 need no translation.

## Testing locally

```sh
# One command: build the widget bundle, then boot the host.
pnpm --filter @miragon/mcp-toolkit-examples start

# In another shell — render a view (LLM-style call)
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"render-view",
                 "arguments":{
                   "keys":{"articles:articleId":"1"},
                   "steps":[{"id":"article","step":"articles:resolve-article"}],
                   "layout":{"rows":[{"row":[{"widget":"articles:article-card","span":6}]}]}
                 }}}' | jq
```

Open the resulting MCP UI in an MCP-capable host. You'll see the
rendered widget; click **Build** in the toolbar to enter Build mode
and edit the layout interactively.

## See also

- [Concept: view builder](../concepts/view-builder.md)
- [Layout and rendering](layout-and-rendering.md)
