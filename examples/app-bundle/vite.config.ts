import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Builds the widget bundle as a single self-contained `index.html` that the
 * host serves via `createFrameworkApp`'s `app.htmlPath`. Inlining matters
 * here: the Inspector renders the HTML inside an iframe fed from the MCP
 * resource content — there is no second HTTP request for chunks.
 */
export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
})
