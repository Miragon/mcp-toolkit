import * as React from "react"
import * as ReactDOMClient from "react-dom/client"
import { createRoot } from "react-dom/client"
import { McpToolkitApp } from "@miragon/mcp-toolkit-ui/app"
import { ArticleCard } from "../modules/articles/widgets/ArticleCard.js"
import "./main.css"

// Expose the host's React + ReactDOM on globalThis so upstream-hosted widget
// bundles can import them through the `<script type="importmap">` shim in
// index.html. The shim re-exports `globalThis.React` / `globalThis.ReactDOM`,
// guaranteeing the widget mounts against the same React instance as the host
// (hooks + context rely on instance identity, not just version parity).
Object.assign(globalThis, { React, ReactDOM: ReactDOMClient })

// Host-bundled widget registry. Upstream-hosted widgets (e.g. the customers
// module) are fetched at runtime via the toolkit's default widget loader
// (`read-widget-bundle`), so they don't need to be listed here.
const widgets = {
  "articles:article-card": ArticleCard,
}

const root = document.getElementById("root")
if (!root) throw new Error("missing #root")
createRoot(root).render(<McpToolkitApp widgets={widgets} />)
