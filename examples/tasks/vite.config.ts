import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The MCP server `pnpm serve` starts (it binds 127.0.0.1, on PORT or 4000).
const mcpServer = `http://127.0.0.1:${process.env.PORT ?? 4000}`

export default defineConfig({
  plugins: [react()],
  // The browser calls /mcp on the dev server's own origin, so the MCP server needs no CORS.
  server: { proxy: { "/mcp": mcpServer } },
})
