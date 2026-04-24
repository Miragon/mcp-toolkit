import { defineConfig } from "vite"
import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Builds the remote widget as a single ES module with `react` and
 * `react/jsx-runtime` externalised. The host resolves those imports through
 * its own import map (see `examples/app-bundle/index.html`), so the widget
 * mounts against the host's React instance instead of shipping its own.
 *
 * Output is a single file — `dist/customer-card.js` — that the mock server
 * reads at startup and serves as the `ui://customers/customer-card.js`
 * MCP resource.
 */
export default defineConfig({
  root: here,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: path.resolve(here, "CustomerCard.tsx"),
      formats: ["es"],
      fileName: () => "customer-card.js",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
      output: { inlineDynamicImports: true },
    },
    target: "es2022",
    minify: false,
  },
  plugins: [react()],
})
