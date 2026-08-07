import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Builds the widget bundle as one ES module + one stylesheet
 * (`dist/mcp-app.js` / `dist/mcp-app.css`) that the host hands to
 * `createFrameworkApp`'s `app.bundle`. Since the native-views move, mcp-use
 * synthesizes the view HTML documents itself and embeds these two files
 * inline — the build must NOT emit an HTML entry or split chunks: the view
 * resource is served over MCP, there is no second HTTP request for assets.
 */
export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Fonts/images must ride inside the css/js as data URLs — the inline view
    // document has no asset route to serve them from.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(here, "main.tsx"),
      output: {
        entryFileNames: "mcp-app.js",
        assetFileNames: "mcp-app.[ext]",
        // One file each: the inline view document cannot load extra chunks.
        inlineDynamicImports: true,
      },
    },
  },
})
