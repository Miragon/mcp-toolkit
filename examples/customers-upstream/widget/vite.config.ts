import { defineConfig } from "vite"
import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Builds the remote widget as a single ES module with every shared runtime
 * externalised: React, `mcp-use/react`, the `@miragon/mcp-toolkit-ui` barrels,
 * and `@tanstack/react-query`. The host resolves those bare imports through
 * its import map (see `examples/app-bundle/index.html` + the
 * `sharedRuntimeImportMap` plugin), so the widget mounts against the host's
 * module instances instead of shipping its own — which is what lets it use
 * `useCallTool` interactively. Runtimes the widget actually imports must be
 * declared in the module manifest (`runtime.toolkitUi` here); externalising
 * more than you import is harmless.
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
      external: [
        "react",
        "react/jsx-runtime",
        "react-dom",
        "react-dom/client",
        "mcp-use/react",
        "@miragon/mcp-toolkit-ui",
        "@miragon/mcp-toolkit-ui/app",
        "@miragon/mcp-toolkit-ui/hooks",
        "@tanstack/react-query",
      ],
      output: { inlineDynamicImports: true },
    },
    target: "es2022",
    minify: false,
  },
  plugins: [react()],
})
