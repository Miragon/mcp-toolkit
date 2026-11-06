import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"

const root = document.getElementById("root")
if (root === null) throw new Error("index.html has no #root element")

// The app brings its own QueryClient; the generated hooks only need the caller on top of it.
const queryClient = new QueryClient()

// Same origin: the Vite dev server proxies /mcp to the MCP server (vite.config.ts).
const mcpUrl = new URL("/mcp", location.origin).href

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App mcpUrl={mcpUrl} />
    </QueryClientProvider>
  </StrictMode>,
)
