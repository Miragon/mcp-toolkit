import { useMemo } from "react"
import * as React from "react"
import * as ReactDOMClient from "react-dom/client"
import { createRoot } from "react-dom/client"
import { McpUseProvider, useWidget } from "mcp-use/react"
import { McpAppView, createRemoteWidgetLoader } from "@miragon/mcp-toolkit-ui/app"
import { ArticleCard } from "../modules/articles/widgets/ArticleCard.js"
import "./main.css"

// Expose the host's React + ReactDOM on globalThis so upstream-hosted widget
// bundles can import them through the `<script type="importmap">` shim in
// index.html. The shim re-exports `globalThis.React` / `globalThis.ReactDOM`,
// guaranteeing the widget mounts against the same React instance as the host
// (hooks + context rely on instance identity, not just version parity).
Object.assign(globalThis, { React, ReactDOM: ReactDOMClient })

// Host-bundled widget registry. Upstream-hosted widgets (e.g. the customers
// module) are resolved at runtime via `widgetLoader` instead of being listed
// here.
const widgets = {
  "articles:article-card": ArticleCard,
}

function App() {
  const { callTool } = useWidget()
  const widgetLoader = useMemo(
    () =>
      createRemoteWidgetLoader({
        fetchResource: async (id) => {
          const res = await callTool("read-widget-bundle", { id })
          const source = (res.structuredContent as { source?: string } | undefined)?.source
          if (typeof source !== "string") {
            throw new Error(`read-widget-bundle returned no source for "${id}"`)
          }
          return source
        },
      }),
    [callTool],
  )
  return <McpAppView widgets={widgets} widgetLoader={widgetLoader} />
}

const root = document.getElementById("root")
if (!root) throw new Error("missing #root")
createRoot(root).render(
  <McpUseProvider>
    <App />
  </McpUseProvider>,
)
