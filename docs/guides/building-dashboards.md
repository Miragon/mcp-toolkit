# Building dashboards end-to-end

This guide walks through the full builder → save → reload loop against
the example host in `examples/host`.

## 1. Wire the dashboard store

`createFrameworkApp` installs an in-memory store by default. For real
persistence, pass a filesystem (or custom) store:

```ts
import { createFrameworkApp, createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"

const app = await createFrameworkApp({
  // … other options …
  app: {
    resourceUri: "ui://example/mcp-app.html",
    htmlPath: "/abs/path/to/mcp-app.html",
    dashboardStore: createFileSystemDashboardStore({ dir: ".dashboards" }),
  },
})
```

The toolkit registers `save-dashboard`, `list-dashboards`, `load-dashboard`,
and `delete-dashboard` against the store.

## 2. Open the builder

The LLM calls `open-view-builder` with the same shape as `render-view`:

```jsonc
{
  "keys": { "sales:customerId": "C-1" },
  "steps": [{ "id": "customer", "step": "sales:load-customer" }],
  "title": "Customer overview",
}
```

The response's `structuredContent.mode` is `"builder"` and
`structuredContent.reachableWidgets` lists widgets whose `requires` are
satisfied by the keys the pipeline will expose. `McpAppView` branches on
`mode` and renders `<LayoutBuilder>` instead of `<WidgetRenderer>`.

## 3. Compose in the UI

In the builder:

- Click a widget in the palette (left) to drop it into the focused row.
- Adjust each cell's **span** (1–12) with the ± buttons.
- Use **Add row** to append rows; reorder with the row-level arrows.
- Use **Add tab** to switch into tabs mode; the existing rows become the
  first tab.
- Use **Remove tab** to drop a tab; removing down to one tab collapses
  back into flat-rows mode automatically.

The canvas is WYSIWYG — each cell renders the actual widget with the
live pipeline data, so what you assemble matches what `render-view`
will produce.

## 4. Finish

- **Render view** — calls `render-view` with the current draft and swaps
  the iframe into the rendered view (same experience as if the LLM had
  picked the layout itself).
- **Save dashboard** — prompts for a name + optional description, then
  calls `save-dashboard`. Returns `{ id, createdAt, updatedAt }`.

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

Because `load-dashboard` returns exactly the shape `render-view` accepts,
steps 2 and 3 need no translation.

## Testing locally

```sh
# Build + start the example host
pnpm -r build
pnpm --filter host start

# In another shell — open the builder
curl -sX POST http://localhost:3010/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"open-view-builder",
                 "arguments":{"keys":{"articles:articleId":"1"},
                              "steps":[{"id":"article","step":"articles:resolve-article"}]}}}' | jq
```

`structuredContent.reachableWidgets` should list `articles:article-card`
once the step has run. Open the MCP UI in an MCP-capable host to
interact with the builder visually.

## See also

- [Concept: view builder](../concepts/view-builder.md)
- [Layout and rendering](layout-and-rendering.md)
